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
