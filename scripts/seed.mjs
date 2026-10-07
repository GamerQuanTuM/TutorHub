/**
 * DEVELOPMENT / STAGING ONLY. Seeds a Supabase project with a sample tutor, two students, bookings and payments.
 *   1. Run the SQL migrations first.
 *   2. Fill NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   3. SEED_CONFIRM=yes npm run seed        (it refuses to run without SEED_CONFIRM=yes, or in production)
 *
 * It creates real login accounts with a known password, so NEVER run it against your live database.
 * Safe to re-run: it deletes the three sample users first (cascades to their data).
 */
import { createClient } from "@supabase/supabase-js";

if (process.env.SEED_CONFIRM !== "yes" || process.env.NODE_ENV === "production") {
  console.error("Refusing to seed. Use a development/staging project and run:  SEED_CONFIRM=yes npm run seed");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (run with: npm run seed).");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const PASSWORD = "demo-password-123";

const people = [
  { email: "ana@demo.tutorhub.app", role: "tutor", name: "Ana García", tz: "Europe/Madrid" },
  { email: "sam@demo.tutorhub.app", role: "student", name: "Sam Taylor", tz: "Europe/London" },
  { email: "lena@demo.tutorhub.app", role: "student", name: "Lena Fischer", tz: "Europe/Berlin" },
];

function check({ error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// 1. Remove previous demo users
const existing = await db.auth.admin.listUsers({ perPage: 200 });
for (const u of existing.data?.users ?? []) {
  if (people.some((p) => p.email === u.email)) await db.auth.admin.deleteUser(u.id);
}

// 2. Create auth users (the handle_new_user trigger creates their profile rows)
const ids = {};
for (const p of people) {
  const { data, error } = await db.auth.admin.createUser({
    email: p.email, password: PASSWORD, email_confirm: true, user_metadata: { role: p.role, full_name: p.name },
  });
  if (error) throw new Error(`createUser ${p.email}: ${error.message}`);
  ids[p.email] = data.user.id;
  check(await db.from("profiles").update({ timezone: p.tz }).eq("id", data.user.id), "profile tz");
}
const tutor = ids["ana@demo.tutorhub.app"];
const sam = ids["sam@demo.tutorhub.app"];
const lena = ids["lena@demo.tutorhub.app"];

// 3. Tutor profile, plan, availability, packages
check(await db.from("tutor_profiles").insert({
  user_id: tutor, slug: "ana-garcia", headline: "Native Spanish tutor · conversation, grammar and exam prep",
  bio: "Hola! I'm Ana, a certified Spanish teacher from Madrid with 8 years of experience.", subjects: ["Spanish", "DELE exam prep"],
  hourly_price_cents: 3500, currency: "eur", durations: [30, 45, 60], trial_enabled: true, trial_duration_min: 30,
  cancel_free_hours: 24, reschedule_free_hours: 12, onboarding_done: true,
}), "tutor_profiles");
check(await db.from("subscriptions").insert({ tutor_id: tutor, plan: "pro", status: "active" }), "subscription");
for (const weekday of [1, 2, 3, 4, 5]) {
  check(await db.from("availability_rules").insert([
    { tutor_id: tutor, weekday, start_time: "09:00", end_time: "13:00" },
    { tutor_id: tutor, weekday, start_time: "16:00", end_time: "20:00" },
  ]), "availability");
}
const pkgs = await db.from("lesson_packages").insert([
  { tutor_id: tutor, name: "5 lessons", lesson_count: 5, price_cents: 16000 },
  { tutor_id: tutor, name: "10 lessons", lesson_count: 10, price_cents: 30000 },
]).select();
check(pkgs, "packages");

// 4. Students and credits
for (const [id, goal, level] of [[sam, "Travel Spanish for a trip to Madrid", "A2"], [lena, "Pass the DELE B1 exam", "B1"]]) {
  check(await db.from("student_profiles").insert({ user_id: id, learning_goal: goal, level, onboarding_done: true }), "student_profiles");
  check(await db.from("tutor_students").insert({ tutor_id: tutor, student_id: id, status: "active" }), "tutor_students");
}
check(await db.rpc("adjust_credit", { p_tutor: tutor, p_student: sam, p_delta: 4, p_reason: "Seed: package" }), "credits sam");
check(await db.rpc("adjust_credit", { p_tutor: tutor, p_student: lena, p_delta: 2, p_reason: "Seed: package" }), "credits lena");

// 5. Bookings relative to now (the first one is joinable right away), plus a payment
const now = Date.now();
const mk = (student, offsetMin, durationMin, status, paid_with) => ({
  tutor_id: tutor, student_id: student, starts_at: new Date(now + offsetMin * 60_000).toISOString(),
  ends_at: new Date(now + (offsetMin + durationMin) * 60_000).toISOString(), duration_min: durationMin, status,
  room_name: `tutorhub-${crypto.randomUUID()}`, paid_with, price_cents: paid_with === "trial" ? 0 : Math.round((3500 * durationMin) / 60), currency: "eur",
});
check(await db.from("bookings").insert([
  mk(sam, 8, 60, "confirmed", "credit"),
  mk(lena, 26 * 60, 45, "confirmed", "card"),
  mk(sam, 4 * 24 * 60, 60, "confirmed", "credit"),
  mk(sam, -2 * 24 * 60, 60, "completed", "credit"),
  mk(lena, -5 * 24 * 60, 45, "completed", "card"),
]), "bookings");
check(await db.from("payments").insert([
  { tutor_id: tutor, student_id: lena, amount_cents: 2625, currency: "eur", status: "paid", paid_at: new Date(now - 5 * 864e5).toISOString() },
  { tutor_id: tutor, student_id: sam, package_id: pkgs.data[0].id, amount_cents: 16000, currency: "eur", status: "paid", paid_at: new Date(now - 40 * 864e5).toISOString() },
]), "payments");


// 6. A link material and an assignment
const mat = await db.from("materials").insert({ tutor_id: tutor, kind: "link", title: "Dreaming Spanish: beginner videos", url: "https://www.dreamingspanish.com/" }).select().single();
check(mat, "material");
check(await db.from("material_assignments").insert({ material_id: mat.data.id, tutor_id: tutor, student_id: null }), "material assignment");
check(await db.from("assignments").insert({
  tutor_id: tutor, student_id: sam, title: "Write about your weekend", description: "8-10 sentences using the preterite.",
  due_at: new Date(now + 3 * 864e5).toISOString(),
}), "assignment");

console.log("Seeded! Log in with any of these (password: " + PASSWORD + "):");
for (const p of people) console.log(`  ${p.role.padEnd(7)} ${p.email}`);
console.log("Public page: /t/ana-garcia");
