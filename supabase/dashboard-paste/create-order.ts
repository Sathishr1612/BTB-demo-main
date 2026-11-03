// create-order: single-file version for pasting into the Supabase dashboard editor.
// Generated from functions/_shared/common.ts + functions/create-order/index.ts. Edit the originals, not this file.
// Shared helpers for the BTB Edge Functions. Secrets come from `supabase secrets set` - never from the browser.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const env = (k: string) => Deno.env.get(k) ?? "";

const ORIGIN = env("SITE_ORIGIN") || "*"; // set SITE_ORIGIN=https://your-site to restrict browser calls
export const corsHeaders = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Service-role client: bypasses RLS. Server-side only. */
export const adminClient = () =>
  createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

/** Client that acts as the caller (their user JWT, or anon), so RLS and auth.uid() apply. */
export const userClient = (req: Request) => {
  const auth = req.headers.get("Authorization") ?? "";
  // Signed-out browsers send the publishable key here, which is not a user JWT: treat them as anon.
  return createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false }, global: { headers: auth.startsWith("Bearer ey") ? { Authorization: auth } : {} },
  });
};

/** Resolve the signed-in user from the request's JWT, or null. */
export async function getUser(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
    auth: { persistSession: false }, global: { headers: { Authorization: auth } },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user;
}

const enc = new TextEncoder();
export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Call the Razorpay REST API with the Key Secret (server-side only). */
export async function razorpay(path: string, init: { method?: string; body?: unknown } = {}) {
  const id = env("RAZORPAY_KEY_ID"), secret = env("RAZORPAY_KEY_SECRET");
  if (!id || !secret) throw new Error("Razorpay keys are not configured on the server");
  const res = await fetch("https://api.razorpay.com/v1" + path, {
    method: init.method ?? "GET",
    headers: { Authorization: "Basic " + btoa(id + ":" + secret), "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Razorpay error " + res.status + ": " + (data?.error?.description ?? "unknown"));
  return data;
}

export const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
// POST { course_id, batch_time? }  or  POST { ebook_id }   (signed-in student)
// -> creates a Razorpay order priced from the DATABASE, never from the browser.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    const body = await req.json().catch(() => ({}));
    const isEbook = body.ebook_id !== undefined && body.ebook_id !== null;
    if (!isUuid(isEbook ? body.ebook_id : body.course_id)) return json({ error: isEbook ? "Invalid ebook." : "Invalid course." }, 400);

    const db = adminClient();
    let product: { id: string; title: string; price_paise: number };
    let batch: string | null = null;

    if (isEbook) {
      const { data: eb } = await db.from("ebooks").select("id,title,price_paise,status,file_path").eq("id", body.ebook_id).maybeSingle();
      if (!eb || eb.status !== "published" || !eb.file_path) return json({ error: "This ebook is not available." }, 404);
      if (!eb.price_paise || eb.price_paise <= 0) return json({ error: "This ebook is free; no payment is needed." }, 400);
      const { data: owned } = await db.from("ebook_purchases").select("id").eq("user_id", user.id).eq("ebook_id", eb.id).maybeSingle();
      if (owned) return json({ error: "You already own this ebook." }, 409);
      product = eb;
    } else {
      const { data: course } = await db.from("courses").select("id,title,price_paise,status,batch_times").eq("id", body.course_id).maybeSingle();
      if (!course || course.status !== "published") return json({ error: "This course is not available." }, 404);
      if (!course.price_paise || course.price_paise <= 0) return json({ error: "This course is free; no payment is needed." }, 400);

      // If the course offers batch times, the student must pick one of them. Checked here, not in the browser.
      const options = String(course.batch_times ?? "").split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean);
      if (options.length) {
        const picked = typeof body.batch_time === "string" ? body.batch_time.trim() : "";
        if (!options.includes(picked)) return json({ error: "Please choose a batch time." }, 400);
        batch = picked;
      }
      const { data: enrolled } = await db.from("enrollments").select("id").eq("user_id", user.id).eq("course_id", course.id).maybeSingle();
      if (enrolled) return json({ error: "You already have access to this course." }, 409);
      product = course;
    }
    if (product.price_paise < 100) return json({ error: "This item cannot be sold online right now." }, 400); // Razorpay minimum is Rs 1

    const col = isEbook ? "ebook_id" : "course_id";
    const name = (user.user_metadata?.full_name as string | undefined) ?? "";
    const reply = (rzpOrderId: string) => json({
      key_id: env("RAZORPAY_KEY_ID"), razorpay_order_id: rzpOrderId, amount: product.price_paise, currency: "INR",
      course_title: product.title, email: user.email ?? "", name,
    });

    // Re-use an open order for the same product and price instead of piling up new ones (this is also how a retry works).
    const { data: open } = await db.from("orders").select("id,razorpay_order_id,amount_paise")
      .eq("user_id", user.id).eq(col, product.id).in("status", ["created", "pending", "failed", "cancelled"])
      .not("razorpay_order_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (open && open.amount_paise === product.price_paise) {
      await db.from("orders").update({ status: "created", batch_choice: batch }).eq("id", open.id);
      return reply(open.razorpay_order_id);
    }

    const { data: row, error: insErr } = await db.from("orders").insert({
      user_id: user.id, [col]: product.id, student_email: user.email, student_name: name || null,
      amount_paise: product.price_paise, currency: "INR", status: "created", batch_choice: batch,
    }).select("id").single();
    if (insErr || !row) throw new Error("Could not create the order record");

    try {
      const rzp = await razorpay("/orders", { method: "POST", body: {
        amount: product.price_paise, currency: "INR", receipt: row.id.slice(0, 40),
        notes: { order_id: row.id, [col]: product.id, user_id: user.id },
      } });
      await db.from("orders").update({ razorpay_order_id: rzp.id }).eq("id", row.id);
      return reply(rzp.id);
    } catch (e) {
      await db.from("orders").delete().eq("id", row.id); // nothing was charged; drop the empty record
      throw e;
    }
  } catch (e) {
    console.error("create-order", e);
    return json({ error: "Could not start the payment. Please try again." }, 500);
  }
});
