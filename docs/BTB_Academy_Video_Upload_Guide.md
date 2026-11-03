# BTB Academy - Video Upload Guide

Written from the real code (`admin/video-edit.html`, `assets/js/admin-pages.js`, `assets/js/admin-core.js`, `supabase/03_storage.sql`, `supabase/05_commerce.sql`).

## 1. Words you need (simple English)

| Word | Meaning |
|---|---|
| Video file | The .mp4 or .webm file on your computer |
| Supabase Storage | A file cabinet in the cloud that holds your files |
| Bucket | One drawer in that cabinet. Yours: `course-videos`, `ebook-files`, `course-thumbnails` |
| Private bucket | A drawer nobody can open without permission. `course-videos` is private. |
| File path | The file's address inside the bucket, e.g. `videos/<id>/<code>.mp4` |
| Database record | A row in the `videos` table: title, course, module, order, status and the file path |
| Signed URL | A temporary link to one private file. It stops working after a while (2 hours here). |
| Video player | The `<video>` player on the lesson page |
| Enrolment | The row that says this student bought this course |
| Access permission | The rule: free preview, or enrolled, or admin. Otherwise no link is made. |

## 2. The upload workflow (implemented)

```
Admin Dashboard (Videos)
   -> Add video
   -> pick Course, then Module      (create them first in Courses and Modules)
   -> type title, optional description, optional thumbnail
   -> choose the video file         (.mp4 / .webm, max 50 MB)
   -> choose Draft or Published
   -> optional: Lesson order, Free preview
   -> Save
        |
        v
   File uploaded to bucket "course-videos" (resumable upload, with a progress bar)
        |
        v
   Row saved in table "videos" (file path + course + module + status)
        |
        v
   Course, module and video are all "Published"
        |
        v
   Student opens the course page -> lesson list is read from the database
        |
        v
   Student clicks a lesson -> server rule checks access -> signed URL -> video plays
```

**Uploading is done entirely in the admin dashboard.** No manual step in Supabase is needed.

## 3. Will the website update by itself?

**Yes, for content.** The course page and lesson list are loaded from the database each time the page opens.

- Upload a video in Admin -> it appears on the website. **No HTML, JavaScript or GitHub change is needed.**
- The student sees it the next time they open or refresh the page (it does not appear live while they are already on the page).
- It appears only if **all three** are Published: the video, its module, and its course.
- A video in Draft stays hidden.

## 4. Who can watch?

| Lesson type | Who can watch |
|---|---|
| Free course (price 0) | Anyone signed in or not, per the database rule |
| Free preview lesson | Anyone |
| Lesson in a paid course | Only students enrolled in that course (and admins) |

The rule is enforced in the database (`can_stream_video_path`), not only in the page. A student who is not enrolled cannot get a signed link even if they know the file path.

## 5. Limits (from your settings)

| Item | Limit |
|---|---|
| Video size | 50 MB per file (bucket limit and `config.js`) |
| Video types | mp4, webm |
| Thumbnail | 2 MB, jpg / png / webp |
| Supabase free plan | 1 GB total storage, about 5 GB downloads per month |

Longer videos: compress (HandBrake, MP4 H.264, 720p, about 1000 kbps; 50 MB is roughly 6-7 minutes) or split into parts. Larger needs the Supabase Pro plan or an outside video service (**not built; the site can only play files uploaded to Supabase today**).

## 6. Checklist for adding a lesson

1. Admin -> Courses: course exists and is **Published**.
2. Admin -> Modules: module exists and is **Published**.
3. Admin -> Videos -> Add video: choose course and module, title, file.
4. Set **Published** (or Draft to hide).
5. Tick **Free preview** only if everyone may watch it.
6. Save and wait for the progress bar to finish.
7. Open the course page in a private window to check the lesson appears.

## 7. Troubleshooting

| Problem | Likely reason |
|---|---|
| Upload rejected | File over 50 MB or not mp4/webm |
| Lesson not on the course page | Video, module or course is Draft |
| "Modules coming soon" | The course has no published module |
| Student sees a lock | Not enrolled, and the lesson is not a free preview |
| Video will not play | Signed link expired (reload the page) or network issue |
| Cannot sign in to admin | Your email is not in the `admins` table |
