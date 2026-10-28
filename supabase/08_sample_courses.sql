-- BTB Academy - 08 SAMPLE courses (optional). Run AFTER 07_course_sales.sql. Safe to re-run.
-- Two clearly marked sample courses so you can see the new course page: one recorded, one live.
-- Titles start with "Sample:", the texts say SAMPLE, and the times and the recorded-course price are placeholders.
-- Replace them in Admin > Courses with real content, or delete them before launch.
insert into public.courses
  (title, slug, description, objectives, level, status, display_order, price_paise, compare_price_paise, tax_note, delivery, duration_label, batch_times, highlights)
values
  ('Sample: Spoken English - Recorded', 'sample-spoken-english-recorded',
   'SAMPLE TEXT - replace this with the real course description.',
   E'Speak with more confidence\nBuild everyday vocabulary\nPractise real conversations',
   'Beginner', 'published', 10, 149900, 299900, 'Inclusive of all taxes', 'recorded', null, null,
   E'Video lessons grouped into modules\nWatch on phone or computer\nInstant access after payment'),
  ('Sample: Batch Classes (2 months)', 'sample-batch-classes',
   'SAMPLE TEXT - replace this with the real course description.',
   E'Practise speaking with a group\nImprove fluency step by step',
   'All levels', 'published', 11, 499900, null, null, 'live', '2 months',
   E'Morning batch (sample time)\nEvening batch (sample time)',
   E'Live classes on Google Meet, Monday to Friday\nLearn and practise with a group of fellow learners\nRecordings and materials after each class')
on conflict (slug) do nothing;

insert into public.modules (course_id, title, description, status, display_order)
select c.id, 'Module 1', 'SAMPLE module', 'published', 1
from public.courses c
where c.slug in ('sample-spoken-english-recorded', 'sample-batch-classes')
  and not exists (select 1 from public.modules m where m.course_id = c.id and m.title = 'Module 1');
