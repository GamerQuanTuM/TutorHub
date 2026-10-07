# TutorHub: setting up your own server (VPS)

Everything in this guide runs from the `deploy/` folder with one config file (`deploy/.env`) and a few commands.
It starts the app, HTTPS, an optional **self-hosted Supabase** (database, login, file storage, realtime) and an
optional **self-hosted Jitsi** (open-source video), plus the 15-minute reminder job that Vercel Cron would otherwise do.

## 1. Choose your two switches

Both are lines in `deploy/.env`. Change one, run `./scripts/deploy.sh`, done. The app code never needs to change.

| Setting | Value | What it means | You pay for |
|---|---|---|---|
| `DATABASE_MODE` | `self-hosted` | Your own Supabase runs on this server. Everything stays on your machine. | the server |
| | `cloud` | You use supabase.com and paste its keys. Nothing database-related runs on the server. | Supabase plan |
| `VIDEO_PROVIDER` | `self-hosted` | Your own open-source Jitsi Meet on this server. | the server (needs more RAM and UDP 10000) |
| | `jaas` | 8x8 Jitsi as a Service, hosted for you. Free up to 25 monthly active users, then from $99/month. | nothing up to 25 users |
| | `public` | meet.jit.si. **Demo only**: embedded calls are cut after 5 minutes. | nothing |

JaaS cannot be installed on your own server: it is 8x8's hosted product. What you can run yourself is Jitsi Meet (`self-hosted`).

## 2. Before you start: checklist

**Server**
- [ ] A Linux VPS, Ubuntu 22.04 or 24.04 recommended. **2 GB RAM minimum** (the app build needs 1 to 2 GB; on 1 GB add swap).
  For self-hosted video as well: **4 GB RAM, 2 vCPU** is a comfortable start.
- [ ] Docker and Docker Compose v2: `curl -fsSL https://get.docker.com | sh`, then `sudo usermod -aG docker $USER` and log in again.
- [ ] Firewall (and your provider's firewall) open for **80/tcp**, **443/tcp** and, for self-hosted video, **10000/udp**.

**Domain and DNS** (an A record for each name, pointing to the server's public IP)
- [ ] `app.yourdomain.com` (always)
- [ ] `api.yourdomain.com` (only if `DATABASE_MODE=self-hosted`)
- [ ] `video.yourdomain.com` (only if `VIDEO_PROVIDER=self-hosted`)

**Accounts and keys you need to create yourself**
- [ ] **Stripe:** secret key, publishable key, a Pro subscription price ID (`price_...`), and later two webhook signing secrets (section 4).
- [ ] **Resend:** an API key and a verified sending domain. (With a self-hosted Supabase the same key also sends sign-up and password-reset emails.)
- [ ] Optional: a Google OAuth client for "Continue with Google".
- [ ] Only for `VIDEO_PROVIDER=jaas`: a free account at https://jaas.8x8.vc and an API key (section 5).

## 3. Install

```bash
git clone <your repository> tutorhub
cd tutorhub/deploy
./scripts/setup.sh
```

`setup.sh` asks for your domains and the two switches, then writes `deploy/.env` (mode 600) and **generates every secret for you**:
database password, JWT secret, the `anon` and `service_role` API keys, Realtime keys, Jitsi passwords, the Jitsi token secret and the cron secret.
It never overwrites a secret that already exists, so running it again is safe. You can also run it without questions by setting
`APP_DOMAIN`, `API_DOMAIN`, `VIDEO_DOMAIN`, `DATABASE_MODE`, `VIDEO_PROVIDER` and `ACME_EMAIL` in the environment first.

Then open `deploy/.env` and fill in what only you have: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRO_PRICE_ID`,
`RESEND_API_KEY`, `EMAIL_FROM` (and the two webhook secrets after section 4). Then:

```bash
./scripts/deploy.sh     # builds the app image, starts everything, applies the database migrations
./scripts/doctor.sh     # checks containers, DNS, HTTPS, the Supabase API and the video server
```

The first start takes several minutes: images download, the app is built, and Caddy gets your HTTPS certificates
(this works only once the DNS records point at the server). Until the required keys are set, the app shows a
"Setup required" page that lists the names of what is missing, never the values.

If you use `DATABASE_MODE=cloud`: paste `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` from supabase.com into `.env`
and run the six files in `supabase/migrations/` once, in order, in its SQL editor.

## 4. After the first start

1. **Stripe webhooks (two endpoints, same URL).** Stripe dashboard > Developers > Webhooks. Add the URL `https://app.yourdomain.com/api/webhooks/stripe` **twice**; each gets its own signing secret:
   - **Your account** (events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`): secret goes in `STRIPE_WEBHOOK_SECRET`. This is the tutor's TutorHub Pro subscription.
   - **Connected accounts** (tick "Listen to events on Connected accounts"; events `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, `account.updated`): secret goes in `STRIPE_CONNECT_WEBHOOK_SECRET`. This is student payments, refunds and tutor Stripe onboarding status.
   Then run `./scripts/deploy.sh` again. (Card payments also confirm when the student returns to the site, so a delayed webhook does not leave a booking stuck, but refunds and subscriptions depend on the webhooks.)
2. **Resend.** Verify your sending domain, then set `RESEND_API_KEY` and `EMAIL_FROM`.
3. **Google sign-in (optional).** Redirect URI `https://api.yourdomain.com/auth/v1/callback`; set `GOOGLE_ENABLED=true`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
4. **First account.** Sign up in the app as a tutor, finish onboarding, connect Stripe in Settings.
5. **Turn off anything demo.** Leave `DEMO_LOGIN_ENABLED` empty and never run `scripts/seed.mjs` on a real server (it creates users with a known password).

## 5. Video in detail

**Self-hosted Jitsi** (`VIDEO_PROVIDER=self-hosted`): four containers (web, prosody, jicofo, jvb) behind Caddy.
`JVB_PUBLIC_IP` must be the server's public IP (setup.sh detects it) and **UDP 10000 must be open**, or people see each other but get no video.
`JITSI_REQUIRE_TOKEN=true` (default) means your Jitsi only accepts people holding a token the app signs when a lesson room opens,
so nobody else can create rooms on your server. `false` allows anyone who knows a room name (names are long random strings).

**8x8 JaaS** (`VIDEO_PROVIDER=jaas`):
1. At https://jaas.8x8.vc open API keys > Add API key, and download the private key file.
2. Put `JAAS_APP_ID` (starts with `vpaas-magic-cookie-`) and `JAAS_KEY_ID` in `deploy/.env`.
3. `./scripts/jaas-key.sh /path/to/downloaded.pk --write` stores the private key in `.env` as one line.
4. Set `VIDEO_PROVIDER=jaas` and run `./scripts/deploy.sh`. The app signs a short-lived token per person (the tutor is the moderator).
   The Jitsi containers and `VIDEO_DOMAIN` are not needed in this mode.

**Public** (`VIDEO_PROVIDER=public`): meet.jit.si, for demos only.

## 6. Everyday commands

| Task | Command (from `deploy/`) |
|---|---|
| Change a setting | edit `.env`, then `./scripts/deploy.sh` |
| Update to the latest code | `./scripts/update.sh` (git pull, rebuild, migrations run automatically) |
| Health check | `./scripts/doctor.sh` |
| Logs | `docker compose logs -f app` (or `db`, `auth`, `caddy`, `jvb`, ...) |
| Back up (self-hosted database) | `./scripts/backup.sh` writes `deploy/backups/db-*.sql.gz` and `storage-*.tar.gz` (keeps 14). Run it daily from cron and copy the files off the server |
| Restore a database backup | start the stack, then `gunzip -c backups/db-XXXX.sql.gz \| docker compose exec -T db psql -U supabase_admin -d postgres` |
| Stop everything | `docker compose --profile supabase --profile jitsi down` (data stays in Docker volumes). Adding `-v` **deletes the data** |

### Run it on your own computer instead (no server, no domain)

From the repository root, with your normal `.env.local`:

| Task | Command |
|---|---|
| Start (builds the first time, several minutes) | `npm run docker:up`, then open http://localhost:3000 |
| Follow the logs | `npm run docker:logs` |
| Stop and remove the container | `npm run docker:down` |

This runs only the app, against the Supabase in `.env.local`. Stop `npm run dev` first (both use port 3000). The full stack with your own Supabase,
video and HTTPS needs a real domain, so use `deploy/` on the server for that.

## 7. Launch checklist

- [ ] DNS, HTTPS and `./scripts/doctor.sh` all green.
- [ ] Stripe is in live mode with live keys, both webhooks are added, a test payment works end to end, a tutor can connect Stripe.
- [ ] `VIDEO_PROVIDER` is **not** `public`. Join a test lesson from two devices and check audio and video.
- [ ] A reset-password email arrives (tests Supabase auth emails) and a booking confirmation arrives (tests Resend).
- [ ] `deploy/.env` is backed up somewhere private. **Never change `JWT_SECRET` after the first start**: the API keys and every signed-in session depend on it.
- [ ] The daily `backup.sh` cron job is set up and a backup has been copied off the server.
- [ ] `DEMO_LOGIN_ENABLED` is empty. The seed script has never been run on this server.
- [ ] Development only: the Stitch design key (in your local `.mcp.json`) was exposed in a chat session; rotate it in your Stitch/Google settings. It is not part of the server.

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Site not reachable, or browser shows a certificate error | DNS does not point at the server yet, or 80/443 are closed. `./scripts/doctor.sh` shows which. Caddy retries by itself once DNS is right |
| App build is killed / "out of memory" | Server has under 2 GB RAM. Add swap (`fallocate -l 2G /swapfile && mkswap /swapfile && swapon /swapfile`) or use a bigger server for the first build |
| App shows "Setup required" | One of the required keys in `.env` is empty. The page lists the names; fill them in and run `deploy.sh` |
| People see each other but no video (self-hosted) | UDP 10000 is closed (also in the provider's firewall) or `JVB_PUBLIC_IP` is wrong |
| Video says "not set up yet" | `JITSI_DOMAIN` (self-hosted) or `JAAS_APP_ID`, `JAAS_KEY_ID`, `JAAS_PRIVATE_KEY` (jaas) is missing |
| Video call ends after 5 minutes | `VIDEO_PROVIDER` is `public` (meet.jit.si). Switch to `self-hosted` or `jaas` |
| `migrate.sh` times out | `docker compose logs db auth storage`. The database must be healthy and auth/storage must have created their schemas |
| Payment succeeded in Stripe but the booking stays "confirming" | Webhook missing or wrong `STRIPE_CONNECT_WEBHOOK_SECRET`. The booking also confirms when the student returns to the site; add the webhook for refunds and subscriptions |
| Database container will not start after a failed first run | The first start initialises the database once. If it failed, `docker compose --profile supabase down -v` (deletes the data, fine on a brand-new install) and start again |

## 9. What was tested, and what was not

Tested on a developer machine with real Docker, using the same compose file and scripts:
- The `docker compose config` check for all four profile combinations, and the syntax of every script.
- The generated Supabase `anon` and `service_role` keys verified independently against `JWT_SECRET`.
- A fresh self-hosted Supabase (database, gateway, auth, rest, realtime, storage): all 6 project migrations applied with `migrate.sh`;
  an admin-created user got a profile through the sign-up trigger; row-level security hid other people's data; password sign-in worked;
  uploads into your own folder succeeded and uploads into someone else's folder were rejected; signed URLs worked;
  the realtime websocket (used by the whiteboard) connected, and requests without an API key were refused.
- The app image built with the real `Dockerfile` (`next build` succeeded).
- Video provider logic: 13 automated tests, including verifying the signed tokens against real keys.
- A bug found by this testing was fixed: a database role that does not exist in the image broke the first-time database setup.

**Not tested** (needs a real server with a domain): Caddy issuing HTTPS certificates, the self-hosted Jitsi containers and UDP media,
the app container talking to the stack through the public domains, Google sign-in, and 8x8 JaaS with a real account.
Run `./scripts/doctor.sh` after your first deploy; it is the quickest way to find what, if anything, needs attention.

## 10. Where things are

```
deploy/
  docker-compose.yml   the whole stack (profiles: supabase, jitsi)
  .env.example         every setting, documented   (your real .env is created by setup.sh and is git-ignored)
  caddy/               HTTPS reverse proxy snippets (deploy.sh builds the Caddyfile from them)
  supabase/            gateway routes (kong.yml) and first-start database setup (init/*.sql)
  scripts/             setup.sh  deploy.sh  migrate.sh  doctor.sh  backup.sh  update.sh  jaas-key.sh  lib.sh
Dockerfile             the app image (repository root)
docker-compose.yml     run just the app locally in Docker: npm run docker:up / docker:down (repository root)
supabase/migrations/   the database schema, applied in order by migrate.sh
```
