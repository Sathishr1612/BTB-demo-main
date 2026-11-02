// verify-payment: single-file version for pasting into the Supabase dashboard editor.
// Generated from functions/_shared/common.ts + functions/verify-payment/index.ts. Edit the originals, not this file.
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

// POST { razorpay_order_id, razorpay_payment_id, razorpay_signature }  -> verifies the Checkout result on the server.
// POST { razorpay_order_id, cancelled: true }                           -> marks an abandoned checkout as cancelled.
// A success message from the browser is NEVER trusted: access is only granted after (1) the HMAC signature matches and
// (2) Razorpay's own API confirms the payment is captured for the right order and amount.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    const b = await req.json().catch(() => ({}));
    const rzpOrder = String(b.razorpay_order_id ?? "");
    if (!/^order_[A-Za-z0-9]+$/.test(rzpOrder)) return json({ error: "Invalid order." }, 400);

    const db = adminClient();
    const { data: order } = await db.from("orders").select("id,user_id,status,amount_paise").eq("razorpay_order_id", rzpOrder).maybeSingle();
    if (!order || order.user_id !== user.id) return json({ error: "Order not found." }, 404);

    if (b.cancelled === true) {
      await db.from("orders").update({ status: "cancelled" }).eq("id", order.id).in("status", ["created", "pending", "failed"]);
      return json({ status: "cancelled" });
    }

    const payId = String(b.razorpay_payment_id ?? ""), sig = String(b.razorpay_signature ?? "");
    if (!/^pay_[A-Za-z0-9]+$/.test(payId) || !sig) return json({ error: "Invalid payment details." }, 400);
    const expected = await hmacHex(env("RAZORPAY_KEY_SECRET"), rzpOrder + "|" + payId);
    if (!safeEqual(expected, sig.toLowerCase())) return json({ error: "Payment signature could not be verified." }, 400);

    // Second, independent check straight from Razorpay.
    const pay = await razorpay("/payments/" + payId);
    if (pay.order_id !== rzpOrder) return json({ error: "Payment does not belong to this order." }, 400);

    if (pay.status === "captured") {
      const { data: result, error } = await db.rpc("fulfill_order", {
        p_rzp_order: rzpOrder, p_rzp_payment: payId, p_amount: pay.amount, p_currency: pay.currency, p_method: pay.method ?? null,
      });
      if (error) throw error;
      if (result === "amount_mismatch") {
        console.error("verify-payment amount mismatch", rzpOrder, payId);
        return json({ error: "Payment amount did not match the order. Please contact support." }, 409);
      }
      return json({ status: "paid" });
    }
    if (pay.status === "authorized") { // bank approved but not captured yet; the webhook will finish it
      await db.from("orders").update({ status: "pending" }).eq("id", order.id).in("status", ["created", "failed", "cancelled"]);
      return json({ status: "pending" });
    }
    await db.rpc("record_failed_payment", { p_rzp_order: rzpOrder, p_rzp_payment: payId, p_amount: pay.amount, p_method: pay.method ?? null, p_error: pay.error_description ?? "Payment failed" });
    return json({ status: "failed" });
  } catch (e) {
    console.error("verify-payment", e);
    return json({ error: "Could not confirm the payment right now. If money was deducted, access will unlock automatically once the bank confirms it." }, 500);
  }
});
