-- BTB Academy - 07 course sales details. Run in Supabase > SQL Editor after 01-05. Additive and safe to re-run:
-- it only ADDS columns (nothing is dropped or changed), so existing courses, videos and orders are untouched.
--
-- courses.delivery             'recorded' (video lessons) or 'live' (live classes)
-- courses.duration_label       free text such as "2 months"
-- courses.compare_price_paise  the "original" price shown crossed out next to the real price (optional)
-- courses.tax_note             optional line under the price, e.g. "Inclusive of all taxes". Shown only if filled in.
-- courses.batch_times          one batch time per line; the student must pick one at checkout (optional)
-- courses.highlights           one bullet per line: "what you get" (optional)
-- orders.batch_choice          the batch time the student picked (set by the create-order function)
alter table public.courses add column if not exists delivery text not null default 'recorded';
alter table public.courses add column if not exists duration_label text;
alter table public.courses add column if not exists compare_price_paise integer;
alter table public.courses add column if not exists tax_note text;
alter table public.courses add column if not exists batch_times text;
alter table public.courses add column if not exists highlights text;
alter table public.orders  add column if not exists batch_choice text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'courses_delivery_check') then
    alter table public.courses add constraint courses_delivery_check check (delivery in ('recorded','live'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_duration_label_check') then
    alter table public.courses add constraint courses_duration_label_check check (char_length(duration_label) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_compare_price_check') then
    alter table public.courses add constraint courses_compare_price_check check (compare_price_paise is null or compare_price_paise between 0 and 100000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_tax_note_check') then
    alter table public.courses add constraint courses_tax_note_check check (char_length(tax_note) <= 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_batch_times_check') then
    alter table public.courses add constraint courses_batch_times_check check (char_length(batch_times) <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'courses_highlights_check') then
    alter table public.courses add constraint courses_highlights_check check (char_length(highlights) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_batch_choice_check') then
    alter table public.orders add constraint orders_batch_choice_check check (char_length(batch_choice) <= 100);
  end if;
end $$;
