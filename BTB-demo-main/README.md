# Break the Barriers Academy — website + video management

Static site (HTML5, CSS3, Bootstrap 5, vanilla JS) backed by **Supabase** (Auth, Postgres, Storage).
No framework, no build step, no custom server. The admin uploads videos in `/admin/`; the public site reads the same database and bucket, so uploaded lessons appear under the right course and module automatically.

## Folder structure
```
index.html courses.html course.html videos.html watch.html contact.html 404.html   public site
admin/  index (dashboard) videos video-edit courses modules settings login          admin area
assets/css/style.css        original BTB design system (unchanged)
assets/css/app.css          new: catalog, player, admin styles
assets/js/config.js         <-- YOUR Supabase URL + publishable key + limits + contact details
assets/js/btb-core.js       Supabase client + helpers      public.js   public pages
assets/js/admin-core.js     admin shell, uploads           admin-pages.js   admin pages
assets/vendor/              Bootstrap, icons, fonts, supabase-js 2.45.4, tus-js-client 4.1.0 (all self-hosted)
supabase/01..05_*.sql       database, security, storage, first admin, commerce
supabase/functions/         Edge Functions: create-order, verify-payment, razorpay-webhook
reset-password.html         set a new password from the emailed recovery link
faq.html privacy.html terms.html refund-policy.html   FAQ and policies. The three policies are DRAFTS: confirm the [bracketed] items, have them reviewed, then delete the yellow draft box
supabase/06_starter_course.sql   optional: one starter course + module so the admin video form has something to select
supabase/07_course_sales.sql     REQUIRED for the new course page: adds original price, tax line, live/recorded type, duration, batch times, "what you get" (run before using Admin > Courses and before deploying create-order)
supabase/08_sample_courses.sql   optional: two SAMPLE courses (recorded + live) to preview the new course page; edit or delete before launch
account.html                student sign-in, my courses, payment history
assets/js/student.js        student auth, entitlement checks, Razorpay checkout launcher
```
All links are relative and every page is a real `.html` file (query strings select the course/video), so it works on a GitHub Pages project path and refreshing any page works.

## Setup (about 15 minutes)
1. **Create a Supabase project** (supabase.com).
2. **Run the SQL**, in order, in *SQL Editor*: `supabase/01_schema.sql`, `02_security.sql`, `03_storage.sql`.
3. **Create the first admin**: *Authentication → Users → Add user* (tick *Auto Confirm*). Then *Authentication → Sign In / Providers → Email* → turn **off "Allow new users to sign up"**. Edit the email in `supabase/04_first_admin.sql` and run it. Only users listed in the `admins` table can write anything; there is no public sign-up page, and even if someone created an Auth account they would have no admin row, so every write is rejected by RLS.
4. **Configure the site**: *Project Settings → API* → copy the Project URL and the **publishable (anon) key** into `assets/js/config.js`. Also fill `contactEmail` / `contactAddress` if you want them shown (left empty = hidden; none were supplied).
5. **Set the upload limit**. Free plan = **50 MB per file**. 03_storage.sql and `config.js` (`maxVideoMB`) are set to 50. For larger lessons upgrade, raise *Storage → Settings → global file size limit*, then raise the bucket limit in `03_storage.sql` and `maxVideoMB`. Uploads use the resumable (TUS) protocol in 6 MB chunks, which is what Supabase recommends for files over 6 MB. For long lessons, compress to MP4 (H.264/AAC) before uploading.
6. Open `/admin/login.html`, sign in, add a course → modules → videos.

> The publishable key in `config.js` is **meant to be public**. Security comes from the RLS and Storage policies. **Never** put the `service_role`/secret key in any file here. No feature needs it.

## Paid courses, student login and Razorpay (added)

**What was added:** course prices (admin → Courses), free-preview lessons, module publish/unpublish, student sign-in/registration (`account.html`), purchase flow on `course.html`, entitlement-gated video storage, Razorpay order/verify/webhook Edge Functions, and admin pages for **Ebooks**, **Bookings** and **Orders**. A live-class booking form was added to `contact.html`.

### Manual setup, in this order
1. Run `supabase/05_commerce.sql` in the SQL Editor (after 01–03). It is additive and re-runnable. It **replaces three read policies** (modules, videos, course-video storage) with stricter ones; it deletes no data.
2. **Authentication → Sign In / Providers → Email**: turn **"Allow new users to sign up" ON** (students need it; this reverses step 3 above). Admin safety is unchanged: only users in the `admins` table can write. Decide whether to keep "Confirm email" on (recommended). Set *URL Configuration → Site URL* to your site.
3. Razorpay Dashboard: get **Key Id / Key Secret** (use *Test mode* first). Keep **auto-capture enabled** (Settings → Payment Capture) — the server only grants access to *captured* payments.
4. Deploy the Edge Functions (Supabase CLI, run from the project folder):
   ```
   supabase login && supabase link --project-ref YOUR-REF
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxx RAZORPAY_KEY_SECRET=xxx RAZORPAY_WEBHOOK_SECRET=choose-a-long-random-string SITE_ORIGIN=https://your-site
   supabase functions deploy create-order
   supabase functions deploy verify-payment
   supabase functions deploy razorpay-webhook --no-verify-jwt
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by Supabase automatically. The **Key Secret and service_role key exist only as server secrets** — never in `config.js` or any HTML/JS.
5. Razorpay Dashboard → *Webhooks* → add `https://YOUR-REF.supabase.co/functions/v1/razorpay-webhook`, the same secret as `RAZORPAY_WEBHOOK_SECRET`, events: `payment.captured`, `payment.failed`, `payment.authorized`, `order.paid`.
6. Admin → Courses: set a price (₹; `0` = free). Optionally tick **Free preview** on a lesson (Admin → Videos).

### How the payment flow protects you
* Price is read from the database by `create-order`; the browser cannot choose the amount.
* The browser's "success" is not trusted. `verify-payment` checks the HMAC signature **and** fetches the payment from Razorpay (captured, right order). The webhook independently confirms the same thing and covers closed tabs / slow banks.
* All writes go through `fulfill_order()` (callable by `service_role` only). It locks the order row, de-duplicates on the unique Razorpay payment id and on `(user, course)`, and rejects amount mismatches, so replayed webhooks cannot create two payments/enrolments.
* Students can only *read* their own orders and enrolments; admins can read all but **cannot mark anything paid** from the UI.
* Paid video files: storage policy `can_stream_video_path()` only allows signed URLs for free courses, preview lessons, enrolled students or admins. A direct URL or guessed path does not work.
* CSP: pages that open checkout (`course.html`) allow `checkout.razorpay.com`, `api.razorpay.com` and `style-src 'unsafe-inline'` (needed by Razorpay's widget). `_headers` was updated globally for the same reason.

### Known limits (not claimed as done)
* **Not DRM.** An enrolled student can still download or share the file while their signed link is valid (2 h).
* **No refunds/chargeback handling** in the UI; refund in Razorpay manually and remove the row from `enrollments` in SQL if access should end.
* **Password reset** is built (`reset-password.html`, linked from "Forgot password?" on `account.html`) but needs one Supabase setting before it works: *Authentication → URL Configuration → Redirect URLs* must include the address of `reset-password.html` on your site (for local testing add `http://127.0.0.1:5500/**`). Not yet tested end-to-end with a real email.
* **No public ebooks page**: ebooks are managed in the admin and stored privately/draft-only; a public listing/download page (and any paid-ebook logic) is not built.
* Library page (`videos.html`) does not show lock icons; locked lessons are blocked on `watch.html`.
* Prices are INR only. Invoices/GST receipts are not generated.

## Storage model and what it does (and doesn't) protect
| Bucket | Access | Contents |
|---|---|---|
| `course-videos` | **Private** | lesson videos, `{course_id}/{video_id}/{random}.mp4` |
| `course-thumbnails` | **Public** | cover images, `courses/{id}/…` and `videos/{id}/…` |

* Visitors get a **signed URL valid for 2 hours** (`signedUrlSeconds`), created at page view. A storage policy only allows signing for files that belong to a **published** lesson of a **published** course, so **drafts and unpublished videos cannot be reached by the public**, even with a guessed path.
* Honest limit: anyone who can watch a lesson can copy its temporary link or download the video while it is valid. This is **not DRM**. Paid courses are restricted to enrolled students by `05_commerce.sql` (see the section above).
* Thumbnails are public images; a draft's thumbnail URL is technically reachable if someone knows its random path.
* Anonymous visitors have **no** write access anywhere. Only `is_admin()` users can insert/update/delete in tables and buckets.
* Allowed uploads: MP4/WebM video, JPG/PNG/WebP images ≤ 2 MB. Enforced three ways: the form, bucket `allowed_mime_types`/`file_size_limit`, and policies.

## Data rules enforced by the database
* A video's module must belong to the same course (composite foreign key `videos(module_id, course_id) → modules(id, course_id)`).
* Courses can't be deleted while they have modules, modules can't be deleted while they have videos (`ON DELETE RESTRICT`); the admin UI explains why and never deletes videos silently.
* Statuses are only `draft` / `published`. Titles and text lengths have CHECK constraints. Slugs are unique.
* Deleting a video deletes the database row **first** (so it disappears from the site immediately), then removes its video and thumbnail files. If file removal fails the admin is told which paths remain.
* The contact form writes to an `enquiries` table (anonymous insert only, length-checked, honeypot field); only admins can read them (shown on the Dashboard). There is no rate limiting; for heavy spam add Cloudflare Turnstile + an Edge Function.

## Deploy to GitHub Pages
1. Create a GitHub repo, push this folder's contents to the repo root (`.nojekyll` is included).
2. *Settings → Pages →* Deploy from branch `main` / root. The site appears at `https://USER.github.io/REPO/`.
3. Replace `https://www.example.com` with your real address in the HTML files (`canonical`, `og:url`, `og:image`), `sitemap.xml`, `robots.txt` (search & replace across the folder).
4. In Supabase *Authentication → URL Configuration*, set the Site URL to your address.
5. **Custom domain**: *Pages → Custom domain*, add `www.yourdomain.com`; at your DNS provider add a `CNAME` for `www` → `USER.github.io` (and the four GitHub `A` records for the apex domain). Tick *Enforce HTTPS* once the certificate is issued.
6. `_headers` works on Netlify/Cloudflare Pages. GitHub Pages can't send headers, but each page has the same CSP in a `<meta>` tag.

## SEO notes
Titles, descriptions, canonical and social tags are in every page. Course and lesson pages are **rendered by JavaScript** from the database: Google does execute JS, but it is slower and less reliable than static HTML, and social-share previews (WhatsApp/Facebook) will show the generic title and description rather than lesson-specific ones because those crawlers don't run JS. The home, courses, library and contact pages are static and fully indexable. If course SEO becomes important, pre-render course pages at publish time (a small script or GitHub Action) or move to a host with server rendering.

## Test checklist — and what was actually verified
**Verified in this build** (headless Chrome against an *in-memory mock of the Supabase client*, which reproduces the query API but **not** real RLS, Storage or Auth): public pages render courses/modules/lessons from data; drafts and unpublished courses are not shown; HTML in titles is escaped; player requests a signed URL for the exact lesson's file and shows an error + Retry if it can't load; previous/next lesson links; library search/filters; admin dashboard counts; admin new-video flow (validation messages, wrong type and over-limit files rejected, module list filtered by course, failed upload → nothing saved and buttons re-enabled, successful upload → row inserted with the correct paths); course add; delete blocked while a course/module has content; module/lesson re-order; no horizontal overflow at ~500 px wide.

**NOT yet verified — needs your real Supabase project** (please run these):
1. Admin login with the real account; a second, non-admin Auth user is refused.
2. Add a course and modules; reorder (calls the `reorder_items` SQL function).
3. Upload a small MP4 (< 50 MB) with a thumbnail; confirm the file appears in *Storage → course-videos* and the row in *Table editor → videos*.
4. Public site: the lesson shows under the right course/module; clicking opens the player and plays **that** file; seeking works.
5. Edit title/description → public page updates. Unpublish → disappears from library, `watch.html?v=…` shows "Video not available", and a signed URL can't be created for it. Re-publish.
6. Delete the video → row gone, both files gone from Storage.
7. Unauthorised writes: in the browser console, with no login, `BTB.db.from('courses').insert({title:'x',slug:'x'})` and a storage upload must both fail with a permission error.
8. Upload a file over 50 MB → rejected by the form; (optionally bypass the form) rejected by Supabase.
9. Interrupt the network mid-upload → error shown, no video row, no leftover file.
10. Phone-size (360 px) layout of every page and the admin area, real device if possible.
11. Contact form saves a row visible in the dashboard.

## Existing BTB content — please confirm before launch
(Carried over from the original sample site.)
* Student permission: feedback/class videos show identifiable students; get consent or swap them.
* The IIT Madras stage videos were assumed to show the academy's trainer; confirm.
* Hero photo shows a trophy; no award is claimed. Add wording only once verified.
* **Logo**: no standalone logo file was supplied; the gold emblem was extracted from a poster (low resolution). Replace `assets/images/btb-logo.png` with the original.
* **Colours**: the brief asks for navy/white; the existing approved design uses deep indigo + gold. It was kept for consistency. To switch to navy, change the `--btb-*` colour tokens at the top of `assets/css/style.css`.
* WhatsApp number (+91 93600 46012) comes from the supplied posters; change it in `assets/js/config.js` and in the `wa.me` links (search `919360046012`).
* The home page's three pricing plans (Batch / Cluster / Personal) are still static content from the original site; the new "Featured courses" section above them is dynamic. Prices/plans are not stored in Supabase.
* Spelling: one poster says "Break the Barrier Academy"; the site uses "Break the Barriers Academy".
