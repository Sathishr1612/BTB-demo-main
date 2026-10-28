-- BTB Academy - 06 starter course (optional). Run in Supabase > SQL Editor after 01-05. Safe to re-run.
-- Creates one published course with one module so the admin video form has something to select.
-- Rename it any time in Admin > Courses and Admin > Modules.
insert into public.courses (title, slug, description, level, status, display_order)
values ('Spoken English Basics', 'spoken-english-basics',
        'Learn it. Practise it. Speak it.', 'Beginner', 'published', 1)
on conflict (slug) do nothing;

insert into public.modules (course_id, title, description, status, display_order)
select c.id, 'Module 1', 'Getting started', 'published', 1
from public.courses c
where c.slug = 'spoken-english-basics'
  and not exists (select 1 from public.modules m where m.course_id = c.id and m.title = 'Module 1');
