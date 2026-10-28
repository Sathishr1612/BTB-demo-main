-- BTB Academy - 02 security (Row Level Security). Run after 01_schema.sql. Safe to re-run.

-- Is the calling user an administrator? (SECURITY DEFINER so it can read admins)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

alter table public.admins    enable row level security;
alter table public.courses   enable row level security;
alter table public.modules   enable row level security;
alter table public.videos    enable row level security;
alter table public.enquiries enable row level security;

-- admins: an admin may read their own row (the dashboard uses this to verify access).
-- Nobody can write this table through the API; add admins via the SQL Editor only.
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins for select to authenticated using (user_id = auth.uid());

-- courses ---------------------------------------------------------------------
drop policy if exists courses_public_read on public.courses;
create policy courses_public_read on public.courses for select to anon, authenticated
  using (status = 'published' or public.is_admin());
drop policy if exists courses_admin_write on public.courses;
create policy courses_admin_write on public.courses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- modules: visible publicly only inside a published course --------------------
drop policy if exists modules_public_read on public.modules;
create policy modules_public_read on public.modules for select to anon, authenticated
  using (public.is_admin() or exists (select 1 from public.courses c where c.id = modules.course_id and c.status = 'published'));
drop policy if exists modules_admin_write on public.modules;
create policy modules_admin_write on public.modules for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- videos: visible publicly only when published AND the course is published ----
drop policy if exists videos_public_read on public.videos;
create policy videos_public_read on public.videos for select to anon, authenticated
  using (public.is_admin() or (status = 'published' and exists (select 1 from public.courses c where c.id = videos.course_id and c.status = 'published')));
drop policy if exists videos_admin_write on public.videos;
create policy videos_admin_write on public.videos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- enquiries: anyone may submit (length limits enforced by CHECK constraints);
-- only admins can read or change them. Visitors can never read submissions.
drop policy if exists enquiries_public_insert on public.enquiries;
create policy enquiries_public_insert on public.enquiries for insert to anon, authenticated
  with check (is_read = false);
drop policy if exists enquiries_admin_read on public.enquiries;
create policy enquiries_admin_read on public.enquiries for select to authenticated using (public.is_admin());
drop policy if exists enquiries_admin_update on public.enquiries;
create policy enquiries_admin_update on public.enquiries for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists enquiries_admin_delete on public.enquiries;
create policy enquiries_admin_delete on public.enquiries for delete to authenticated using (public.is_admin());

-- Table privileges (RLS still applies on top of these) ------------------------
revoke all on public.admins, public.courses, public.modules, public.videos, public.enquiries from anon, authenticated;
grant select on public.courses, public.modules, public.videos to anon, authenticated;
grant insert on public.enquiries to anon, authenticated;
grant select on public.admins to authenticated;
grant insert, update, delete on public.courses, public.modules, public.videos to authenticated;
grant select, update, delete on public.enquiries to authenticated;

-- Atomic re-ordering: p_ids is the desired order, first item = position 1.
create or replace function public.reorder_items(p_table text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorised' using errcode = '42501'; end if;
  if p_table not in ('courses','modules','videos') then raise exception 'invalid table'; end if;
  execute format(
    'update public.%I t set display_order = o.ord from (select id, ord from unnest($1) with ordinality as u(id, ord)) o where t.id = o.id', p_table)
  using p_ids;
end $$;
revoke all on function public.reorder_items(text, uuid[]) from public, anon;
grant execute on function public.reorder_items(text, uuid[]) to authenticated;
