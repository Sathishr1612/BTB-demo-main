-- BTB Academy - 03 storage. Run after 02_security.sql. Safe to re-run.
--
-- Two buckets:
--   course-videos      PRIVATE. Lesson videos. Visitors get short-lived signed URLs, and the
--                      policy below only lets them sign URLs for PUBLISHED lessons, so draft
--                      videos are never reachable by the public.
--   course-thumbnails  PUBLIC.  Cover images only (low sensitivity, cacheable by the CDN).
--
-- Size limit: the Supabase Free plan caps any single file at 50 MB. After upgrading, raise the
-- global limit (Dashboard > Storage > Settings) AND the bucket limit below, and set the same
-- value as maxVideoMB in assets/js/config.js.  52428800 bytes = 50 MB.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-videos', 'course-videos', false, 52428800, array['video/mp4','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-thumbnails', 'course-thumbnails', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "videos: public read published" on storage.objects;
drop policy if exists "videos: admin insert"          on storage.objects;
drop policy if exists "videos: admin update"          on storage.objects;
drop policy if exists "videos: admin delete"          on storage.objects;
drop policy if exists "thumbs: public read"           on storage.objects;
drop policy if exists "thumbs: admin insert"          on storage.objects;
drop policy if exists "thumbs: admin update"          on storage.objects;
drop policy if exists "thumbs: admin delete"          on storage.objects;

-- Videos: visitors may read (i.e. create a signed URL for) a file only if a published lesson
-- of a published course points at it. Admins may read everything.
create policy "videos: public read published" on storage.objects for select to anon, authenticated
using (bucket_id = 'course-videos' and (
  public.is_admin() or exists (
    select 1 from public.videos v join public.courses c on c.id = v.course_id
    where v.video_storage_path = storage.objects.name and v.status = 'published' and c.status = 'published')));
create policy "videos: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-videos' and public.is_admin());
create policy "videos: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'course-videos' and public.is_admin()) with check (bucket_id = 'course-videos' and public.is_admin());
create policy "videos: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'course-videos' and public.is_admin());

-- Thumbnails: the public bucket serves files by URL; these policies cover API listing/writes.
create policy "thumbs: public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'course-thumbnails');
create policy "thumbs: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-thumbnails' and public.is_admin());
create policy "thumbs: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'course-thumbnails' and public.is_admin()) with check (bucket_id = 'course-thumbnails' and public.is_admin());
create policy "thumbs: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'course-thumbnails' and public.is_admin());
