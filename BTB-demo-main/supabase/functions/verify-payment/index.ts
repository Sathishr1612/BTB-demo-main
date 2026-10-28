// POST { razorpay_order_id, razorpay_payment_id, razorpay_signature }  -> verifies the Checkout result on the server.
// POST { razorpay_order_id, cancelled: true }                           -> marks an abandoned checkout as cancelled.
// A success message from the browser is NEVER trusted: access is only granted after (1) the HMAC signature matches and
// (2) Razorpay's own API confirms the payment is captured for the right order and amount.
import { adminClient, corsHeaders, env, getUser, hmacHex, json, razorpay, safeEqual } from "../_shared/common.ts";

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
