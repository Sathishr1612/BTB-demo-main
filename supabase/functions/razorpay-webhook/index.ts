// Razorpay -> server webhook. Deploy with JWT verification disabled (see supabase/config.toml); authenticity comes from the
// X-Razorpay-Signature HMAC of the raw body using RAZORPAY_WEBHOOK_SECRET.
// Idempotent: duplicates are ignored via webhook_events, and fulfill_order itself is safe to replay.
import { adminClient, env, hmacHex, safeEqual } from "../_shared/common.ts";

const ok = (m = "ok") => new Response(m, { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = env("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) { console.error("RAZORPAY_WEBHOOK_SECRET is not set"); return new Response("Not configured", { status: 500 }); }

  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!sig || !safeEqual(await hmacHex(secret, raw), sig.toLowerCase())) return new Response("Invalid signature", { status: 400 });

  try {
    const evt = JSON.parse(raw);
    const eventId = req.headers.get("x-razorpay-event-id") ?? "";
    const db = adminClient();
    if (eventId) {
      const { data: seen } = await db.from("webhook_events").select("event_id").eq("event_id", eventId).maybeSingle();
      if (seen) return ok("duplicate");
    }

    const pay = evt?.payload?.payment?.entity;
    const rzpOrder: string | undefined = pay?.order_id ?? evt?.payload?.order?.entity?.id;

    if ((evt.event === "payment.captured" || evt.event === "order.paid") && pay && rzpOrder) {
      const { data: result, error } = await db.rpc("fulfill_order", {
        p_rzp_order: rzpOrder, p_rzp_payment: pay.id, p_amount: pay.amount, p_currency: pay.currency, p_method: pay.method ?? null,
      });
      if (error) throw error;
      if (result === "amount_mismatch") console.error("webhook amount mismatch", rzpOrder, pay.id);
    } else if (evt.event === "payment.failed" && pay && rzpOrder) {
      const { error } = await db.rpc("record_failed_payment", {
        p_rzp_order: rzpOrder, p_rzp_payment: pay.id, p_amount: pay.amount, p_method: pay.method ?? null, p_error: pay.error_description ?? "Payment failed",
      });
      if (error) throw error;
    } else if (evt.event === "payment.authorized" && rzpOrder) {
      await db.from("orders").update({ status: "pending" }).eq("razorpay_order_id", rzpOrder).in("status", ["created", "failed", "cancelled"]);
    }

    if (eventId) await db.from("webhook_events").upsert({ event_id: eventId, event: evt.event }, { onConflict: "event_id", ignoreDuplicates: true });
    return ok();
  } catch (e) {
    console.error("razorpay-webhook", e);
    return new Response("Error", { status: 500 }); // non-2xx makes Razorpay retry
  }
});
