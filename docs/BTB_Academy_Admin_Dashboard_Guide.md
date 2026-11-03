# BTB Academy - Admin Dashboard Guide

The admin area lives under `/admin/` (e.g. `admin/login.html`). Written from the real admin files.
Only emails in the `admins` table can enter. Everyone else is blocked by the database.

## 1. Sign in
1. Open `admin/login.html`.
2. Enter the admin email and password.
3. You land on the **Dashboard**.
4. Change your password any time in **Settings -> Change password**.

First-time setup of the owner account is in `supabase/04_first_admin.sql` (create the user in Supabase Auth, then add the email to `admins`).

## 2. Left menu

Dashboard - Videos - Courses - Ebooks - Bookings - Orders - Settings (Modules is opened from the Courses area).

## 3. Dashboard (overview)

| Shown today | Planned |
|---|---|
| Total courses, modules, videos, published videos | Total students |
| Ebooks, new booking requests | Total enrolments |
| Paid orders, pending payments, failed payments | Upcoming live classes |
| Ebook sales, verified revenue | Recent registrations |

## 4. Create a course
1. **Courses -> Add course**.
2. Fill: **Title**, **Description**, **Learning objectives** (one per line), **Level**.
3. **Price (Rs)**. Use 0 for a free course. Optional **Original price** (shows a discount) and **Line under the price** (e.g. "Inclusive of taxes").
4. **Type:** Recorded or Live. **Duration** (e.g. "2 months").
5. **Batch times** (Live): one time option per line. The student must pick one at checkout.
6. **What the student gets** (one per line).
7. **Thumbnail** (jpg/png/webp, 2 MB).
8. **Status:** Draft or Published. Save.

Edit later the same way. Changing the price needs no code. The server re-reads the price at payment time.
Deleting a course is blocked if it has orders (unpublish it instead).

## 5. Add modules and lessons
1. Open **Modules** for the course; add **Module 1**, set order, **Published**.
2. **Videos -> Add video**: choose course and module, title, optional thumbnail, **video file**, order, status.
3. Tick **Free preview** to let anyone watch that lesson.
4. See `BTB_Academy_Video_Upload_Guide.md` for the whole upload story.

## 6. Publish or unpublish
Course, module and video each have **Draft / Published**. Students see a lesson only when all three are Published.

## 7. Ebooks
1. **Ebooks -> Add ebook**: title, description, price, cover image.
2. Upload the PDF/EPUB (private storage).
3. Set **Published** (needs a file).
4. Buyers see it in **My ebooks** and download through a temporary secure link.
Ebooks with paid orders cannot be deleted (unpublish instead).

## 8. Bookings
Live-class booking requests from the contact page appear here. Review them, contact the student, update the status.

## 9. Orders and payments (read-only)
- Search by student, email or item; filter by status.
- Each order shows the Razorpay payment, method and any error.
- Statistics (paid, pending, failed, revenue) come from verified payments only.
- **You cannot mark an order paid by hand.** Payments become paid only through the verified server path.

## 10. Settings
Change your password; see the connected Supabase project and upload limits.

## 11. Live classes (what to do today)
Live plans (Batch, Cluster, Personal Training) are sold like courses. Put the batch time options in **Batch times**.
**There is no place for a Meet link or schedule yet (planned).** Today, send the Google Meet link to the student by WhatsApp after purchase, using the order in **Orders** and the WhatsApp number the student gave at checkout (stored in their account profile).

## 12. What admins cannot do yet (planned)
Student list, enrolment management, manual enrolment, live batch/schedule/meeting-link manager, testimonials and blog editing, website settings, admin profile.

## 13. Do I need to change code?
| Task | Code change? |
|---|---|
| Add/edit course, price, module, lesson, video, ebook, batch time options | No |
| Change page text, layout, blog, testimonials | Yes (HTML/CSS) |
| Meeting links, student list, new features | Yes (development) |
