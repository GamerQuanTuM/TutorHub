-- =====================================================================
-- 0005: student reviews and an optional buffer between lessons.
--
-- Reviews: a student can leave ONE rating (1-5) and a short comment for a lesson they actually had
-- (booking status "completed"). Reviews are public on the tutor's booking page, which is rendered
-- with the service role, so the RLS policy below only lets the two people involved read rows.
-- There is deliberately no insert/update policy: the server writes reviews after its own checks.
--
-- Buffer: minutes the tutor wants free after each lesson (0 = back-to-back). The slot generator
-- uses it so students cannot book a lesson right after another one.
-- =====================================================================

create table public.reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references public.bookings (id) on delete cascade,   -- one review per lesson
  tutor_id    uuid not null references public.profiles (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  rating      integer not null check (rating between 1 and 5),
  comment     text not null default '' check (char_length(comment) <= 1000),
  created_at  timestamptz not null default now()
);

create index reviews_tutor_idx on public.reviews (tutor_id, created_at desc);

alter table public.reviews enable row level security;
create policy reviews_select_parties on public.reviews for select
  using (tutor_id = auth.uid() or student_id = auth.uid());

alter table public.tutor_profiles
  add column if not exists buffer_min integer not null default 0 check (buffer_min between 0 and 60);
