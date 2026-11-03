// r2-video: single-file version for pasting into the Supabase dashboard editor.
// Generated from functions/_shared/common.ts + functions/r2-video/index.ts. Edit the originals, not this file.
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
// Lesson videos stored in Cloudflare R2 (no egress fees). The R2 keys live only in server secrets.
// POST { action: "play",   path }  -> anyone; returns a 2 h signed GET link only if can_stream_video_path() allows the caller
//                                     (free course, preview lesson, enrolled student or admin - the same rule as Supabase Storage).
// POST { action: "upload", path }  -> admins only; returns a 1 h signed PUT link for a new file.
// POST { action: "delete", path }  -> admins only; deletes the file.
// Paths are stored in videos.video_storage_path as "r2:{course_id}/{video_id}/{random}.mp4".
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
import { AwsClient } from "npm:aws4fetch@1.0.20";

const PATH_RE = /^r2:[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9_-]+\.(mp4|webm)$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    const path = String(b.path ?? "");
    if (!PATH_RE.test(path)) return json({ error: "Invalid video path." }, 400);

    const account = env("R2_ACCOUNT_ID"), bucket = env("R2_BUCKET");
    if (!account || !bucket || !env("R2_ACCESS_KEY_ID") || !env("R2_SECRET_ACCESS_KEY")) throw new Error("R2 secrets are not configured");
    const r2 = new AwsClient({ accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY"), service: "s3", region: "auto" });
    const url = `https://${account}.r2.cloudflarestorage.com/${bucket}/${path.slice(3)}`;
    const presign = async (method: string, seconds: number) =>
      (await r2.sign(new Request(url + "?X-Amz-Expires=" + seconds, { method }), { aws: { signQuery: true } })).url;

    // Access is decided by the database functions, called as the requesting user (or anon).
    const db = userClient(req);

    if (b.action === "play") {
      const { data: allowed, error } = await db.rpc("can_stream_video_path", { p_path: path });
      if (error) throw error;
      if (!allowed) return json({ error: "You do not have access to this lesson." }, 403);
      return json({ url: await presign("GET", 7200) });
    }

    const { data: admin, error: aErr } = await db.rpc("is_admin");
    if (aErr) throw aErr;
    if (!admin) return json({ error: "Admins only." }, 403);

    if (b.action === "upload") return json({ url: await presign("PUT", 3600) });
    if (b.action === "delete") {
      const res = await r2.fetch(url, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error("R2 delete failed: " + res.status);
      return json({ deleted: true });
    }
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    console.error("r2-video", e);
    return json({ error: "The video service is not available right now. Please try again." }, 500);
  }
});
