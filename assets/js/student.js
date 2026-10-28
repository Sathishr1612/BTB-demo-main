/* BTB Academy - student accounts, course entitlement checks and Razorpay checkout.
   Exposes window.BTBStudent. The browser only OPENS checkout and forwards Razorpay's result to the server;
   prices come from the database and access is granted by the Edge Functions after server-side verification. */
(function () {
  "use strict";
  var B = window.BTB, S = (window.BTBStudent = {});

  S.formatPrice = function (paise) {
    if (!paise) { return "Free"; }
    var r = paise / 100;
    return "₹" + r.toLocaleString("en-IN", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
  };

  /* Only allow redirects to pages of this site (blocks open-redirect via ?next=). */
  S.safeNext = function (next) {
    return /^[a-z0-9-]+\.html(\?[A-Za-z0-9_=&%.\-]*)?$/i.test(next || "") ? next : "";
  };
  S.loginUrl = function () {
    var here = window.location.pathname.split("/").pop() + window.location.search;
    return "account.html?next=" + encodeURIComponent(here);
  };

  S.user = async function () {
    if (!B.db) { return null; }
    var s = await B.db.auth.getSession();
    return (s.data && s.data.session && s.data.session.user) || null;
  };

  /* Does the signed-in student own this course? (RLS lets a student read only their own enrollments.) */
  S.isEnrolled = async function (courseId) {
    var u = await S.user(); if (!u) { return false; }
    var r = await B.db.from("enrollments").select("id").eq("user_id", u.id).eq("course_id", courseId).limit(1);
    if (r.error) { throw r.error; }
    return r.data.length > 0;
  };

  /* Free course, or enrolled. Admins are checked by RLS at the storage layer, so they pass there too. */
  S.hasAccess = async function (course) {
    if (!course.price_paise) { return true; }
    return S.isEnrolled(course.id);
  };

  var rzpLoading = null;
  function loadCheckout() {
    if (window.Razorpay) { return Promise.resolve(); }
    if (rzpLoading) { return rzpLoading; }
    rzpLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = resolve;
      s.onerror = function () { rzpLoading = null; reject(new Error("Could not load the payment window. Check your connection or ad-blocker and try again.")); };
      document.head.appendChild(s);
    });
    return rzpLoading;
  }

  async function call(fn, body) {
    var r = await B.db.functions.invoke(fn, { body: body });
    if (r.error) {
      var msg = "";
      try { var j = await r.error.context.json(); msg = j && j.error; } catch (e) { /* not JSON */ }
      throw new Error(msg || "The payment service is not reachable right now.");
    }
    return r.data;
  }

  /* Start a purchase. Resolves {status:"paid"|"pending"|"failed"|"cancelled"}. Rejects with a readable Error. */
  S.buy = async function (course, opts) {
    var u = await S.user();
    if (!u) { window.location.href = S.loginUrl(); return new Promise(function () { /* navigating */ }); }
    var order = await call("create-order", { course_id: course.id, batch_time: (opts && opts.batch_time) || "" });
    await loadCheckout();
    return new Promise(function (resolve, reject) {
      var settled = false;
      var rzp = new window.Razorpay({
        key: order.key_id,
        order_id: order.razorpay_order_id,
        amount: order.amount, currency: order.currency,
        name: B.config.academyName, description: order.course_title,
        prefill: { name: order.name, email: order.email },
        theme: { color: "#3b2a8c" },
        handler: function (resp) {
          settled = true;
          call("verify-payment", {
            razorpay_order_id: resp.razorpay_order_id,
            razorpay_payment_id: resp.razorpay_payment_id,
            razorpay_signature: resp.razorpay_signature
          }).then(resolve, reject);
        },
        modal: {
          ondismiss: function () {
            if (settled) { return; }
            settled = true;
            call("verify-payment", { razorpay_order_id: order.razorpay_order_id, cancelled: true }).catch(function () { /* best effort */ });
            resolve({ status: "cancelled" });
          }
        }
      });
      rzp.on("payment.failed", function () { /* the customer can retry inside the window; the webhook records the failure */ });
      rzp.open();
    });
  };

  S.statusLabel = function (s) {
    return ({ paid: "Paid", pending: "Awaiting confirmation", created: "Not completed", failed: "Failed", cancelled: "Cancelled" })[s] || s;
  };

  /* Header link: "Student Login" becomes "My Courses" when signed in. */
  S.updateNav = async function () {
    var links = B.$$('a[data-student-link]');
    if (!links.length) { return; }
    try { if (await S.user()) { links.forEach(function (a) { a.textContent = "My Courses"; }); } } catch (e) { /* ignore */ }
  };
})();
