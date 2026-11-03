# BTB Academy - Complete Project Documentation

Break the Barriers Academy (BTB Academy) is an online spoken-English and communication academy.
This document is written from the **actual project files** (HTML, CSS, JavaScript, Supabase SQL, Edge Functions).
It separates what is **Implemented**, **Partial**, **Planned** and **Needs configuration**.
No keys, passwords or student data are included.

Status labels used everywhere:

| Label | Meaning |
|---|---|
| IMPLEMENTED | The code exists in the project |
| PARTIAL | Some of it exists; the rest is missing |
| NOT TESTED | Code exists but a full end-to-end test has not been completed yet |
| PLANNED | Not in the code; would need new development |

> **Honest status note.** The payment backend is built and deployed in Razorpay **Test Mode**. At the time of writing, one full
> successful test payment (pay -> "Payment successful" -> course appears in My Courses) has **not yet been confirmed**. Cancelling a
> payment has been confirmed. Treat the payment flow as **NOT TESTED end to end** until that test passes.

---

## 1. Project overview

**What it is.** A website where students learn spoken English through recorded video courses, live online classes, and downloadable ebooks.

**Problem it solves.** Many learners lack confidence speaking English. BTB Academy gives structured lessons, live practice with a trainer, and study material, with online payment and a private student area.

**Target users**
- Students and job seekers who want better spoken English.
- Working professionals who need confident communication.
- The academy owner/admin who manages content and sees payments.

**Products sold**

| Product | How it is sold | Status |
|---|---|---|
| Recorded video course | One-time payment, then access to lessons | IMPLEMENTED (needs more content) |
| Live Batch class (group) | Sold as a course with `delivery = live`, price Rs 4,999 (2 months) | PARTIAL (sold; class delivery not built) |
| Cluster class (small group) | Same as above, Rs 9,999 (2 months) | PARTIAL |
| Personal Training (one-to-one) | Same as above, Rs 19,999 (2 months) | PARTIAL |
| Ebook / PDF | One-time payment, secure download | IMPLEMENTED (no ebook published yet) |

**Revenue.** Course and ebook sales through Razorpay. Live-class bookings also arrive as enquiries (Bookings page).

```
                        BTB ACADEMY
   +------------------+   +------------------+   +------------------+
   |  Recorded video  |   |   Live classes   |   |      Ebooks      |
   |     courses      |   | Batch / Cluster  |   |    PDF / EPUB    |
   |                  |   | / Personal       |   |                  |
   +---------+--------+   +---------+--------+   +---------+--------+
             \                      |                      /
              \                     |                     /
               +--------- Checkout + Razorpay ------------+
                                    |
                      Student account  (My Courses,
                       My Ebooks, Payment history)
                                    |
                      Admin dashboard (owner controls)
```

---

## 2. Technology stack and roles

| Technology | Role in this project |
|---|---|
| HTML, CSS, JavaScript (Bootstrap, Bootstrap Icons) | The website the student sees. No framework. |
| Supabase Auth | Student and admin sign-in, sessions, password reset |
| Supabase PostgreSQL | All records: courses, modules, videos, orders, payments, enrolments, ebooks, bookings |
| Supabase Row Level Security (RLS) | Database rules: who may read or write each row |
| Supabase Storage | Files: videos (private), ebooks (private), thumbnails (public) |
| Supabase Edge Functions | Server code that talks to Razorpay: `create-order`, `verify-payment`, `razorpay-webhook` |
| Razorpay | Takes the payment (UPI, cards, netbanking) |
| Hosting | **Not deployed yet.** Runs locally (Live Server on 127.0.0.1:5500). The README suggests GitHub Pages. |

```
 Student browser
      |  (HTML/CSS/JS)
      v
 BTB Website  --------------------------->  Supabase Auth  (who is this?)
      |                                           |
      |  reads/writes with the student's login    v
      +----------------------------------->  Supabase Database (RLS rules)
      |                                           ^
      |  Enrol / Pay Now                          | writes (service role, server only)
      +--------> Edge Function: create-order -----+
      |                    |
      |                    v
      |               Razorpay (order)
      |                    |
      +--------> Razorpay Checkout popup  <--------+
                           |
                           v   payment result
      +--------> Edge Function: verify-payment  --> Razorpay API (double check)
                           ^
   Razorpay webhook -------+--> Edge Function: razorpay-webhook
                           |
                           v
                Payment record + Enrolment / Ebook purchase
                           |
                           v
                  Student dashboard (My Courses)
```

---

## 3. Website pages (actual files)

See `BTB_Academy_Project_Sitemap.md` for the full sitemap. Summary:

**Public (IMPLEMENTED):** Home (`index.html`, includes the About section), Live Classes, Video Courses list (`courses.html`), Course details (`course.html`),
Video library (`videos.html`), Ebooks, Testimonials, Blog, Contact, FAQ, Privacy, Terms, Refund Policy, 404.

**Student:** Account page (`account.html`: sign in, create account, forgot password, My courses, My ebooks, Payment history, sign out),
Reset password, Checkout (`checkout.html`), Lesson player (`watch.html`).

**Admin (under `/admin/`):** Login, Dashboard, Videos, Video edit, Courses, Modules, Ebooks, Bookings, Orders, Settings.

**Not existing as separate pages:** About page, separate Login/Signup pages, Blog detail pages, Ebook detail page, Live batch detail page,
Payment Success/Failed/Pending/Cancelled pages, student Profile page, Help and Support page, admin pages for students, enrolments,
batches, testimonials, blog, website settings.

---

## 4. Student journey

### 4.1 Registration and sign-in
1. Student opens a course page and clicks **Enrol Now**.
2. The **checkout page** opens.
3. If the student is already signed in, name and email are filled in (email is locked).
4. If not signed in, the student types name and email on the same page and receives a **6-digit code** by email (no password). *(NEEDS CONFIGURATION: Supabase email templates need a code line, which requires a custom email service. Not yet verified.)*
5. Alternative: the classic sign-in / create-account page `account.html` (email + password, email confirmation, forgot password). IMPLEMENTED.

### 4.2 Purchase

```
 Course page
     |  Enrol Now
     v
 Checkout page  -- name, email, WhatsApp (optional), batch time (live courses), Terms tick
     |  Pay Now
     v
 create-order (server)  -- reads the PRICE FROM THE DATABASE, creates a Razorpay order
     |
     v
 Razorpay popup (UPI QR / UPI app / card / netbanking)
     |  paid                      | closed         | failed
     v                            v                v
 verify-payment (server)     order = cancelled   order = failed
   checks signature
   asks Razorpay "was it captured?"
     |
     v
 fulfill_order (database function)
   payment row + order = paid + enrolment (or ebook purchase)
     |
     v
 "Payment successful" -> My Courses
```

### 4.3 Payment outcomes

| Outcome | What the system does | Student sees |
|---|---|---|
| Success | Verified on the server, enrolment created | "Payment successful" message, then course in My Courses |
| Failed | Recorded as failed; no access | Message: payment failed, not charged, try again |
| Cancelled (popup closed) | Order marked cancelled; no access | "Payment was cancelled. You have not been charged." (confirmed working) |
| Pending (bank not confirmed) | Order marked pending; the webhook finishes it later | Message: awaiting bank confirmation; access unlocks automatically |

These are shown as a short message on the checkout page. **Separate result pages do not exist** (PLANNED).

---

## 5. Payment architecture (Razorpay)

**What is Razorpay?** A payment gateway. It shows the payment popup and moves the money. BTB Academy never sees card details.

| Term | Simple meaning |
|---|---|
| Razorpay order | A "bill" created before payment, with an amount. Payment must match it. |
| Payment verification | The server checks that the payment really happened (signature + asking Razorpay directly). |
| Webhook | Razorpay calls our server by itself to say "this payment was captured". It covers closed tabs and slow banks. |
| Payment status | created -> pending -> paid (or failed / cancelled) |
| Enrolment | The database row that gives one student access to one course |
| Duplicate protection | Replaying the same payment or webhook cannot create two payments or two enrolments |

**Why the backend must verify.** A browser message like "payment done" can be faked. Only the server, using Razorpay's secret key, can prove it. The website never grants access from the browser's word alone.

**The three Edge Functions (all deployed, Test Mode)**

| Function | What it does |
|---|---|
| `create-order` | Needs a signed-in user. Reads price from the `courses`/`ebooks` table (never from the browser). Checks batch time, already-owned, minimum Rs 1. Re-uses an open unpaid order instead of creating duplicates. Creates the Razorpay order. |
| `verify-payment` | Checks the Razorpay signature, then fetches the payment from Razorpay, then calls `fulfill_order`. Also marks a closed popup as cancelled. |
| `razorpay-webhook` | Checks the webhook signature, ignores duplicate events, then calls `fulfill_order` for captured/paid events or records failures. |

**Test Mode vs Live Mode.** Test Mode uses `rzp_test_...` keys and fake money (e.g. UPI `success@razorpay`). Live Mode needs Razorpay KYC and `rzp_live_...` keys. **The project is in Test Mode only.** Secrets live in Supabase Edge Function secrets, never in the website code.

---

## 6. Student dashboard (`account.html`)

| Section | Status | What it shows |
|---|---|---|
| Welcome + email + Sign out | IMPLEMENTED | Name and email from the account |
| My courses | IMPLEMENTED | Courses the student is enrolled in, with an open link |
| My ebooks | IMPLEMENTED | Purchased ebooks with a download button (secure link) |
| Payment history | IMPLEMENTED | Date, item, amount, status (Paid, Awaiting confirmation, Failed, Cancelled, Not completed) |
| Overview statistics | PLANNED | |
| Continue Learning / progress | PLANNED (no progress tracking exists) | |
| Live Classes (batch, schedule, Meet link) | PLANNED | |
| Profile page (edit name/WhatsApp) | PARTIAL (name and WhatsApp can be updated at checkout only) | |
| Help and Support page | PLANNED (WhatsApp button and Contact page exist) | |

**How the pieces connect:** Student account -> Order (what they tried to buy) -> Payment (money result) -> Enrolment (the access row) -> access to lessons/videos.

---

## 7. Admin dashboard (`/admin/`)

Only people listed in the `admins` table can use it. Anyone else is rejected by the database itself.

| Page | Status | Purpose |
|---|---|---|
| Login | IMPLEMENTED | Email + password; checked against the `admins` table |
| Dashboard | IMPLEMENTED | Counts: courses, modules, videos, published videos, ebooks, new bookings, paid orders, pending payments, failed payments, ebook sales, verified revenue |
| Courses | IMPLEMENTED | Create/edit/delete courses, price, original price, type, duration, batch times, highlights, thumbnail, publish |
| Modules | IMPLEMENTED | Create/edit modules inside a course; publish |
| Videos + Video edit | IMPLEMENTED | Upload a video (resumable), thumbnail, choose course and module, order, free preview, publish |
| Ebooks | IMPLEMENTED | Create ebooks, upload PDF/EPUB and cover, price, publish |
| Bookings | IMPLEMENTED | Review live-class booking requests from the contact page |
| Orders | IMPLEMENTED (read-only) | Orders and payments, search, status filter, payment stats |
| Settings | IMPLEMENTED | Change password; view connection and limits |
| Student management | PLANNED | |
| Enrolment management | PLANNED | |
| Live batch / schedule / meeting link management | PLANNED | |
| Testimonials, Blog, Website settings management | PLANNED (these are fixed pages edited in HTML today) | |

Admins cannot mark a payment "paid" by hand. Payments only become paid through the verified server path.

Step-by-step: see `BTB_Academy_Admin_Dashboard_Guide.md`.

---

## 8. Videos: how they upload and appear

Full detail: `BTB_Academy_Video_Upload_Guide.md`. Short version:

```
 Admin > Videos > Add video
      |  choose course, module, file (mp4/webm, up to 50 MB)
      v
 File goes to Supabase Storage bucket "course-videos" (PRIVATE)
      |
      v
 A row is saved in the "videos" table with the file PATH
      |  status = Published
      v
 Student opens the course -> page reads the list from the database
      |  student clicks a lesson
      v
 Server rule checks: free? preview? or enrolled?  -> if yes, makes a SIGNED URL (time-limited link)
      v
 Video player plays it
```

**Does the website update automatically?** Yes for content. The pages read courses, modules and videos from Supabase every time they load.
Uploading a video, adding a lesson, or changing a price in the admin dashboard needs **no change to HTML, JavaScript or GitHub**.
The student sees the new lesson the next time the page loads (no live push). The lesson only shows if the video, its module and its course are all **Published**.

---

## 9. Course structure and database storage

```
 Course                      table: courses
 +-- Module 1                table: modules      (course_id -> courses)
 |    +-- Lesson 1           table: videos       (course_id, module_id)
 |    +-- Lesson 2
 |    +-- Lesson 3
 +-- Module 2
 |    +-- Lesson 1
 |    +-- Lesson 2
 +-- Module 3
```

A "lesson" in this project is a row in `videos`. A database rule guarantees a video's module belongs to the same course.

---

## 10. Ebooks

1. Admin > Ebooks > create ebook: title, description, price, cover (public thumbnail bucket), file (private `ebook-files` bucket).
2. Publish (a published ebook must have a file).
3. Student buys on `ebooks.html` using the same Razorpay flow.
4. After verified payment, a row is added to `ebook_purchases`.
5. The ebook appears under **My ebooks** with a **Download** button.
6. The download link is a short-lived **signed URL**. Storage rules allow it only for admins, buyers, or free ebooks. Paid file paths are never exposed in the public list (`ebooks_public` view).

Status: code IMPLEMENTED; **no ebook is published yet**, so ebook buying has not been tested.

---

## 11. Live classes

| Item | Status |
|---|---|
| Live Batch / Cluster / Personal Training plans shown on `live-classes.html` | IMPLEMENTED |
| Buying a live plan through checkout, with batch time choice saved on the order (`batch_choice`) | IMPLEMENTED (NOT TESTED end to end) |
| Batch times list entered by admin (Courses > Batch times) | IMPLEMENTED |
| Batch name per cohort, start/end dates, schedule, instructor, capacity | PLANNED (no fields or tables) |
| Meeting link shown only to buyers | PLANNED |
| Upcoming sessions, class status, enrolled-student list | PLANNED |
| Booking request form (contact page) -> Admin > Bookings | IMPLEMENTED |

Today the academy must send the Google Meet link by WhatsApp. If a schedule or link is not configured, the site has no place to show it (planned: a clear "link not added yet" message).

---

## 12. Database architecture

Existing tables (from the SQL files):

| Table | Purpose | Who can read | Who can write |
|---|---|---|---|
| `admins` | Allow-list of admin users | The user's own row | Dashboard only |
| `courses` | Courses and live plans (price, delivery, batch times, highlights) | Public (published only) | Admins |
| `modules` | Sections inside a course | Public (published) | Admins |
| `videos` | Lessons (file path, order, preview flag) | Public list (published); file only via signed URL | Admins |
| `enquiries` | Contact form messages | Admins | Anyone can insert; admins manage |
| `bookings` | Live-class booking requests | Admins | Anyone can insert; admins manage |
| `orders` | Each purchase attempt (amount, status, Razorpay order id, batch choice) | The student's own rows; admins | Server functions only |
| `payments` | Razorpay payment results linked to an order | The student's own; admins | Server functions only |
| `enrollments` | Student -> course access (unique per student and course) | Own rows; admins | Server (`fulfill_order`) only |
| `webhook_events` | Webhook de-duplication | Nobody from the browser | Server only |
| `ebooks` | Ebook records, price, files | Admins (public sees the `ebooks_public` view) | Admins |
| `ebook_purchases` | Student -> ebook access | Own rows; admins | Server only |

Helper functions: `is_admin`, `has_course_access`, `can_stream_video_path`, `can_download_ebook_path`, `fulfill_order`, `record_failed_payment`, `my_ebooks`, `admin_payment_stats`.

```
 auth.users (Supabase accounts)
     |  user_id                                  admins
     +--< orders >-- course_id --> courses --<  modules --< videos
     |      |  ebook_id --> ebooks
     |      +--< payments
     +--< enrollments  --> courses
     +--< ebook_purchases --> ebooks
 bookings, enquiries, webhook_events  (stand-alone)
```

**Tables that do NOT exist** (needed for planned features): `profiles`, `lesson_progress`, `live_batches`, `live_sessions`, `testimonials`, `blog_posts`, `coupons`.
Student names and WhatsApp numbers are stored in the Supabase account's user metadata, not in a profile table.

Storage buckets: `course-videos` (private, 50 MB, mp4/webm), `ebook-files` (private, 50 MB, PDF/EPUB), `course-thumbnails` (public, 2 MB, jpg/png/webp).

---

## 13. Security architecture (simple English)

| Idea | Meaning | Used here |
|---|---|---|
| Authentication | Proving who you are | Supabase Auth (email + password, or email code) |
| Authorization | What you are allowed to do | RLS rules + the `admins` table |
| Row Level Security | The database filters rows per user | A student can read only their own orders, payments, enrolments, ebook purchases |
| Server-side price | The price is never taken from the browser | `create-order` reads it from the database |
| Signature verification | Proves a message really came from Razorpay | Checked in `verify-payment` and `razorpay-webhook` |
| Private storage | Files are not public | Videos and ebooks are in private buckets |
| Signed URL | A temporary link to one private file | Only created if the student is allowed |
| Duplicate protection | Same payment cannot count twice | Unique constraints and idempotent `fulfill_order` |

**Why a student cannot open another student's course:** the enrolment row belongs to one account; RLS hides other rows; the storage rule only signs a video link if that account is enrolled (or the lesson is a free preview).

**Why frontend security alone is not enough:** anyone can change JavaScript in their own browser. Rules must be enforced by the database and server.

Known items to handle before launch: change `SITE_ORIGIN` from the local address to the real domain; delete test videos; regenerate Razorpay test keys that were shared in chat; set up a real email service; confirm the legal text of Privacy, Terms and Refund pages.

---

## 14. Updating the site without code

| Admin update | Requires code change? |
|---|---|
| Add a course | **No.** Admin > Courses |
| Change a course price | **No.** Edit the course (price is read live; the server re-checks it at payment) |
| Upload a video | **No.** Admin > Videos |
| Add a lesson | **No.** Admin > Videos (choose course and module) |
| Publish an ebook | **No.** Admin > Ebooks |
| Change batch timing options | **No.** Admin > Courses > Batch times |
| Update a meeting link | **Not possible yet.** No field exists (PLANNED) |
| Add testimonials or blog posts | **Yes.** They are written in the HTML files today |
| Change website layout or text on fixed pages | **Yes.** Edit HTML/CSS and publish |
| Add a new feature | **Yes.** Needs development |

---

## 15. Roadmap (all PLANNED unless stated)

1. Payment result pages (Success, Failed, Pending, Cancelled) with receipts.
2. Student dashboard: overview, profile, support, live classes.
3. Live batches: cohorts, schedule, instructor, capacity, meeting link visible to buyers only.
4. Email sending service (codes, receipts, reminders).
5. Admin: student list, enrolments, batch manager.
6. Learning progress and resume playback.
7. Certificates, coupons and discounts, refunds, invoices, analytics, reviews, search, mobile app.
8. Move testimonials and blog into the database.

---

## 16. Current implementation status

| Area | Status |
|---|---|
| Public website pages | IMPLEMENTED |
| Student sign-in, forgot password, account page | IMPLEMENTED |
| One-page checkout | IMPLEMENTED (email-code step NEEDS CONFIGURATION) |
| Razorpay Edge Functions + webhook (Test Mode) | IMPLEMENTED and deployed |
| Full successful test payment | **NOT TESTED yet** |
| Private videos and ebooks with signed links | IMPLEMENTED |
| Admin: courses, modules, videos, ebooks, bookings, orders | IMPLEMENTED |
| Live class delivery (schedule, link) | PLANNED |
| Result pages, profile, support, progress | PLANNED |
| Hosting and real domain | NOT DONE |
| Razorpay Live Mode | NOT DONE (requires KYC) |

## 17. Development and testing plan

1. Complete one Test Mode payment end to end; check My Courses and Payment history.
2. Test failed, cancelled and pending cases.
3. Publish one small ebook and test purchase and download.
4. Set up a custom email service; test the email-code step.
5. Build the planned pages and live-class features in small phases, testing after each.
6. Mobile and unauthorized-access tests.
7. Domain, hosting, Razorpay KYC, then Live Mode.
