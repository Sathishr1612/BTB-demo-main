# BTB Academy - Project Sitemap

Source: the actual files in the project folder. Legend:
**PUBLIC** = anyone, **STUDENT** = signed-in student, **ADMIN** = admin only.
Pages in section 4 do **not exist yet**.

## 1. Visual sitemap (implemented)

```
BTB Academy website
|
+-- PUBLIC
|   +-- Home ........................ index.html   (About section is on this page)
|   +-- Live Classes ................ live-classes.html
|   +-- Video Courses (list) ........ courses.html
|   |     +-- Course details ........ course.html?c=<slug>
|   +-- Video library ............... videos.html
|   +-- Ebooks (list, buy) .......... ebooks.html
|   +-- Testimonials ................ testimonials.html
|   +-- Blog (articles on one page).. blog.html
|   +-- Contact (+ booking request).. contact.html
|   +-- FAQ ......................... faq.html
|   +-- Privacy Policy .............. privacy.html
|   +-- Terms and Conditions ........ terms.html
|   +-- Refund Policy ............... refund-policy.html
|   +-- Page not found .............. 404.html
|
+-- STUDENT (needs sign-in)
|   +-- Checkout .................... checkout.html?c=<slug>
|   +-- Account / Dashboard ......... account.html
|   |     +-- Sign in, Create account, Forgot password   (tabs on the same page)
|   |     +-- My courses
|   |     +-- My ebooks (download)
|   |     +-- Payment history
|   |     +-- Sign out
|   +-- Reset password .............. reset-password.html   (from the email link)
|   +-- Lesson player ............... watch.html?v=<lesson>  (free previews open without sign-in)
|
+-- ADMIN  (/admin/, admins table only)
    +-- Admin login ................. admin/login.html
    +-- Dashboard ................... admin/index.html
    +-- Courses ..................... admin/courses.html
    +-- Modules ..................... admin/modules.html
    +-- Videos (list) ............... admin/videos.html
    |     +-- Add / edit video ...... admin/video-edit.html
    +-- Ebooks ...................... admin/ebooks.html
    +-- Bookings .................... admin/bookings.html
    +-- Orders (read-only) .......... admin/orders.html
    +-- Settings .................... admin/settings.html
```

## 2. Page table

| Page | File | Access | Status |
|---|---|---|---|
| Home | index.html | Public | Implemented |
| About | section of index.html | Public | Implemented (no separate page) |
| Live Classes | live-classes.html | Public | Implemented |
| Courses list | courses.html | Public | Implemented |
| Course details | course.html | Public | Implemented |
| Video library | videos.html | Public | Implemented |
| Ebooks | ebooks.html | Public (buy needs sign-in) | Implemented |
| Testimonials | testimonials.html | Public | Implemented (static text) |
| Blog | blog.html | Public | Implemented (static articles) |
| Contact | contact.html | Public | Implemented |
| FAQ | faq.html | Public | Implemented |
| Privacy / Terms / Refund | privacy.html, terms.html, refund-policy.html | Public | Implemented (legal wording to be confirmed) |
| 404 | 404.html | Public | Implemented |
| Checkout | checkout.html | Student (email code on the page if not signed in) | Implemented; email step needs configuration |
| Account / dashboard | account.html | Student | Implemented (basic) |
| Reset password | reset-password.html | Public (email link) | Implemented |
| Lesson player | watch.html | Student (or free preview) | Implemented |
| Admin pages (9) | admin/*.html | Admin | Implemented |

## 3. Student journey map

```
Home / Live Classes / Courses
        -> Course details -> Enrol Now -> Checkout -> Razorpay -> message on checkout
        -> Account (My courses) -> Lesson player
Ebooks -> Buy -> Razorpay -> Account (My ebooks) -> Download
```

## 4. Planned pages (not in the project yet)

| Planned page | Notes |
|---|---|
| About (separate page) | Today only a section on Home |
| Login and Signup as separate pages | Today they are tabs on account.html |
| Blog detail pages, Ebook details, Live batch details | Today shown inside list pages |
| Payment Success / Failed / Pending / Cancelled | Today a short message on checkout |
| Student: Overview, Course learning page, Live Classes, Profile, Help and Support | Planned |
| Admin: Student management, Enrolment management, Payment management (beyond read-only Orders), Live Batch management, Class Schedule management, Testimonials, Blog, Website Settings, Admin Profile | Planned |
