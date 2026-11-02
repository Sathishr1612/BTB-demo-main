-- BTB Academy - 10 live plans (Batch / Cluster / Personal Training) as sellable courses.
-- Run AFTER 01-05 and 07. Safe to re-run (existing rows with the same slug are left untouched).
-- live-classes.html and the home page link their "Enrol" buttons to course.html?c=<slug> for these three slugs,
-- where the normal Razorpay checkout runs. Prices are the ones shown on the site (Rs 4,999 / 9,999 / 19,999 for 2 months).
-- Change prices or add batch times later in Admin > Courses; the buttons keep working.
insert into public.courses (title, slug, description, level, status, display_order, price_paise, delivery, duration_label, highlights)
values
  ('Batch Classes', 'batch-classes',
   'Learn and practise with a group of fellow learners.', 'All levels', 'published', 20, 499900, 'live', '2 months',
   E'Live classes on Google Meet, Monday to Friday\nGroup of fellow learners\n2-month programme'),
  ('Cluster Classes', 'cluster-classes',
   'Practise in a smaller group with opportunities to participate and improve.', 'All levels', 'published', 21, 999900, 'live', '2 months',
   E'Live classes on Google Meet, Monday to Friday\nSmaller group, more speaking turns\n2-month programme'),
  ('Personal Training', 'personal-training',
   'One-to-one learning with individual attention.', 'All levels', 'published', 22, 1999900, 'live', '2 months',
   E'Live one-to-one classes on Google Meet, Monday to Friday\nIndividual attention\n2-month programme')
on conflict (slug) do nothing;
