// POST { course_id }  (signed-in student) -> creates a Razorpay order priced from the DATABASE, never from the browser.
import { adminClient, corsHeaders, env, getUser, isUuid, json, razorpay } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Please sign in to continue." }, 401);
    const { course_id, batch_time } = await req.json().catch(() => ({}));
    if (!isUuid(course_id)) return json({ error: "Invalid course." }, 400);

    const db = adminClient();
    const { data: course } = await db.from("courses").select("id,title,price_paise,status,batch_times").eq("id", course_id).maybeSingle();
    if (!course || course.status !== "published") return json({ error: "This course is not available." }, 404);
    if (!course.price_paise || course.price_paise <= 0) return json({ error: "This course is free; no payment is needed." }, 400);

    // If the course offers batch times, the student must pick one of them. Checked here, not in the browser.
    const options = String(course.batch_times ?? "").split(/\r?\n/).map((x: string) => x.trim()).filter(Boolean);
    let batch: string | null = null;
    if (options.length) {
      const picked = typeof batch_time === "string" ? batch_time.trim() : "";
      if (!options.includes(picked)) return json({ error: "Please choose a batch time." }, 400);
      batch = picked;
    }

    const { data: enrolled } = await db.from("enrollments").select("id").eq("user_id", user.id).eq("course_id", course.id).maybeSingle();
    if (enrolled) return json({ error: "You already have access to this course." }, 409);

    const name = (user.user_metadata?.full_name as string | undefined) ?? "";
    const reply = (rzpOrderId: string) => json({
      key_id: env("RAZORPAY_KEY_ID"), razorpay_order_id: rzpOrderId, amount: course.price_paise, currency: "INR",
      course_title: course.title, email: user.email ?? "", name,
    });

    // Re-use an open order for the same course and price instead of piling up new ones.
    const { data: open } = await db.from("orders").select("id,razorpay_order_id,amount_paise")
      .eq("user_id", user.id).eq("course_id", course.id).in("status", ["created", "pending", "failed", "cancelled"])
      .not("razorpay_order_id", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (open && open.amount_paise === course.price_paise) {
      await db.from("orders").update({ status: "created", batch_choice: batch }).eq("id", open.id);
      return reply(open.razorpay_order_id);
    }

    const { data: row, error: insErr } = await db.from("orders").insert({
      user_id: user.id, course_id: course.id, student_email: user.email, student_name: name || null,
      amount_paise: course.price_paise, currency: "INR", status: "created", batch_choice: batch,
    }).select("id").single();
    if (insErr || !row) throw new Error("Could not create the order record");

    try {
      const rzp = await razorpay("/orders", { method: "POST", body: {
        amount: course.price_paise, currency: "INR", receipt: row.id.slice(0, 40),
        notes: { order_id: row.id, course_id: course.id, user_id: user.id },
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
