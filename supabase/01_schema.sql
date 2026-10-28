-- BTB Academy - 01 schema. Run in Supabase Dashboard > SQL Editor. Safe to re-run.
create extension if not exists pgcrypto;

-- Shared trigger: keep updated_at fresh -------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Admin allow-list (authorisation lives in the database, not in the browser) -
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Courses --------------------------------------------------------------------
create table if not exists public.courses (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(btrim(title)) between 2 and 120),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 140),
  description    text check (char_length(description) <= 4000),
  objectives     text check (char_length(objectives) <= 4000), -- one learning objective per line
  thumbnail_path text,
  level          text check (level is null or level in ('Beginner','Intermediate','Advanced','All levels')),
  status         text not null default 'draft' check (status in ('draft','published')),
  display_order  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Modules (belong to exactly one course) -------------------------------------
create table if not exists public.modules (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses(id) on delete restrict,
  title         text not null check (char_length(btrim(title)) between 2 and 120),
  description   text check (char_length(description) <= 2000),
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, course_id)  -- lets videos reference (module, course) as a pair
);

-- Videos ---------------------------------------------------------------------
-- The composite foreign key (module_id, course_id) -> modules(id, course_id)
-- makes it impossible to store a video whose module belongs to another course.
create table if not exists public.videos (
  id                 uuid primary key default gen_random_uuid(),
  course_id          uuid not null references public.courses(id) on delete restrict,
  module_id          uuid not null,
  title              text not null check (char_length(btrim(title)) between 2 and 160),
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 180),
  description        text check (char_length(description) <= 4000),
  video_storage_path text not null,
  thumbnail_path     text,
  duration_seconds   integer check (duration_seconds is null or duration_seconds >= 0),
  status             text not null default 'draft' check (status in ('draft','published')),
  display_order      integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint videos_module_in_course_fk
    foreign key (module_id, course_id) references public.modules (id, course_id) on delete restrict
);

-- Contact-form enquiries -----------------------------------------------------
create table if not exists public.enquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 2 and 80),
  contact    text not null check (char_length(btrim(contact)) between 5 and 120),
  message    text not null check (char_length(btrim(message)) between 5 and 1000),
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- Indexes --------------------------------------------------------------------
create index if not exists courses_status_order_idx  on public.courses (status, display_order);
create index if not exists modules_course_order_idx  on public.modules (course_id, display_order);
create index if not exists videos_course_idx         on public.videos (course_id);
create index if not exists videos_module_order_idx   on public.videos (module_id, display_order);
create index if not exists videos_status_idx         on public.videos (status);
create index if not exists enquiries_created_idx     on public.enquiries (created_at desc);

-- updated_at triggers --------------------------------------------------------
drop trigger if exists courses_updated on public.courses;
create trigger courses_updated before update on public.courses for each row execute function public.set_updated_at();
drop trigger if exists modules_updated on public.modules;
create trigger modules_updated before update on public.modules for each row execute function public.set_updated_at();
drop trigger if exists videos_updated on public.videos;
create trigger videos_updated before update on public.videos for each row execute function public.set_updated_at();
