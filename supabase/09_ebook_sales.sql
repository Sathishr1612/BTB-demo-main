-- BTB Academy - 09 ebook sales + server-side payment statistics.
-- Run AFTER 01-05 and 07. Additive and safe to re-run: it adds columns/tables/policies and replaces two functions.
-- Existing course orders, payments and enrollments are not changed.
--
--   ebooks.price_paise          0 = free. A PAID ebook must be an uploaded file (not an external link) so it can stay private.
--   orders.ebook_id             an order is now for exactly ONE product: a course OR an ebook
--   ebook_purchases             one row per (student, ebook) - created only by fulfill_order() after Razorpay is verified
--   ebooks_public (view)        what visitors may see of published ebooks: no file path unless the ebook is free
--   my_ebooks()                 the signed-in student's purchased ebooks (with the private file path)
--   can_download_ebook_path()   storage rule: admin, buyer, or a free published ebook
--   admin_payment_stats()       dashboard numbers computed in the database from verified payment rows (admins only)

-- ---------------------------------------------------------------------------
-- 1. Ebook price
-- ---------------------------------------------------------------------------
alter table public.ebooks add column if not exists price_paise integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'ebooks_price_check') then
    alter table public.ebooks add constraint ebooks_price_check check (price_paise = 0 or price_paise between 100 and 100000000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ebooks_paid_needs_file') then
    alter table public.ebooks add constraint ebooks_paid_needs_file check (price_paise = 0 or status = 'draft' or file_path is not null);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Orders can be for a course OR an ebook
-- ---------------------------------------------------------------------------
alter table public.orders alter column course_id drop not null;
alter table public.orders add column if not exists ebook_id uuid references public.ebooks(id) on delete restrict;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_one_product') then
    alter table public.orders add constraint orders_one_product check ((course_id is null) <> (ebook_id is null));
  end if;
end $$;
create index if not exists orders_ebook_idx on public.orders (ebook_id);

create table if not exists public.ebook_purchases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ebook_id   uuid not null references public.ebooks(id) on delete restrict,
  order_id   uuid references public.orders(id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (user_id, ebook_id)                -- a student can never buy the same ebook twice
);
create index if not exists ebook_purchases_user_idx on public.ebook_purchases (user_id);
alter table public.ebook_purchases enable row level security;
drop policy if exists ebook_purchases_read on public.ebook_purchases;
create policy ebook_purchases_read on public.ebook_purchases for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke all on public.ebook_purchases from anon, authenticated;
grant select on public.ebook_purchases to authenticated;       -- writes: service_role (fulfill_order) only

-- ---------------------------------------------------------------------------
-- 3. fulfill_order: same signature and same idempotency, now grants a course OR an ebook
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
    if o.course_id is not null then
      insert into public.enrollments (user_id, course_id, order_id) values (o.user_id, o.course_id, o.id)
      on conflict (user_id, course_id) do nothing;
    end if;
    if o.ebook_id is not null then
      insert into public.ebook_purchases (user_id, ebook_id, order_id) values (o.user_id, o.ebook_id, o.id)
      on conflict (user_id, ebook_id) do nothing;
    end if;
  end if;
  return case when was_paid then 'already_paid' else 'paid' end;
end $$;
revoke all on function public.fulfill_order(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.fulfill_order(text, text, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Public ebook catalogue + the student's own library
-- ---------------------------------------------------------------------------
-- A view owned by the migration role: it shows only published ebooks and only these columns.
-- free_file_path is filled only for FREE ebooks (paid files are never exposed here).
create or replace view public.ebooks_public as
  select id, title, description, cover_path, price_paise, created_at,
         case when price_paise = 0 then file_path end as free_file_path
  from public.ebooks where status = 'published';
revoke all on public.ebooks_public from public;
grant select on public.ebooks_public to anon, authenticated;

create or replace function public.my_ebooks()
returns table (id uuid, title text, description text, cover_path text, file_path text, granted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.description, e.cover_path, e.file_path, p.granted_at
  from public.ebook_purchases p join public.ebooks e on e.id = p.ebook_id
  where p.user_id = auth.uid() and e.file_path is not null
  order by p.granted_at desc;
$$;
revoke all on function public.my_ebooks() from public, anon;
grant execute on function public.my_ebooks() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private ebook files: signed URLs only for admins, buyers, or FREE published ebooks
-- ---------------------------------------------------------------------------
create or replace function public.can_download_ebook_path(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.ebooks e
    where e.file_path = p_path
      and ((e.status = 'published' and e.price_paise = 0)
           or exists (select 1 from public.ebook_purchases bp where bp.ebook_id = e.id and bp.user_id = auth.uid())));
$$;
revoke all on function public.can_download_ebook_path(text) from public;
grant execute on function public.can_download_ebook_path(text) to anon, authenticated;

drop policy if exists "ebooks: read if allowed" on storage.objects;
create policy "ebooks: read if allowed" on storage.objects for select to anon, authenticated
  using (bucket_id = 'ebook-files' and public.can_download_ebook_path(name));

-- ---------------------------------------------------------------------------
-- 6. Admin payment statistics, computed from verified rows (payments.status = 'captured')
-- ---------------------------------------------------------------------------
create or replace function public.admin_payment_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorised' using errcode = '42501'; end if;
  return jsonb_build_object(
    'orders_total',      (select count(*) from public.orders),
    'orders_paid',       (select count(*) from public.orders where status = 'paid'),
    'orders_pending',    (select count(*) from public.orders where status = 'pending'),
    'orders_failed',     (select count(*) from public.orders where status = 'failed'),
    'orders_cancelled',  (select count(*) from public.orders where status = 'cancelled'),
    'orders_incomplete', (select count(*) from public.orders where status = 'created'),
    'revenue_paise',     (select coalesce(sum(p.amount_paise), 0) from public.payments p join public.orders o on o.id = p.order_id where p.status = 'captured' and o.status = 'paid'),
    'course_sales',      (select count(*) from public.orders where status = 'paid' and course_id is not null),
    'course_revenue_paise', (select coalesce(sum(p.amount_paise), 0) from public.payments p join public.orders o on o.id = p.order_id where p.status = 'captured' and o.status = 'paid' and o.course_id is not null),
    'ebook_sales',       (select count(*) from public.orders where status = 'paid' and ebook_id is not null),
    'ebook_revenue_paise', (select coalesce(sum(p.amount_paise), 0) from public.payments p join public.orders o on o.id = p.order_id where p.status = 'captured' and o.status = 'paid' and o.ebook_id is not null)
  );
end $$;
revoke all on function public.admin_payment_stats() from public, anon;
grant execute on function public.admin_payment_stats() to authenticated;
