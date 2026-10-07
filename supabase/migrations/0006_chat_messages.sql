-- =====================================================================
-- 0006: saved lesson chat.
--
-- Messages between the two people of one booking (tutor and student). They are kept so the conversation is
-- still there after the lesson. Only those two people can read them (policy below). There is deliberately no
-- insert/update policy: the server writes messages after checking the sender belongs to the booking, so nobody can
-- post into someone else's lesson by calling the table directly.
-- =====================================================================

create table public.messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index messages_booking_idx on public.messages (booking_id, created_at);

alter table public.messages enable row level security;
create policy messages_select_parties on public.messages for select using (
  exists (
    select 1 from public.bookings b
    where b.id = messages.booking_id and (b.tutor_id = auth.uid() or b.student_id = auth.uid())
  )
);
