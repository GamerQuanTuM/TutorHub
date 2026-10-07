-- =====================================================================
-- TutorHub schema. All timestamps are timestamptz (UTC). Run migrations in order.
-- Column names are snake_case versions of the camelCase fields in src/lib/types.ts.
-- =====================================================================

create extension if not exists btree_gist;   -- needed for the double-booking exclusion constraint

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('tutor', 'student')),
  full_name   text not null,
  email       text not null,
  avatar_url  text,
  timezone    text not null default 'UTC',
  created_at  timestamptz not null default now()
);

create table public.tutor_profiles (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  slug                    text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  headline                text not null default '',
  bio                     text not null default '',
  intro_video_url         text,
  subjects                text[] not null default '{}',
  hourly_price_cents      integer not null default 3000 check (hourly_price_cents >= 0),
  currency                text not null default 'eur' check (currency in ('eur', 'usd', 'gbp')),
  durations               integer[] not null default '{30,60}',
  trial_enabled           boolean not null default true,
  trial_duration_min      integer not null default 30,
  cancel_free_hours       integer not null default 24 check (cancel_free_hours between 0 and 168),
  reschedule_free_hours   integer not null default 12 check (reschedule_free_hours between 0 and 168),
  min_notice_hours        integer not null default 2 check (min_notice_hours between 0 and 168),
  stripe_account_id       text,
  stripe_charges_enabled  boolean not null default false,
  onboarding_done         boolean not null default false,
  created_at              timestamptz not null default now()
);

create table public.student_profiles (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  learning_goal        text not null default '',
  level                text not null default 'A1',
  birth_date           date,
  is_minor             boolean not null default false,
  parental_consent     boolean not null default false,       -- under-18s: a parent/guardian consented
  parental_consent_at  timestamptz,
  onboarding_done      boolean not null default false,
  created_at           timestamptz not null default now(),
  -- a minor cannot finish onboarding without recorded consent
  constraint minor_needs_consent check (not (is_minor and onboarding_done) or parental_consent)
);

-- ---------------------------------------------------------------- relationships
create table public.tutor_students (
  id               uuid primary key default gen_random_uuid(),
  tutor_id         uuid not null references public.profiles (id) on delete cascade,
  student_id       uuid references public.profiles (id) on delete cascade,  -- null until an invite is accepted
  status           text not null default 'active' check (status in ('invited', 'active', 'archived')),
  private_notes    text not null default '',
  invite_token     text unique,
  invited_email    text,
  invited_name     text,
  invited_credits  integer not null default 0 check (invited_credits >= 0),
  created_at       timestamptz not null default now(),
  unique (tutor_id, student_id)
);
create index tutor_students_student_idx on public.tutor_students (student_id);
create index tutor_students_tutor_idx on public.tutor_students (tutor_id, status);

-- ---------------------------------------------------------------- availability
create table public.availability_rules (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid not null references public.profiles (id) on delete cascade,
  weekday     smallint not null check (weekday between 1 and 7),   -- ISO: 1 = Monday
  start_time  time not null,                                      -- wall-clock time in the tutor's time zone
  end_time    time not null,
  check (start_time < end_time)
);
create index availability_rules_tutor_idx on public.availability_rules (tutor_id, weekday);

create table public.availability_exceptions (
  id         uuid primary key default gen_random_uuid(),
  tutor_id   uuid not null references public.profiles (id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  reason     text not null default '',
  check (starts_at < ends_at)
);
create index availability_exceptions_tutor_idx on public.availability_exceptions (tutor_id, starts_at);

-- ---------------------------------------------------------------- payments & packages
create table public.lesson_packages (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references public.profiles (id) on delete cascade,
  name          text not null,
  lesson_count  integer not null check (lesson_count between 2 and 100),
  price_cents   integer not null check (price_cents > 0),
  currency      text not null default 'eur',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);
create index lesson_packages_tutor_idx on public.lesson_packages (tutor_id);

create table public.student_credits (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid not null references public.profiles (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  balance     integer not null default 0 check (balance >= 0),   -- can never go negative
  created_at  timestamptz not null default now(),
  unique (tutor_id, student_id)
);

create table public.payments (
  id                        uuid primary key default gen_random_uuid(),
  tutor_id                  uuid not null references public.profiles (id) on delete cascade,
  student_id                uuid not null references public.profiles (id) on delete cascade,
  booking_id                uuid,                                  -- FK added below (bookings is created after)
  package_id                uuid references public.lesson_packages (id) on delete set null,
  amount_cents              integer not null check (amount_cents >= 0),
  currency                  text not null default 'eur',
  status                    text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  stripe_session_id         text unique,
  stripe_payment_intent_id  text unique,
  refunded_cents            integer not null default 0,
  paid_at                   timestamptz,
  created_at                timestamptz not null default now()
);
create index payments_tutor_idx on public.payments (tutor_id, paid_at desc);
create index payments_student_idx on public.payments (student_id);

-- ---------------------------------------------------------------- bookings
create table public.bookings (
  id                      uuid primary key default gen_random_uuid(),
  tutor_id                uuid not null references public.profiles (id) on delete cascade,
  student_id              uuid not null references public.profiles (id) on delete cascade,
  starts_at               timestamptz not null,
  ends_at                 timestamptz not null,
  duration_min            integer not null check (duration_min > 0),
  status                  text not null default 'confirmed'
                            check (status in ('pending_payment', 'confirmed', 'cancelled', 'completed', 'no_show')),
  is_trial                boolean not null default false,
  room_name               text not null unique,                    -- unguessable Jitsi room: "tutorhub-<uuid>"
  paid_with               text not null check (paid_with in ('card', 'credit', 'trial')),
  price_cents             integer not null default 0,
  currency                text not null default 'eur',
  payment_id              uuid references public.payments (id) on delete set null,
  hold_expires_at         timestamptz,                             -- unpaid slots are held until this time
  cancelled_by            text check (cancelled_by in ('tutor', 'student')),
  cancelled_at            timestamptz,
  day_reminder_sent_at    timestamptz,
  hour_reminder_sent_at   timestamptz,
  created_at              timestamptz not null default now(),
  check (starts_at < ends_at),
  -- DOUBLE-BOOKING GUARD: a tutor cannot have two active bookings that overlap in time.
  -- Enforced by the database itself, so it holds even with concurrent requests.
  constraint bookings_no_overlap exclude using gist (
    tutor_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending_payment', 'confirmed'))
);
create index bookings_tutor_idx on public.bookings (tutor_id, starts_at);
create index bookings_student_idx on public.bookings (student_id, starts_at);
create index bookings_status_idx on public.bookings (status, starts_at);

alter table public.payments
  add constraint payments_booking_fk foreign key (booking_id) references public.bookings (id) on delete set null;

create table public.credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  tutor_id    uuid not null references public.profiles (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  delta       integer not null,
  reason      text not null,
  booking_id  uuid references public.bookings (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index credit_ledger_idx on public.credit_ledger (tutor_id, student_id, created_at desc);

-- ---------------------------------------------------------------- teaching content
create table public.materials (
  id            uuid primary key default gen_random_uuid(),
  tutor_id      uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('file', 'link')),
  title         text not null,
  storage_path  text,
  url           text,
  mime          text,
  size_bytes    bigint check (size_bytes is null or size_bytes <= 15728640),   -- 15 MB
  created_at    timestamptz not null default now(),
  check ((kind = 'file' and storage_path is not null) or (kind = 'link' and url is not null))
);
create index materials_tutor_idx on public.materials (tutor_id, created_at desc);

create table public.material_assignments (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references public.materials (id) on delete cascade,
  tutor_id     uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid references public.profiles (id) on delete cascade,        -- null = all of the tutor's students
  created_at   timestamptz not null default now()
);
create index material_assignments_student_idx on public.material_assignments (student_id);
create index material_assignments_material_idx on public.material_assignments (material_id);

create table public.lesson_notes (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references public.bookings (id) on delete cascade,
  author_id           uuid not null references public.profiles (id) on delete cascade,
  body                text not null default '',
  visible_to_student  boolean not null default false,
  updated_at          timestamptz not null default now()
);

create table public.assignments (
  id                uuid primary key default gen_random_uuid(),
  tutor_id          uuid not null references public.profiles (id) on delete cascade,
  student_id        uuid references public.profiles (id) on delete cascade,   -- null = all students
  title             text not null,
  description       text not null default '',
  due_at            timestamptz not null,
  attachment_paths  text[] not null default '{}',
  created_at        timestamptz not null default now()
);
create index assignments_tutor_idx on public.assignments (tutor_id, due_at);
create index assignments_student_idx on public.assignments (student_id);

create table public.submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments (id) on delete cascade,
  student_id     uuid not null references public.profiles (id) on delete cascade,
  text           text not null default '',
  file_path      text,
  submitted_at   timestamptz not null default now(),
  feedback       text not null default '',
  mark           text,
  graded_at      timestamptz,
  unique (assignment_id, student_id)
);
create index submissions_assignment_idx on public.submissions (assignment_id);

-- ---------------------------------------------------------------- billing & misc
create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  tutor_id                 uuid not null unique references public.profiles (id) on delete cascade,
  plan                     text not null default 'free' check (plan in ('free', 'pro')),
  status                   text not null default 'active' check (status in ('active', 'past_due', 'canceled')),
  stripe_customer_id       text,
  stripe_subscription_id   text unique,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now()
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null default '',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- Webhook idempotency: a Stripe event id is processed at most once.
create table public.stripe_events (
  id            text primary key,
  type          text not null,
  processed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- new-user trigger
-- Creates the profile row when someone signs up (email/password or Google).
-- The role comes from the sign-up form (raw_user_meta_data.role), defaulting to student.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'tutor' then 'tutor' else 'student' end,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
