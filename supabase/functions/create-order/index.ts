// POST { course_id, batch_time? }  or  POST { ebook_id }   (signed-in student)
// -> creates a Razorpay order priced from the DATABASE, never from the browser.
import { adminClient, corsHeaders, env, getUser, isUuid, json, razorpay } from "../_shared/common.ts";

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
