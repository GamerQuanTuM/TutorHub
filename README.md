# TutorHub

A web app for independent private tutors (languages and other subjects) who want to teach their own
students directly. Tutors pay a **flat monthly subscription** and keep **100% of lesson income** (minus
Stripe's card fees). No marketplace commission, and **TutorHub never holds tutors' money**.

**Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Storage,
Realtime, RLS) · Stripe Connect (Express) + Stripe Billing · Jitsi Meet · Resend · tldraw · Luxon · Zod ·
Framer Motion · Recharts · cmdk.

---

## How money moves

```
Student ──card──▶ Stripe Checkout on the TUTOR's own Stripe account  (a "direct charge", no platform fee)
                         │
                         ▼
        Tutor's Stripe balance ──Stripe pays out──▶ tutor's bank

Tutor ──£19/mo──▶ Stripe Billing on YOUR Stripe account (the only platform income)
```

* Tutors connect a **Stripe Express account** from *Settings → Connect Stripe* (Stripe collects their identity and bank details on its own pages). Until it is connected, students can still book free trials and use lesson credits, but not pay by card.
* Packages work the same way: the student pays the tutor, and the app adds lesson credits when the webhook arrives. Each booking uses one credit.

### Refunds

Because the money is in the tutor's Stripe account, **refunds are made on the tutor's account** and come out of the tutor's Stripe balance.

| Situation | What happens |
|---|---|
| Tutor cancels a paid lesson | Automatic **full** refund (Stripe API, on the tutor's account). Students see it in about 5-10 days. |
| Student cancels outside the tutor's free-cancellation window | Automatic full refund (card) or the credit is returned (credit lessons). |
| Student cancels inside the window | Blocked by the app with an explanation; they must message the tutor. The tutor can still cancel (and refund) from their side. |
| Tutor refunds from their own Stripe dashboard | A webhook (`charge.refunded`) mirrors it: a full refund **cancels an upcoming lesson** and emails both people; a refunded package **removes the unused credits**. |
| Payment arrives after the slot hold expired | Refunded immediately, automatically. |
| Refund fails (e.g. the account link is lost) | The lesson stays booked and the user sees an error, so nobody loses money silently. |

Good to know:

* **Stripe's card fee is not returned** on refunds, so the tutor bears it.
* If the tutor's balance cannot cover a refund, Stripe debits their linked bank account. For **Express** accounts **you (the platform) are liable** if the account still ends up negative. The same applies to **chargebacks** (disputes). TutorHub does not automate disputes: handle them in the Stripe dashboard.
* Card refunds are possible for about 180 days after the payment.

---

## Going live: checklist

1. **Stripe Connect access**: enable Connect on your Stripe account (*Connect → Get started*, choose a platform that onboards **Express** accounts). Connect can be invitation-only in some countries: ask Stripe support if you cannot see it. Also check which countries your tutors can be paid in (it depends on your platform's country).
2. **Supabase**: create a project, run `supabase/migrations/0001` to `0006` in order (0005 adds student reviews and the lesson buffer, 0006 adds saved lesson chat; the app keeps working without them, but those features stay off until they are applied), enable Google (optional), set redirect URLs.
3. **Stripe keys, webhooks, Pro price, customer portal.** See below.
4. **Resend**: API key and a verified sending domain.
5. **Environment variables**: put every *required* variable from `.env.example` into `.env.local` (local) or Vercel. If one is missing the app shows a **"Setup required"** page that lists exactly which.
6. **Video**: set `VIDEO_PROVIDER` (`self-hosted` Jitsi, `jaas`, or `public` for demos only; the public server cuts embedded calls after 5 minutes). See "4. Video" below.
7. **Deploy** to Vercel (cron is in `vercel.json`) and use the production URL everywhere.
8. **Dress rehearsal in test mode**: sign up as tutor and student, connect Stripe (test data), book and pay with `4242 4242 4242 4242`, cancel as the tutor and check the refund in Stripe, buy a package, upgrade to Pro.
9. Switch to live keys only when all of that works.

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations **in order** (SQL editor, or `supabase db push`):
   `0001_schema.sql` (tables, indexes, the double-booking exclusion constraint) →
   `0002_rls.sql` (Row Level Security on every table) →
   `0003_functions_storage.sql` (atomic credits, storage buckets and policies) →
   `0004_stripe_connect.sql` (the tutor's connected-account columns).
3. **Auth → Providers**: email is on by default; add Google if you want it. **Auth → URL Configuration**: add `https://YOUR-DOMAIN/auth/callback` (and `http://localhost:3000/auth/callback` for local) to Redirect URLs.
4. **Auth → SMTP**: in production configure custom SMTP (Resend SMTP works) so confirmation and password-reset emails are not rate-limited.
5. Copy *Project Settings → API* into the env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (**server only**).
6. **Realtime** is used for the whiteboard (broadcast only, no tables). Nothing to enable.

### 2. Stripe

1. Use **test mode** until launch. Put `STRIPE_SECRET_KEY` in the env.
2. **Pro price**: *Product catalogue → Add product* "TutorHub Pro", recurring monthly, e.g. £19. Put its `price_…` id in `STRIPE_PRO_PRICE_ID`, and set `NEXT_PUBLIC_PRO_PRICE_CENTS=1900` and `NEXT_PUBLIC_PRO_CURRENCY=gbp` to the **same** amount and currency.
3. **Two webhook endpoints, same URL** `https://YOUR-DOMAIN/api/webhooks/stripe` (Stripe gives each its own signing secret):
   * **Your account**: events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Its secret goes in `STRIPE_WEBHOOK_SECRET`.
   * **Connected accounts** (tick "Listen to events on Connected accounts"): events `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, `account.updated`. Its secret goes in `STRIPE_CONNECT_WEBHOOK_SECRET`.

   Every event is signature-verified (against either secret) and processed once (`stripe_events` table).
4. **Local**: `stripe listen --forward-to localhost:3000/api/webhooks/stripe --forward-connect-to localhost:3000/api/webhooks/stripe` prints one `whsec_…`; put it in `STRIPE_WEBHOOK_SECRET` and leave the Connect one empty.
5. **Customer portal**: *Settings → Billing → Customer portal → Activate*, so tutors can update their card or cancel Pro.
6. Lessons are charged in the tutor's currency (EUR, USD or GBP). Make sure the currencies you use are enabled on your account.

### 3. Resend

Create an API key and verify your domain. Set `RESEND_API_KEY` and `EMAIL_FROM`. Emails sent: booking confirmation, cancellation, reschedule, 24h and 1h reminders, new material, new homework, homework feedback and invites. All lesson times are shown in the **recipient's** time zone.

### 4. Video (Jitsi)

Pick one with `VIDEO_PROVIDER` (server-side, no code change needed to switch):

* `self-hosted`: your own open-source Jitsi Meet. Set `JITSI_DOMAIN`; optionally `JITSI_JWT_APP_ID` / `JITSI_JWT_APP_SECRET` so only the app can open rooms. The `deploy/` folder sets Jitsi up for you.
* `jaas`: 8x8 Jitsi as a Service (hosted, free up to 25 monthly users): `JAAS_APP_ID`, `JAAS_KEY_ID`, `JAAS_PRIVATE_KEY`. The app signs a short-lived token per person when a lesson room opens.
* `public`: meet.jit.si. Demo only: it cuts embedded calls after 5 minutes.

Recording needs a Jitsi server with **Jibri**; recordings stay on that server (TutorHub only shows the Record button to Pro tutors; it does not store or list recordings yet). Record only with everyone's consent, and for under-18s with a parent or guardian's consent.

### 5. Cron

`/api/cron/reminders` (protected by `CRON_SECRET`; Vercel Cron sends `Authorization: Bearer …`) runs every 15 minutes (`vercel.json`): it sends 24h and 1h reminder emails (once each), releases unpaid slot holds, and marks finished lessons completed.
**Vercel Hobby only allows daily crons.** On Hobby use an external pinger (cron-job.org) calling the URL with the bearer header, or Supabase `pg_cron` (snippet in `0003_functions_storage.sql`).

---

## Environment variables

Documented in [`.env.example`](.env.example). **Required:** `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`. Recommended for production: `STRIPE_CONNECT_WEBHOOK_SECRET`.
`NEXT_PUBLIC_*` values are baked in at **build time**: set them before building or deploying. Never expose `SUPABASE_SERVICE_ROLE_KEY` or `STRIPE_SECRET_KEY`.

## Local development

```bash
npm install
cp .env.example .env.local     # fill in the required values (use a separate TEST Supabase project and Stripe test keys)
npm run dev                    # http://localhost:3000
```

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Run / build / serve |
| `npm run typecheck` · `npm run lint` | `tsc --noEmit` · ESLint |
| `npm test` | Vitest (94 tests, no network or database needed) |
| `SEED_CONFIRM=yes npm run seed` | **Dev/staging only**: sample tutor, students, bookings and payments in your *test* Supabase project (accounts use a known password) |

The unit tests run the real business logic against an in-memory implementation of the data layer that lives in `tests/support/` (never shipped in the app). Stripe network calls, email and the signed-in user are replaced; **webhook signature verification is the real code**, and the checkout/refund/onboarding code is checked against a fake Stripe client (e.g. "the session is created on the tutor's account with no application fee").

They cover: double-booking (sequential, simultaneous, partial overlap, payment holds), time zones including DST, cancellation and reschedule policy, credits, Free-plan limits, the Stripe webhook (both secrets, idempotency, refunds, account updates, subscriptions), Connect (direct charges, refunds on the connected account, onboarding routes, blocking card payments for unconnected tutors), server actions (onboarding, booking, invites, CSV import, materials and file access, notes, homework), and the cron endpoint.

## Project structure

```
src/
  app/          landing, login/signup/reset, onboarding, t/[slug] (public booking), tutor/*, student/*,
                lesson/[id] (room), invite/[token], setup-required, design (hidden);
                api/: upload, files, slots, stripe (connect, return, dashboard), webhooks/stripe, cron, auth callback
  components/   ui/ shared/ layout/ forms/ booking/ lesson/ students/ materials/ homework/ …
  lib/
    data/       repo.ts (interface) · supabase/repo.ts · queries.ts
    payments/   checkout.ts (Connect direct charges, onboarding link) · fulfill.ts (confirm, refund) · plan.ts
    booking/    service.ts: create / cancel / reschedule
    scheduling/ slots.ts · cancellation-policy.ts · credits.ts · provider.ts (Cal.com swap point)
    email/ jobs/ actions/ validation/ realtime/ stripe/ supabase/
  proxy.ts      "Setup required" guard + Supabase session refresh
supabase/migrations/   0001 … 0004
tests/                 Vitest + tests/support (in-memory repo and fakes)
```

## Security notes

* RLS on every table. Students see only their own rows; tutors only their own and their students' rows. Bookings, payments, credits and subscriptions have no write policy for users: the server writes them with the service role after its own authorisation checks.
* Every server action re-checks the session and filters by the signed-in user's id. Zod validates every input. Public endpoints are rate limited (in memory per server instance, so use a shared store for strict limits).
* The platform never stores card data or tutor bank details: Stripe does. TutorHub only stores the tutor's `acct_…` id.
* The Jitsi room name is only sent to the booking's tutor and student during the join window, and whiteboard channels use that unguessable name. For stricter control enable *private channels* in Supabase Realtime.
* Webhooks and the cron endpoint use signature / constant-time secret checks and fail closed when a secret is not set.

## Known limitations

* **Not tested against live services.** The Supabase repository and SQL, real Stripe Connect and Resend could not be exercised without your accounts. Do the dress rehearsal above (test mode) before real money.
* Chargebacks and disputes are not automated; as an Express-account platform you are liable for negative balances (see Refunds).
* No admin UI: handle edge cases in the Stripe dashboard and SQL.
* Whiteboard sync is last-write-wins and is not saved after the lesson. tldraw needs a licence for commercial production use.
* The cron job scans all bookings (`select *`); add range queries when volume grows.
* Reviews on the public page are a placeholder.


## Running in Docker

* **On your computer** (same settings as `npm run dev`, from `.env.local`): `npm run docker:up` starts the app at http://localhost:3000, `npm run docker:logs` follows its logs and `npm run docker:down` stops and removes it. Stop `npm run dev` first (same port). The first build takes several minutes.
* **On your own server (VPS)**: `deploy/` has the full Docker setup: the app, HTTPS (Caddy), an optional self-hosted Supabase, an optional self-hosted Jitsi, and the reminder job. Run `deploy/scripts/setup.sh`. Step-by-step guide: [docs/vps-setup-guide.md](docs/vps-setup-guide.md).
