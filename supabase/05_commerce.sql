-- BTB Academy - 05 commerce: prices, student access, orders/payments, ebooks, bookings.
-- Run AFTER 01-03. Additive and safe to re-run: it adds columns/tables/policies and never drops data.
-- (It replaces three READ policies - modules, videos, and course-video storage - with stricter versions.)

-- ---------------------------------------------------------------------------
-- 1. New columns on existing tables
-- ---------------------------------------------------------------------------
-- Price is stored in paise (INR x 100) as an integer. 0 = free course.
alter table public.courses add column if not exists price_paise integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'courses_price_check') then
    alter table public.courses add constraint courses_price_check check (price_paise between 0 and 100000000);
  end if;
end $$;

-- Modules can now be published/unpublished. Existing modules stay visible ('published').
alter table public.modules add column if not exists status text not null default 'published';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'modules_status_check') then
    alter table public.modules add constraint modules_status_check check (status in ('draft','published'));
  end if;
end $$;

-- A preview lesson of a paid course can be watched without buying.
alter table public.videos add column if not exists is_preview boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Commerce tables. Clients can only READ their own rows; every write is made by the
--    Edge Functions with the service_role key after Razorpay has been verified.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id) on delete set null,
  course_id         uuid not null references public.courses(id) on delete restrict,
  student_email     text,
  student_name      text,
  amount_paise      integer not null check (amount_paise > 0),
  currency          text not null default 'INR' check (currency = 'INR'),
  status            text not null default 'created' check (status in ('created','pending','paid','failed','cancelled')),
  razorpay_order_id text unique,
  paid_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders(id) on delete cascade,
  razorpay_payment_id text not null unique,
  amount_paise        integer not null,
  currency            text not null default 'INR',
  status              text not null check (status in ('captured','failed')),
  method              text,
  error_description   text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.enrollments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete restrict,
  order_id   uuid references public.orders(id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (user_id, course_id)               -- a student can never hold the same course twice
);

-- Razorpay webhook de-duplication
create table if not exists public.webhook_events (
  event_id    text primary key,
  event       text,
  received_at timestamptz not null default now()
);

create index if not exists orders_user_idx       on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx     on public.orders (status, created_at desc);
create index if not exists payments_order_idx    on public.payments (order_id);
create index if not exists enrollments_user_idx  on public.enrollments (user_id);

drop trigger if exists orders_updated on public.orders;
create trigger orders_updated before update on public.orders for each row execute function public.set_updated_at();
drop trigger if exists payments_updated on public.payments;
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Ebooks and live-class bookings
-- ---------------------------------------------------------------------------
create table if not exists public.ebooks (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 2 and 160),
  description  text check (char_length(description) <= 4000),
  cover_path   text,                       -- in the public course-thumbnails bucket
  file_path    text,                       -- in the private ebook-files bucket
  download_url text check (download_url is null or download_url ~* '^https://'),
  status       text not null default 'draft' check (status in ('draft','published')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ebooks_publish_needs_file check (status = 'draft' or file_path is not null or download_url is not null)
);
drop trigger if exists ebooks_updated on public.ebooks;
create trigger ebooks_updated before update on public.ebooks for each row execute function public.set_updated_at();

create table if not exists public.bookings (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 2 and 80),
  contact        text not null check (char_length(btrim(contact)) between 5 and 120),
  preferred_slot text check (char_length(preferred_slot) <= 120),
  message        text check (char_length(message) <= 1000),
  status         text not null default 'new' check (status in ('new','confirmed','completed','cancelled')),
  admin_notes    text check (char_length(admin_notes) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists bookings_created_idx on public.bookings (created_at desc);
drop trigger if exists bookings_updated on public.bookings;
create trigger bookings_updated before update on public.bookings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Access functions (SECURITY DEFINER so they can read enrollments)
-- ---------------------------------------------------------------------------
-- May the caller watch the paid/free lessons of this course?
create or replace function public.has_course_access(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.courses c
    where c.id = p_course and c.status = 'published'
      and (c.price_paise = 0 or exists (select 1 from public.enrollments e where e.course_id = c.id and e.user_id = auth.uid())));
$$;
revoke all on function public.has_course_access(uuid) from public;
grant execute on function public.has_course_access(uuid) to anon, authenticated;

-- May the caller create a signed URL for this stored video file?
create or replace function public.can_stream_video_path(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.videos v
    join public.courses c on c.id = v.course_id
    join public.modules m on m.id = v.module_id
    where v.video_storage_path = p_path and v.status = 'published' and c.status = 'published' and m.status = 'published'
      and (c.price_paise = 0 or v.is_preview
           or exists (select 1 from public.enrollments e where e.course_id = c.id and e.user_id = auth.uid())));
$$;
revoke all on function public.can_stream_video_path(text) from public;
grant execute on function public.can_stream_video_path(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Payment fulfilment. Callable ONLY with the service_role key (Edge Functions).
--    Idempotent: replaying the same payment never creates a second payment row or enrollment.
-- ---------------------------------------------------------------------------
create or replace function public.fulfill_order(p_rzp_order text, p_rzp_payment text, p_amount integer, p_currency text, p_method text)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; was_paid boolean;
begin
  select * into o from public.orders where razorpay_order_id = p_rzp_order for update;
  if not found then return 'unknown_order'; end if;
  if p_amount <> o.amount_paise or upper(p_currency) <> o.currency then return 'amount_mismatch'; end if;
  was_paid := (o.status = 'paid');

  insert into public.payments (order_id, razorpay_payment_id, amount_paise, currency, status, method)
  values (o.id, p_rzp_payment, p_amount, o.currency, 'captured', p_method)
  on conflict (razorpay_payment_id) do update set status = 'captured', method = coalesce(excluded.method, public.payments.method), error_description = null;

  if not was_paid then update public.orders set status = 'paid', paid_at = now() where id = o.id; end if;
  if o.user_id is not null then
    insert into public.enrollments (user_id, course_id, order_id) values (o.user_id, o.course_id, o.id)
    on conflict (user_id, course_id) do nothing;
  end if;
  return case when was_paid then 'already_paid' else 'paid' end;
end $$;
revoke all on function public.fulfill_order(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.fulfill_order(text, text, integer, text, text) to service_role;

-- Record a failed attempt. Never touches an order that is already paid.
create or replace function public.record_failed_payment(p_rzp_order text, p_rzp_payment text, p_amount integer, p_method text, p_error text)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where razorpay_order_id = p_rzp_order for update;
  if not found then return 'unknown_order'; end if;
  insert into public.payments (order_id, razorpay_payment_id, amount_paise, currency, status, method, error_description)
  values (o.id, p_rzp_payment, coalesce(p_amount, o.amount_paise), o.currency, 'failed', p_method, left(p_error, 500))
  on conflict (razorpay_payment_id) do nothing;   -- never downgrade a captured payment
  if o.status in ('created','pending','cancelled') then update public.orders set status = 'failed' where id = o.id; end if;
  return 'recorded';
end $$;
revoke all on function public.record_failed_payment(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.record_failed_payment(text, text, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.orders         enable row level security;
alter table public.payments       enable row level security;
alter table public.enrollments    enable row level security;
alter table public.webhook_events enable row level security;
alter table public.ebooks         enable row level security;
alter table public.bookings       enable row level security;

drop policy if exists orders_read on public.orders;
create policy orders_read on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = payments.order_id and o.user_id = auth.uid()));
drop policy if exists enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments for select to authenticated using (user_id = auth.uid() or public.is_admin());
-- webhook_events: no policy = no client access at all.

-- Ebooks: admin only for now (no public ebook page exists yet; add a public SELECT policy when one is built).
drop policy if exists ebooks_admin_all on public.ebooks;
create policy ebooks_admin_all on public.ebooks for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Bookings: anyone may submit a new request; only admins read/update/delete.
drop policy if exists bookings_public_insert on public.bookings;
create policy bookings_public_insert on public.bookings for insert to anon, authenticated with check (status = 'new' and admin_notes is null);
drop policy if exists bookings_admin_read on public.bookings;
create policy bookings_admin_read on public.bookings for select to authenticated using (public.is_admin());
drop policy if exists bookings_admin_update on public.bookings;
create policy bookings_admin_update on public.bookings for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists bookings_admin_delete on public.bookings;
create policy bookings_admin_delete on public.bookings for delete to authenticated using (public.is_admin());

-- Stricter public read: modules/videos must be published, and so must their parents.
drop policy if exists modules_public_read on public.modules;
create policy modules_public_read on public.modules for select to anon, authenticated
  using (public.is_admin() or (status = 'published' and exists (select 1 from public.courses c where c.id = modules.course_id and c.status = 'published')));
drop policy if exists videos_public_read on public.videos;
create policy videos_public_read on public.videos for select to anon, authenticated
  using (public.is_admin() or (status = 'published'
    and exists (select 1 from public.courses c where c.id = videos.course_id and c.status = 'published')
    and exists (select 1 from public.modules m where m.id = videos.module_id and m.status = 'published')));

-- Table privileges
revoke all on public.orders, public.payments, public.enrollments, public.webhook_events, public.ebooks, public.bookings from anon, authenticated;
grant select on public.orders, public.payments, public.enrollments to authenticated;
grant select, insert, update, delete on public.ebooks to authenticated;
grant insert on public.bookings to anon, authenticated;
grant select, update, delete on public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Storage: paid videos need an enrollment; ebook files in a new private bucket
-- ---------------------------------------------------------------------------
drop policy if exists "videos: public read published" on storage.objects;
drop policy if exists "videos: read if allowed" on storage.objects;
create policy "videos: read if allowed" on storage.objects for select to anon, authenticated
  using (bucket_id = 'course-videos' and public.can_stream_video_path(name));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ebook-files', 'ebook-files', false, 52428800, array['application/pdf','application/epub+zip'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ebooks: admin all" on storage.objects;
create policy "ebooks: admin all" on storage.objects for all to authenticated
  using (bucket_id = 'ebook-files' and public.is_admin()) with check (bucket_id = 'ebook-files' and public.is_admin());
