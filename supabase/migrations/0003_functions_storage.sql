-- =====================================================================
-- Functions, storage buckets and storage policies.
-- =====================================================================

-- ---------------------------------------------------------------- atomic credit changes
-- Locks the student's credit row, refuses to go below zero (returns NULL), writes the ledger.
-- Executable by the service role only (the server decides when credits move).
create or replace function public.adjust_credit(
  p_tutor uuid, p_student uuid, p_delta integer, p_reason text, p_booking uuid default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  new_balance integer;
begin
  insert into student_credits (tutor_id, student_id, balance)
  values (p_tutor, p_student, 0)
  on conflict (tutor_id, student_id) do nothing;

  update student_credits
     set balance = balance + p_delta
   where tutor_id = p_tutor and student_id = p_student and balance + p_delta >= 0
   returning balance into new_balance;          -- the row lock makes concurrent calls queue up

  if new_balance is null then
    return null;                                -- insufficient credits
  end if;

  insert into credit_ledger (tutor_id, student_id, delta, reason, booking_id)
  values (p_tutor, p_student, p_delta, p_reason, p_booking);
  return new_balance;
end $$;

revoke all on function public.adjust_credit(uuid, uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.adjust_credit(uuid, uuid, integer, text, uuid) to service_role;

-- ---------------------------------------------------------------- housekeeping
-- Frees slots whose payment window expired (the app also does this lazily when booking).
create or replace function public.release_expired_holds() returns integer
language sql security definer set search_path = public as $$
  with released as (
    update bookings set status = 'cancelled', cancelled_at = now()
     where status = 'pending_payment' and hold_expires_at < now()
    returning id
  ) select count(*)::integer from released;
$$;
revoke all on function public.release_expired_holds() from public, anon, authenticated;
grant execute on function public.release_expired_holds() to service_role;

-- OPTIONAL: schedule the reminder job from inside Supabase instead of Vercel Cron.
-- Needs the pg_cron and pg_net extensions (Dashboard > Database > Extensions).
-- select cron.schedule('tutorhub-reminders', '*/15 * * * *', $$
--   select net.http_get(
--     url := 'https://YOUR-APP.vercel.app/api/cron/reminders',
--     headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'));
-- $$);

-- ---------------------------------------------------------------- storage
-- "materials": PRIVATE bucket for tutor files, homework attachments and submissions (15 MB, PDF/images/audio).
-- "avatars":   PUBLIC bucket for profile photos (images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('materials', 'materials', false, 15728640,
   array['application/pdf','image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg']),
  ('avatars', 'avatars', true, 15728640, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = excluded.public;

-- Mirrors lib/files.ts: may the signed-in user read this object in the private bucket?
create or replace function public.can_read_material_file(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select
    split_part(p_path, '/', 1) = auth.uid()::text                         -- uploader
    or exists (                                                           -- student: assigned material
         select 1 from materials m join material_assignments a on a.material_id = m.id
          where m.storage_path = p_path
            and public.is_student_of(m.tutor_id)
            and (a.student_id is null or a.student_id = auth.uid()))
    or exists (                                                           -- student: homework attachment
         select 1 from assignments h
          where p_path = any (h.attachment_paths)
            and public.is_student_of(h.tutor_id)
            and (h.student_id is null or h.student_id = auth.uid()))
    or exists (                                                           -- tutor: a student's submission file
         select 1 from submissions s join assignments h on h.id = s.assignment_id
          where s.file_path = p_path and h.tutor_id = auth.uid());
$$;

create policy "materials: upload into your own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "materials: read what you may see" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and public.can_read_material_file(name));
create policy "materials: delete your own files" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars: manage your own" on storage.objects for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text);
