-- =====================================================================
-- Row Level Security. Every table has RLS enabled; no policy = no access.
--
-- Principles
--  * A student sees only their own rows (plus public-ish rows of tutors they are linked to).
--  * A tutor sees only rows that belong to them or to their own students.
--  * Anything involving two parties' data (creating bookings, credits, payments,
--    subscriptions, accepting invites) has NO write policy for end users: the
--    server does it with the service-role key after its own authorisation checks.
--  * The service-role key bypasses RLS, so it is used only in server code (webhooks,
--    cron, public tutor pages, atomic operations) and never sent to the browser.
-- =====================================================================

-- Helper functions are SECURITY DEFINER so policies can look at tutor_students
-- without triggering that table's own RLS (which would recurse).
create or replace function public.is_tutor_of(p_student uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tutor_students
                 where tutor_id = auth.uid() and student_id = p_student and status <> 'invited');
$$;

create or replace function public.is_student_of(p_tutor uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tutor_students
                 where student_id = auth.uid() and tutor_id = p_tutor and status = 'active');
$$;

alter table public.profiles                enable row level security;
alter table public.tutor_profiles          enable row level security;
alter table public.student_profiles        enable row level security;
alter table public.tutor_students          enable row level security;
alter table public.availability_rules      enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.bookings                enable row level security;
alter table public.lesson_packages         enable row level security;
alter table public.student_credits         enable row level security;
alter table public.credit_ledger           enable row level security;
alter table public.payments                enable row level security;
alter table public.materials               enable row level security;
alter table public.material_assignments    enable row level security;
alter table public.lesson_notes            enable row level security;
alter table public.assignments             enable row level security;
alter table public.submissions             enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.notifications           enable row level security;
alter table public.stripe_events           enable row level security;   -- no policies: service role only

-- ---------------------------------------------------------------- profiles
create policy profiles_select_self    on public.profiles for select using (id = auth.uid());
create policy profiles_select_students on public.profiles for select using (public.is_tutor_of(id));
create policy profiles_select_tutors  on public.profiles for select using (public.is_student_of(id));
-- Users can edit their own profile but not switch role
create policy profiles_update_self    on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- ---------------------------------------------------------------- tutor / student profiles
create policy tutor_profiles_select_self on public.tutor_profiles for select using (user_id = auth.uid());
create policy tutor_profiles_select_students on public.tutor_profiles for select using (public.is_student_of(user_id));
create policy tutor_profiles_insert_self on public.tutor_profiles for insert
  with check (user_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'tutor'));
create policy tutor_profiles_update_self on public.tutor_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Public tutor pages are rendered by the server with the service role, so anonymous visitors
-- never get direct table access (and never see stripe_account_id).

create policy student_profiles_select_self on public.student_profiles for select using (user_id = auth.uid());
create policy student_profiles_select_tutors on public.student_profiles for select using (public.is_tutor_of(user_id));
create policy student_profiles_insert_self on public.student_profiles for insert
  with check (user_id = auth.uid() and exists (select 1 from public.profiles where id = auth.uid() and role = 'student'));
create policy student_profiles_update_self on public.student_profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- tutor <-> student links
create policy tutor_students_select on public.tutor_students for select using (tutor_id = auth.uid() or student_id = auth.uid());
create policy tutor_students_insert on public.tutor_students for insert with check (tutor_id = auth.uid());
create policy tutor_students_update on public.tutor_students for update using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());
create policy tutor_students_delete on public.tutor_students for delete using (tutor_id = auth.uid());

-- ---------------------------------------------------------------- availability
create policy availability_rules_owner on public.availability_rules for all using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());
create policy availability_rules_students on public.availability_rules for select using (public.is_student_of(tutor_id));
create policy availability_exceptions_owner on public.availability_exceptions for all using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());

-- ---------------------------------------------------------------- bookings, credits, payments (read-only for users)
create policy bookings_select on public.bookings for select using (tutor_id = auth.uid() or student_id = auth.uid());

create policy lesson_packages_owner on public.lesson_packages for all using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());
create policy lesson_packages_students on public.lesson_packages for select using (public.is_student_of(tutor_id) and active);

create policy student_credits_select on public.student_credits for select using (tutor_id = auth.uid() or student_id = auth.uid());
create policy credit_ledger_select on public.credit_ledger for select using (tutor_id = auth.uid() or student_id = auth.uid());
create policy payments_select on public.payments for select using (tutor_id = auth.uid() or student_id = auth.uid());

-- ---------------------------------------------------------------- materials
create policy materials_owner on public.materials for all using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());
-- Students: only materials assigned to them (or to "all") by a tutor they are linked to
create policy materials_students on public.materials for select using (
  public.is_student_of(tutor_id) and exists (
    select 1 from public.material_assignments a
    where a.material_id = materials.id and (a.student_id is null or a.student_id = auth.uid())
  )
);
create policy material_assignments_owner on public.material_assignments for all
  using (tutor_id = auth.uid())
  with check (tutor_id = auth.uid() and exists (select 1 from public.materials m where m.id = material_id and m.tutor_id = auth.uid()));
create policy material_assignments_students on public.material_assignments for select using (
  public.is_student_of(tutor_id) and (student_id is null or student_id = auth.uid())
);

-- ---------------------------------------------------------------- lesson notes
create policy lesson_notes_owner on public.lesson_notes for all
  using (author_id = auth.uid())
  with check (author_id = auth.uid() and exists (select 1 from public.bookings b where b.id = booking_id and b.tutor_id = auth.uid()));
create policy lesson_notes_students on public.lesson_notes for select using (
  visible_to_student and exists (select 1 from public.bookings b where b.id = booking_id and b.student_id = auth.uid())
);

-- ---------------------------------------------------------------- homework
create policy assignments_owner on public.assignments for all using (tutor_id = auth.uid()) with check (tutor_id = auth.uid());
create policy assignments_students on public.assignments for select using (
  public.is_student_of(tutor_id) and (student_id is null or student_id = auth.uid())
);

create policy submissions_student_select on public.submissions for select using (student_id = auth.uid());
create policy submissions_student_insert on public.submissions for insert with check (
  student_id = auth.uid() and exists (
    select 1 from public.assignments a
    where a.id = assignment_id and public.is_student_of(a.tutor_id) and (a.student_id is null or a.student_id = auth.uid())
  )
);
-- A student may edit their answer until the tutor has graded it
create policy submissions_student_update on public.submissions for update
  using (student_id = auth.uid() and graded_at is null) with check (student_id = auth.uid());
create policy submissions_tutor_select on public.submissions for select using (
  exists (select 1 from public.assignments a where a.id = assignment_id and a.tutor_id = auth.uid())
);
create policy submissions_tutor_update on public.submissions for update using (
  exists (select 1 from public.assignments a where a.id = assignment_id and a.tutor_id = auth.uid())
);

-- ---------------------------------------------------------------- subscriptions & notifications
create policy subscriptions_select on public.subscriptions for select using (tutor_id = auth.uid());
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
