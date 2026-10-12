# TutorHub: project map and redesign tracker

> **For any agent picking this up:** read this file first. It is the single source of truth for what exists,
> what has been redesigned, and what is left. **Update the checkboxes in the same change that finishes the work.**
> Legend: `[x]` done and verified · `[~]` done but not fully verified · `[ ]` not done · `(!)` known problem.

Last updated: 2026-10-12. Verification at last update: `npm run typecheck` clean, `npm run lint` clean, **215/215 tests**.

---

## 0. Status at a glance (2026-10-06)

| Area | Done | Total | Notes |
|---|---|---|---|
| Screens (34 pages + 404 + error) restyled in the new design system | 36 | 36 | Every screen uses the Joyful Pink tokens and the new shell/primitives |
| Screens built **from a Stitch design** | 8 | 36 | Landing, tutor booking page, tutor dashboard, earnings, students list, classroom, tutor settings, student dashboard |
| Screens **looked at in a browser** (at least one width) | 20 | 36 | 16 never seen: see section 9, items P3-P4 |
| Screens checked at **both 820px and 390px** | about 13 | 36 | The rest were checked at one width or by overflow measurement only |
| Backend capabilities from the user's brief | 9 built + 2 dropped | 11 | Built: reviews, buffer, bell, CSV export, add-to-calendar links, saved chat, projected earnings + average hourly rate, demo login (off by default), in-app calendar (FullCalendar). Dropped by the user: two-way calendar sync, custom subdomain. See section 6 |
| Automated tests | 215 passing | | Backend/logic only. There are **no automated UI or end-to-end tests** |
| `tsc` / `eslint` | clean | | |

Rough remaining effort, in order of value: (1) apply migrations 0005 and 0006 and check the new features in a browser, (2) verify the 16 unseen screens (needs a student login), (3) Stitch designs for the 28 screens that only got the shared restyle. No product decisions are pending.

---

## 1. What this app is

A web app for independent tutors to teach their own students directly. Tutors pay a flat subscription and keep
100% of lesson income (students pay the tutor's own Stripe account). Details: `README.md`.

**Stack:** Next.js 16 (App Router, `src/proxy.ts` instead of middleware, read `node_modules/next/dist/docs/` before using Next APIs, see `AGENTS.md`) ·
TypeScript · Tailwind v4 · Supabase (Postgres/Auth/Storage/Realtime/RLS) · Stripe Connect Express + Billing · Jitsi · Resend · tldraw · Luxon · Zod · Framer Motion · Recharts · cmdk · **FullCalendar v6 (MIT) for the tutor calendar**.

**Commands:** `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` (99 tests, backend only) · `npm run seed`.

---

## 2. Working rules for the redesign (from the user)

- [x] **Visual identity = the user's "Joyful Pink" brief** (see section 3). A green/serif direction was tried and **rejected**.
- [x] **One screen at a time:** generate the screen in **Stitch** (one call, never in parallel), then code it responsive (desktop, tablet, mobile). Keep going without asking.
- [x] **Do not add features beyond what existing APIs/actions support.** If a design needs a capability that does not exist, build the backend too. Strip invented claims from Stitch mockups (ratings, "12,000 tutors", calendar sync, WhatsApp/SMS, same-day settlement, fake trend numbers).
- [x] Backend was unchanged by the redesign until the user asked (2026-10-06) to build the missing capabilities from their brief. Those additions are listed in section 6 and all have tests.
- Stitch calls time out but **usually still finish a few minutes later**. Do not retry; poll `list_screens` after a pause.

### Stitch
- Project: `projects/4874117871809956315` ("TutorHub Redesign v2"). Design system: `assets/3846277943260131377` ("TutorHub Joyful Pink").
- **Student screens batch (2026-10-06):** one fresh Stitch project per screen, all generated against the shared global design system `assets/4612023467167947060`, which Stitch did **not** apply (each project auto-made its own, more rose-toned palette); layouts were followed, colours kept from our tokens. `get_project` returns a huge `designMd` (~4k tokens each): prefer `get_project` only when needed.
- **Project v3** `projects/9554091135822275142` with design system `assets/13368707083453146750` (same Joyful Pink tokens) was created 2026-10-06 because v2 stopped producing screens after 8. Student dashboard was requested there first; check `list_screens` on v3 **and** `get_project` (its `thumbnailScreenshot` is the newest screen; append `=w1280` to the URL). Gotcha: `list_screens` can lag or stay empty while a screen exists. Settings, availability and onboarding were also requested on v3 (2026-10-06) and had not appeared after ~10 min; assume Stitch yields roughly one screen per fresh project, then stalls. Do not spend more time polling; create another new project per screen if a Stitch design is required.
- (An earlier project, `6317820130181654136`, no longer exists. Do not touch the user's other Stitch projects.)
- Screenshots: `list_screens` gives a `screenshot.downloadUrl`; append `=w1280` to download full size.

| Screen | Stitch screen id | Coded? |
|---|---|---|
| Landing page | `9ae4ab9daa134975b168258c290b4d82` | [x] |
| Public tutor booking page | `564bb287d5434a10b3612a9253098713` | [x] |
| Tutor dashboard | `2a1338991ce54699905ca83e88cadaa0` (also `4fee971c…`, `2f70b799…`) | [x] |
| Earnings & analytics | `3396e6fc977d46fba71f735f47b39623` | [x] |
| Student management (list) | `462fbf22e5914dd6ae58031351526d36` | [x] |
| Live classroom | `9cf3ec561f724f999bffc82565d89dd3` | [~] coded, **not browser-verified** (room only opens 10 min before a lesson) |
| Tutor onboarding, student dashboard, availability, tutor settings | **requested 2026-10-06 (settings re-requested a second time), never appeared** in `list_screens` after 10+ minutes (Stitch seems to drop generations after the first ~7 in a project). Treat Stitch as exhausted for this project: 8 screens exist, nothing new arrives. If more are needed, try a **new Stitch project** (and recreate the design system) rather than this one | n/a |
| Mobile / tablet variants | none generated (responsive handled in code) | n/a |

---

## 3. Design system ("Joyful Pink")

Tokens live in `src/app/globals.css`. Fonts in `src/app/layout.tsx` (Plus Jakarta Sans headings 800, Inter body).

- [x] Palette: `brand-*` = the **pink** scale (50 `#FFF0F6` … 600 `#D91A72` primary … 900 `#5C0B33`); `violet` `#7209B7`; `saffron*` tokens = **peach** accent (`#FFB4A2`, name kept to avoid a mass rename); `ink` = plum `#2A0A1F`.
- [x] Light + dark (dark bg plum `#2A0A1F`); follows system unless `data-theme` set. Tailwind's `dark:` variant is overridden in `globals.css` (`@custom-variant dark`) to follow `data-theme` first, then the system setting. Do not assume `dark:` == OS dark.
- [x] Utilities: `.bg-hero` (pink→violet 135° gradient), `.lift` (hover rises 2px), `.mono` (monospaced tabular numerals for prices/times), `.pulse-pink`, `.skeleton`.
- [x] Radii 12/16/20/24px, pill buttons, soft pink-tinted shadows (`shadow-soft|lift|glow`).
- [x] Headings are weight 800 (base style + `font-extrabold`).

### Components (all restyled)
- [x] `ui/`: `button` (primary pink, secondary violet outline, ghost, danger rose-soft), `card`, `badge` (variants brand/neutral/success/warning/danger/**accent**), `field`, `avatar`, `modal`, `switch`, `skeleton`, `toast`
- [x] `shared/`: `stat-card` (pastel `tone` bubble: pink/violet/peach/green, `highlight` colours the number), `empty-state`, `progress` (bar + ring), `countdown`, `copy-button`, `success-burst`, `reveal`, `animated-number`, `autosave-field`, `auto-refresh`
- [x] `layout/`: `app-shell` (desktop 248px sidebar · tablet 72px icon rail · mobile top bar + bottom tabs + floating quick-actions button), `page-header`, `auth-card` (split gradient panel on `lg`, single column below), `command-palette`
- [x] `dashboard/`: `lesson-card` (now a **list row**; wrap rows in `divide-y`), `checklist` (percentage badge)
- [x] `earnings/earnings-chart` (area chart, pink→violet)
- [~] Others restyled only through shared tokens, **not individually reviewed**: `booking/*`, `forms/*`, `homework/*`, `lesson/*`, `materials/*`, `packages/*`, `students/*`

---

## 4. Pages

Routes under `src/app/`. "Designed" = Stitch screen exists and was followed. "Responsive checked" = viewed at ~820px and ~390px.

### Public & marketing
| Route | Designed in Stitch | Coded | Responsive checked | Notes |
|---|---|---|---|---|
| `/` landing | [x] | [x] | [~] desktop verified; others by CSS | Copy trimmed to real features. Session-aware CTAs kept |
| `/t/[slug]` booking page | [x] | [x] | [x] 820 + 390, no overflow | "Reviews" placeholder **removed** (no backend). Sticky booking card on `lg` |
| `/t/[slug]/book` checkout | [ ] | [x] order-summary polish (mono time, "Total due today") | [ ] needs a student login | Uses AuthCard shell |
| `/t/[slug]/book/confirmed` | [ ] | [x] added live lesson countdown | [ ] needs a student login | confetti + `SuccessCheck`. No Google/Outlook calendar buttons (no backend) |

### Auth & onboarding
| Route | Designed | Coded | Responsive checked | Notes |
|---|---|---|---|---|
| `/login`, `/signup` | [ ] | [x] | [x] (demo buttons not seen: they only appear when `DEMO_LOGIN_ENABLED=true`) | Role cards on signup; Google button; optional **Demo as a tutor / student** buttons (env-gated, see section 6) |
| `/forgot-password` | [ ] | [x] | [x] | |
| `/reset-password` | [ ] | [~] | [ ] | |
| `/invite/[token]` | [ ] | [~] | [ ] | |
| `/onboarding/tutor` | [ ] (Stitch never landed) | [x] numbered 3-step stepper, duration cards (real steps: About you, Lessons & price, Get paid; availability is auto-set Mon-Fri) | [ ] | Form fields/actions unchanged |
| `/onboarding/student` | [ ] | [x] level pills (radio, same `level` field) | [ ] | |
| `/setup-required`, `not-found`, `error` | [ ] | [x] 404 checked | [x] 404 | |

### Tutor workspace (`/tutor/*`, layout `src/app/tutor/layout.tsx`)
| Route | Designed | Coded | Responsive checked | Notes |
|---|---|---|---|---|
| `/tutor/dashboard` | [x] | [x] | [x] | Gradient next-lesson banner, 4 stat tiles (2-col on mobile), lesson list, checklist, quick actions, copy-link card |
| `/tutor/earnings` | [x] | [x] | [x] 820 + 390 no overflow (before the two new tiles; **new tiles not yet seen in a browser**) | Area chart, revenue split, ledger table (cards on mobile), Export CSV, **Projected this month** (net so far scaled by days elapsed; hidden for the first 3 days) and **Average hourly rate** (card-paid, taught, non-trial lessons) |
| `/tutor/students` | [x] | [x] | [~] desktop light verified, no overflow at 820/390 (checked before restyle) | Stat row, filter chips (All/Active/Archived), search, 3-col cards. Real fields only (level, goal, next lesson, credits, status) |
| `/tutor/students/[id]` | [ ] | [~] | [x] 390 (fixed email overflow, card stacks on mobile) | |
| `/tutor/students/invite` | [ ] | [~] | [ ] | |
| `/tutor/calendar` | [ ] | [x] rebuilt on **FullCalendar v6 (MIT)**: week/day/list, availability as business hours (greyed = outside), blocked dates as background events, click a lesson to open it, times in the tutor's zone via `@fullcalendar/luxon3` | [x] desktop dark+light, 390 list view, no overflow (Playwright) | Component `src/components/calendar/tutor-calendar.tsx`; styles `.tutor-cal` in `globals.css`. Phones default to List view. No two-way sync by decision |
| `/tutor/availability` | [x] Stitch 12396504794648418443 | [x] | [x] 390 looks good | Day rows with time chips + add controls |
| `/tutor/packages` | [x] Stitch 13584148274642279293 | [x] live breakdown, toggle | [x] no overflow | |
| `/tutor/materials` | [x] Stitch 5641001593404815434 | [x] | [~] no overflow | |
| `/tutor/homework`, `/[id]` | [x] Stitch 10004567878371092919 / 5105757234110827694 | [x] | [ ] | |
| `/tutor/billing` | [x] Stitch 14205055044888393529 | [x] | [x] overflow fixed (see gotcha below) | |
| `/tutor/settings` | [x] (Stitch project `11091771319813068355`; one screen per fresh project works) | [x] two columns, icon-header cards, "Unsaved changes / Discard / Save" bar, buffer field | [x] desktop; 390 checked earlier | Fields and server action unchanged except `bufferMin` |
| `/tutor/lessons/[id]` | [ ] | [~] header row wraps on mobile | [x] 390 (checked before the wrap fix; re-check) | |

### Student workspace (`/student/*`)
| Route | Designed | Coded | Responsive checked | Notes |
|---|---|---|---|---|
| `/student/dashboard` | [x] (Stitch v3 project; the screen surfaced only via `get_project` thumbnail, `list_screens` stayed empty) | [x] banner + stat row, upcoming lessons, homework rows (overdue highlighted), credits-by-tutor rings, new materials | [ ] **cannot verify: needs a student login** | Skipped invented parts: ratings, "Add credits", auto-refill, prep notes |
| `/student/lessons` | [x] Stitch project `1385905977147707512` | [x] two-column upcoming cards with "when" panel + Join pill, add-to-calendar, policy actions; past lessons with filter pills, notes, review cards, Book again | [x] desktop + 390 (Sam's session) | Skipped invented parts: tutor star ratings |
| `/student/homework` | [x] `15624195763867277806` | [x] filter pills with counts + search, To do / Submitted / Graded groups, all-caught-up banner | [x] desktop + 390 | Skipped: subject chips, "Ask tutor" (no such feature) |
| `/student/homework/[id]` | [x] `14053906489897133412` | [x] accent-bar header, tutor chip, attachments, feedback card with mark, answer card with live word/character count | [x] desktop + 390 | Skipped: rich-text toolbar, voice notes, versions |
| `/student/materials` | [x] `2193303927547936591` | [x] type filter pills + search, per-tutor groups, colour-coded type icons, audio player, image preview | [x] desktop + 390 | Skipped: tutor rating, "next lesson" in headers |
| `/student/tutors` | [x] `5529821237077187940` | [x] filter pills (All / With credits / Upcoming) + search, credit ring, next lesson, package chips with savings %, Book / Buy buttons | [x] desktop + 390 | Skipped: ratings, online dots, "find a new tutor" |
| `/student/settings` | [x] `10896819420410199578` | [x] icon-header cards (Profile, Learning), level pills, Unsaved/Discard/Save bar | [x] 390 + overflow | Shared `SettingsSection`/`SaveBar` in `components/forms/settings-section.tsx` |

### Classroom
| Route | Designed | Coded | Responsive checked | Notes |
|---|---|---|---|---|
| `/lesson/[id]` | [x] | [x] | [x] checked with a temporary preview page (since removed) at desktop, 820 and 390: layout, tab switching, no overflow. The video frame was unreachable on purpose, so the real Jitsi embed was not exercised | Desktop: whiteboard left, dark collapsible session sidebar (Jitsi video, lesson timer, notes/materials). Tablet+mobile: video on top + Whiteboard/Notes/Materials tab bar. Dropped the old draggable splitter. **Chat tab** (saved chat) when migration 0006 is applied, otherwise Jitsi's own chat button. Tablet+mobile tab bar becomes 4 tabs. Test needs a booking inside its 10-min join window |

### Leftover / cleanup
- [x] `src/app/design/` (old showcase) was **moved out of the project** to the agent scratchpad backup (not deleted) on 2026-10-06 at the user's request. Nothing referenced it.
- [x] `.mcp.json` (plaintext Stitch key) is now in `.gitignore`; `.mcp.json.example` has a placeholder. It was never committed. **The key appeared in this session's output: rotate it in the Stitch/Google settings if that matters.**

---

## 5. Backend inventory (reference for what the UI may use)

### Server actions (`src/lib/actions/*`)
- **auth.ts:** `signInAction`, `signUpAction`, `signOutAction`, `forgotPasswordAction`, `updatePasswordAction`, `googleSignInAction`
- **booking.ts:** `bookLessonAction`, `buyPackageAction`, `cancelLessonAction`, `rescheduleLessonAction`
- **homework.ts:** `createAssignmentAction`, `deleteAssignmentAction`, `submitHomeworkAction`, `saveFeedbackAction`
- **lessons.ts:** `saveLessonNoteAction`, `setNoteVisibilityAction`, `setBookingStatusAction`, `savePrivateStudentNotesAction`
- **materials.ts:** `addFileMaterialAction`, `addLinkMaterialAction`, `deleteMaterialAction`, `assignMaterialAction`
- **onboarding.ts:** `completeTutorOnboardingAction`, `completeStudentOnboardingAction`
- **packages.ts:** `createPackageAction`, `togglePackageAction`, `deletePackageAction`
- **payments.ts:** `upgradeToProAction`, `openBillingPortalAction`
- **student.ts:** `updateStudentSettingsAction`
- **students.ts:** `inviteStudentAction`, `importStudentsCsvAction`, `revokeInviteAction`, `resendInviteAction`, `acceptInviteAction`, `grantCreditsAction`, `setStudentStatusAction`
- **tutor.ts:** `updateTutorSettingsAction`, `addAvailabilityRuleAction`, `removeAvailabilityRuleAction`, `addBlockedDateAction`, `removeBlockedDateAction`
- **reviews.ts (new):** `submitReviewAction`
- **notifications.ts (new):** `markNotificationsReadAction`
- **chat.ts (new):** `listMessagesAction`, `sendMessageAction`
- **auth.ts (new action):** `demoLoginAction` (env-gated)

### API routes (`src/app/api/**`, `src/app/auth/callback`)
- `GET /api/t/[slug]/slots` available time slots for the booking widget
- `POST /api/upload`, `GET /api/files/[...path]` file upload / authorised download
- `GET /api/stripe/connect`, `GET /api/stripe/connect/return`, `GET /api/stripe/dashboard` Stripe Express onboarding and dashboard link
- `POST /api/webhooks/stripe` payments, refunds, subscription events (idempotent)
- `GET /api/cron/reminders` lesson reminders (Vercel cron every 15 min, `vercel.json`)
- `GET /auth/callback` Supabase OAuth/email callback
- `GET /api/earnings/export` (new) tutor's payments as CSV
- `GET /api/lessons/[id]/calendar` (new) lesson as `.ics`

### Domain / library modules (`src/lib/**`)
`auth/session` · `data/` (repo, queries, student, `supabase/repo`) · `booking/service` · `scheduling/` (slots, credits, cancellation-policy, providers) ·
`payments/` (checkout, fulfill, plan) · `stripe/client` · `email/` (send, notify, templates) · `jobs/reminders` · `realtime/channel` ·
`validation/schemas` · `earnings` · `time` · `csv` · `env` · `files` · `video` · `plans` · `lesson-access` · `rate-limit` · `utils` · `types` · `reviews` (new) · `notifications` (new) · `calendar` (new) · `chat` (new) · `demo` (new). `earnings.ts` also has `projectMonth` and `averageHourlyRate`.

### Data model
`supabase/migrations/0001–0006` (schema, RLS, functions/storage, Stripe Connect, **reviews + lesson buffer (0005), saved chat (0006)**). Types mirror in `src/lib/types.ts`
(profiles, tutor/student profiles, reviews, messages, tutor_students, availability rules/exceptions, bookings, packages, credits + ledger, payments, materials + assignments, lesson notes, assignments + submissions, subscriptions, notifications, stripe events).

### Tests
`tests/*.test.ts` (215 passing at last run): actions, cancellation policy, Stripe Connect, credits, cron/config, CSV/reminders, double booking, timezone, webhook, **reviews + buffer, exports + calendar (incl. authorisation), notifications, analytics (projection, hourly rate), demo login, chat**.

---

## 6. Capabilities from the user's brief: status
All built or decided as of 2026-10-06; each has unit tests. **Apply `supabase/migrations/0005_reviews_buffer.sql` and `0006_chat_messages.sql` on the database.** Until then the app degrades gracefully (no reviews shown, buffer ignored, settings still save, chat falls back to Jitsi's own chat button). Confirmed live against the real database: the public booking page still renders when the `reviews` table is missing.
- [x] **Student reviews & ratings.** `reviews` table (one per booking, 1-5 + comment). `submitReviewAction`; helpers in `src/lib/reviews.ts` (`canReview`, `summarizeReviews`, `reviewerLabel`, `loadReviews` returns `[]` if the table is missing). `ReviewForm` on `/student/lessons`; stars, breakdown and latest reviews on `/t/[slug]`; the tutor is notified. Names are shortened ("Maria V.").
- [x] **Buffer between lessons.** `tutor_profiles.buffer_min` (0-60); `generateSlots({ bufferMin })` pads every booking on both sides; settings select; only written when changed.
- [x] **Notification bell.** `src/lib/notifications.ts`, `markNotificationsReadAction`, `NotificationBell` in the shell. Verified live.
- [x] **Earnings CSV export.** `GET /api/earnings/export` (own data, tutors only; spreadsheet-formula injection neutralised). Verified live.
- [x] **Add to calendar (one way).** Google/Outlook links + `.ics` via `GET /api/lessons/[id]/calendar` (parties only, confirmed only). Verified live. Not a sync.
- [x] **In-app calendar.** `/tutor/calendar` uses the open-source **FullCalendar v6 (MIT)**: week/day/list, availability shading, blocked dates, click through to the lesson. No external calendar connection (user decision: no two-way sync).
- [x] **Projected earnings & average hourly rate** (user left the definition to the agent; chosen definitions): *Projected* = net income so far this month x (days in month / days elapsed), shown after day 3 ("at this pace"). *Average hourly rate* = average price per hour of lessons that were **paid by card, already taught, and not free trials** (credit and trial lessons are excluded because their money is not tied to one lesson). Shown on `/tutor/earnings`.
- [x] **Saved chat history.** Migration 0006 `messages` table, `listMessagesAction`/`sendMessageAction` (parties only, cancelled/unpaid lessons closed, 2000 chars, 30 messages/min), `ChatPanel` as a "Chat" tab in `/lesson/[id]`, polling every 4 s while the tab is visible. When chat is available Jitsi's own chat button is removed so there is one chat. Not realtime (see P14).
- [x] **One-click demo login (off by default).** `DEMO_LOGIN_ENABLED=true` + `DEMO_TUTOR_*` / `DEMO_STUDENT_*` env vars (documented in `.env.example`). The browser sends only the role; credentials never leave the server; blocked in production unless `DEMO_LOGIN_ALLOW_PRODUCTION=true`; rate limited. Use throwaway accounts: `npm run seed` creates demo users with a **known password, never run it on a live database**.
- [x] ~~Two-way Google/Outlook calendar sync~~ **Dropped by the user** (use the open-source in-app calendar instead).
- [x] ~~Custom subdomain per tutor~~ **Dropped by the user** (`/t/[tutor-name]` is the tutor's link).

## 7. How to test responsive layouts (Chrome tool cannot resize the real viewport)
1. Navigate the tab to `http://localhost:3000/favicon.ico` (static page React will not overwrite).
2. With `javascript_tool`, inject **one** iframe (width 820 for tablet, 390 for mobile) pointing at the page; wait ~5s; screenshot. Compare `documentElement.scrollWidth` with `clientWidth` to find horizontal overflow.
3. Load **only one authenticated iframe at a time** (two at once signed the user out). Never type the user's password; ask them to sign in.
4. Keep each JS call under ~40s (about 4 page loads) or the tool times out.

---

### Precise screenshots without the Chrome tool (public/preview pages only)
`playwright-core` is installed in the agent scratchpad (`scratchpad/pw/shot.mjs`, uses the machine's Chromium 1228). `node shot.mjs <url> <out.png> <width> <height> [dark|light]` prints the document `clientWidth`/`scrollWidth` (overflow check) and console errors. It has **no login**, so for signed-in-only UI create a temporary `src/app/preview-*/page.tsx` with sample data, screenshot it, then move it out. Plain headless Chrome has a ~500px minimum width, so do not use it for phone widths.

### Test data (seeded by the owner on 2026-10-06, `npm run seed`)
Remote Supabase project (`...supabase.co`, not local), so **the agent must not type the demo password into the app**: credentials would be sent to another host. The owner signs in; the agent then inspects pages from that browser session.
- Tutor `ana@demo.tutorhub.app` (page `/t/ana-garcia`, Pro plan, packages, 09-13 and 16-20 Mon-Fri), students `sam@demo.tutorhub.app` and `lena@demo.tutorhub.app`. Password is in `scripts/seed.mjs`.
- Seeded bookings: one confirmed lesson starting ~8 minutes after seeding (joinable right away; the window closes about 15 minutes after it ends, so **re-run `npm run seed` just before testing the live room**), two more confirmed (card and credit), and **two completed lessons (one each for Sam and Lena) that can be reviewed**. Also a payment, a 5-lesson package purchase, a link material and an assignment for Sam.
- The owner's own real account (Shuvam, tutor and the older student link) is separate and untouched by the seed.

## 7b. Layout gotchas found so far
- **Grid children overflow on mobile:** a `grid` child with wide content makes the page scroll sideways. Add `grid-cols-1` and `min-w-0` on children (`[&>*]:min-w-0`). Hit on `/t/[slug]` and billing.
- **`sr-only` inside an `overflow-x-auto` table wrapper:** absolutely positioned captions/spans escape the clip and widen the page. Give the wrapper `relative`.
- **Sticky bars vs the mobile FAB:** the FAB sits at `bottom-20 right-4`; any sticky bottom bar needs `pr-[4.5rem]` on mobile.
- **Orphan stat card:** do not `col-span-2` the first of four tiles in a 2-col grid; use a plain 2×2.
- **Dark-mode check:** the OS here is dark, so default screenshots are dark; use the theme toggle to check light.

## 8. Next up (in order)
Status 2026-10-07: every screen has been designed in Stitch (batches 1-4) and coded, except the developer-only `/setup-required` page. Migrations 0005 and 0006 are applied (`messages` table exists; chat verified both ways between Sam and Ana). Tests: 152 pass.
1. [ ] Join the Jitsi call with camera/microphone in the new classroom layout (P4).
2. [ ] Book a lesson as a student (card or credit) and look at `/t/[slug]/book/confirmed`.
3. [ ] Fresh-account flows: `/onboarding/tutor`, `/onboarding/student`, `/reset-password`, `/invite/[token]` (need a new signup or a valid token).
4. [ ] Demo-login buttons (need `DEMO_LOGIN_*` env vars on a test project).
5. [ ] Light-mode and dark-mode sweep of every page (P7). The app defaults to light; toggle with the moon icon.
6. [ ] Housekeeping: rotate the Stitch key (P10); consider `REVOKE EXECUTE` on SECURITY DEFINER functions such as `handle_new_user` for anon/authenticated (Supabase advisor); optional design for `/setup-required`.

## 9. Open problems (keep this list current)

Severity: **High** = can mislead users or break something real, **Med** = known gap, **Low** = polish/tooling.

| # | Sev | Problem | Impact | What to do |
|---|---|---|---|---|
| P1 | Closed | **Migrations 0005 and 0006 are applied** (checked 2026-10-07 with the Supabase MCP and SQL: `reviews` and `messages` tables exist, `tutor_profiles.buffer_min` exists). The MCP's `list_migrations` is empty because they were applied by hand, not through the CLI. | None. | None. |
| P2 | High | **New backend features were only tested with the in-memory repo plus a few live API calls.** `SupabaseRepo` has never been run against a real project in CI (stated in its own header). The review inserts/RLS, `buffer_min`, the `messages` table/RLS and `markNotificationsReadAction` (RLS update policy) are unproven on the real database. | A real-database difference could break reviews or mark-as-read. | After P1, do one real review, one buffer change, one chat exchange (two accounts) and open/close the bell. Watch the dev server log for `[reviews]` / `[chat]` / `[notifications]` warnings. |
| P3 | Med | **16 of 36 screens have never been seen in a browser:** checkout `/t/[slug]/book`, `/confirmed`, `/reset-password`, `/invite/[token]`, `/onboarding/tutor`, `/onboarding/student`, `/setup-required`, `error`, `/tutor/homework/[id]`, and all 7 `/student/*` pages. | Layout bugs (overflow, cramped rows, contrast) may exist there. | Student login for `/student/*` and checkout; onboarding needs an account that has not finished onboarding; `/reset-password` and `/invite/[token]` need valid tokens; `/setup-required` appears when env vars are missing; `error` needs a thrown error. |
| P4 | Med | **The real Jitsi video in the new classroom layout was never exercised** (tested with an intentionally unreachable host). Controls could still be clipped by the 230px sidebar video on short desktop screens. | The most important screen may have a layout issue only visible with live video. | Create a lesson starting within 10 minutes and open it as tutor and student on desktop, tablet and phone. |
| P5 | Closed | **All screens now follow a Stitch design** (batches 1-4), except `/setup-required` (developer-only). The booking-confirmed design never listed in Stitch; it was built from the prompt layout. | Small per-screen deviations remain where the mockup showed features without a backend (skipped on purpose). | Optional: design `/setup-required`. |
| P6 | Med | **No mobile or tablet Stitch screens exist** (only desktop). Tablet/mobile layouts come from my responsive code. | The user asked for designs for all three form factors. | Generate `MOBILE`/`TABLET` variants per key screen in fresh Stitch projects and compare. |
| P7 | Med | **Dark mode dominated testing.** The OS is dark; light mode was seen on only some pages (students, settings, tutor pages at 390). | Light-mode contrast problems may be undiscovered (peach/saffron badges, borders). | Toggle theme and sweep all pages. |
| P8 | Med | **No automated UI/end-to-end tests** (Playwright etc.). 215 tests cover backend/logic only. | Visual/behavioural regressions are caught by eye only. | Add Playwright smoke tests for the key flows once a stable test login exists. |
| P9 | Low | **Accessibility was not formally audited** (keyboard order, screen reader, contrast ratios). Many components include roles/labels, but no axe/Lighthouse run. | Unknown WCAG gaps. | Run Lighthouse/axe on the main pages. |
| P10 | Low | **Stitch API key was exposed in session output.** It is gitignored now and was never committed. | If the key leaks it can be used against the user's Stitch quota. | User rotates it in Stitch/Google settings. |
| P11 | Low | **Closed:** the five items from the brief were built or dropped by decision (section 6). Two choices were the agent's: the definitions of *projected* and *average hourly rate*. | Numbers may not match what the user expects. | Confirm the definitions with the user. |
| P12 | Low | **Tooling:** the Chrome tool cannot resize the viewport (use the iframe method, section 7); tabs sometimes freeze (open a new tab); parallel authenticated iframes can sign the user out; after adding/removing routes run `npx next typegen` or `tsc` shows stale `.next/types` errors. | Slows verification. | Follow section 7 and 7b. |
| P13 | Low | **Settings "Discard" remounts fields at the last saved values**; a freshly uploaded avatar is cleared but already-saved settings are untouched. Switch state is restored by the remount. | None known. | Confirm in a browser during P2. |
| P14 | Low | **Chat uses polling (every 4 s), not realtime.** | Up to ~4 s delay; a little extra server load per open room. | If it matters, switch `ChatPanel` to Supabase Realtime `postgres_changes` on `messages` (RLS is already in place) or reuse `src/lib/realtime/channel.ts`. |
| P15 | Low | **Demo login depends on real Supabase accounts** and the seed script's known-password users are dangerous on a live database. Demo buttons were never seen in a browser. | Misconfiguration could expose a shared account. | Only enable on a test project, keep `DEMO_LOGIN_ALLOW_PRODUCTION` unset. |
| P16 | Low | **Calendar bundle size not measured.** FullCalendar (core + timegrid + daygrid + list + luxon plugin) is only loaded by `/tutor/calendar`. | Possibly a slower first load of that one page. | Run `next build` and read the route size; lazy-load with `next/dynamic` if it is large. |
| P17 | Low | **One React dev warning** ("script tag while rendering a React component") appeared in a console capture of the classroom preview and did not reappear; the public pages (/, /login, /signup, /forgot-password, /t/[slug], 404) showed no console errors in the final sweep. The root layout does render a theme-init `<script>` inside React, which is the likely source. | Dev-only noise. | If it returns, move the theme init to `next/script` with `beforeInteractive`. |

## Stitch batch 3 (generation sent 2026-10-07, harvest via `get_project` thumbnail; `list_screens` is unreliable)
| Screen | Stitch project | Coded |
|---|---|---|
| Login | 5254902925652350028 | [x] |
| Signup | 8716146965302243519 | [x] |
| Checkout `/t/[slug]/book` | 17391319423049473216 | [x] |
| Forgot password | 13175240077234788608 | [x] |
| Tutor onboarding | 10561857462470678563 | [x] |
| Student detail `/tutor/students/[id]` | 1997346994242483445 | [x] |
Still to generate (new CenteredCard / OnboardingShell components exist for reuse): reset password, invite/[token], student onboarding (shell already applied), invite student, tutor lesson detail, calendar chrome, booking confirmed, 404, error, setup-required.

## Stitch batch 4 (sent 2026-10-07)
| Screen | Stitch project | Coded |
|---|---|---|
| 404 (+ `error.tsx` reuses `SystemPage`) | 6730634157339334135 | [x] |
| Reset password | 8020382073816834358 | [x] |
| Tutor lesson detail | 17855272921894867262 | [x] |
| Invite student | 10438138942288179160 | [x] |
| Booking confirmed | 17418857727063107974 | [x] |
Remaining to generate: invite/[token], student onboarding, calendar chrome, setup-required (dev-only, low priority).
| Accept invite `/invite/[token]` | 8247041469223841044 | [x] |
| Student onboarding | 11637759725988193424 | [x] |
| Tutor calendar chrome | 8522746373410665541 | [x] |
Remaining to generate after these: setup-required (dev-only, low priority).

Batch 4 notes: booking-confirmed design never listed by Stitch (thumbnail was an avatar), coded from the prompt layout; student onboarding uses OnboardingShell; calendar already matched. Browser-verified as tutor (Ana) on 2026-10-07: availability, packages (live breakdown OK), billing, homework list + review, materials, students, student detail, lesson detail, calendar, earnings: no horizontal overflow at 390px.
Browser-verified as student (Sam) on 2026-10-07: dashboard, lessons, homework (+detail), materials, my tutors, settings, public tutor page and checkout (`/t/ana-garcia/book`): no horizontal overflow at 390px or 820px; checkout layout visually OK. Only console error is the known `cz-shortcut-listen` extension hydration mismatch. Not yet testable: lesson room / chat (seeded joinable lesson expired; `npm run seed` deletes and recreates the sample users, so both sessions would be signed out), onboarding, reset-password, invite/[token], booking-confirmed (need fresh accounts/tokens/booking).
2026-10-07 (student, after re-seed): lesson room `/lesson/[id]` works: whiteboard, timer, Notes/Chat/Materials tabs, Jitsi pre-join loads; chat message saved in `public.messages` (migration 0006 applied; the table is `messages`, not `chat_messages`); no overflow at 390/820. Seed script typo "cls Sam Taylor" fixed in scripts/seed.mjs (DB row still has it until next seed). Supabase MCP is read-only. Dev note: if `/lesson/[id]` shows "Jest worker encountered 2 child process exceptions", restart `npm run dev` (Turbopack worker crash on first compile). Supabase security advisors: stripe_events has RLS but no policy (fine, service role only), btree_gist in public, SECURITY DEFINER helper functions (incl. handle_new_user) executable via RPC by anon/authenticated (consider REVOKE EXECUTE), leaked-password protection off.
2026-10-07 (tutor Ana, after re-seed): chat verified both ways (Sam message visible to Ana, reply saved in public.messages); earnings tiles incl. projected month, avg hourly rate, Export CSV render; settings page has the bufferMin select. Still unverified: live Jitsi media, demo login (env), light mode, onboarding/reset/invite (need fresh accounts/tokens).
2026-10-07: live Jitsi video verified (user joined with camera; Sam tile shown in the sidebar, controls fit). **P18 (Med): meet.jit.si shows "Embedding meet.jit.si is only meant for demo purposes... this call will disconnect in 5 minutes."** For real lessons set `NEXT_PUBLIC_JITSI_DOMAIN` to a self-hosted Jitsi or 8x8 JaaS (jitsi.org/jaas). Fresh un-onboarded test accounts (same demo password as the seed, dev DB only): newtutor@demo.tutorhub.app (tutor) and newstudent@demo.tutorhub.app (student): use them to check `/onboarding/tutor` and `/onboarding/student`.
Demo login env (.env.local): DEMO_LOGIN_ENABLED=true plus DEMO_TUTOR_EMAIL/PASSWORD and DEMO_STUDENT_EMAIL/PASSWORD (see .env.example); restart `npm run dev` after editing.
2026-10-07: /onboarding/tutor verified end to end as newtutor (3 steps, then /tutor/dashboard; DB row nora-newtutor with 5 default availability rules). Invite link created as Nora for the accept-invite test: /invite/7bw1jqN4mguEh9DfTBiV1Ea4 (one-time, dev only, 2 starting credits).
2026-10-07 (newstudent): /invite/[token] renders (avatar ring, subject pills, rate, credits banner); Accept links the student (tutor_students active, 2 credits); un-onboarded student is then sent to /onboarding/student by student/layout, which completes to /student/dashboard. Checkout with credit (/t/nora-newtutor/book) and /book/confirmed verified: countdown, add to calendar (Google/Outlook/.ics), Go to my lessons, Book another lesson. Still unverified: /reset-password (needs a reset token), demo-login buttons (env), full light/dark sweep.
2026-10-07: Stripe Connect done for newtutor@demo.tutorhub.app (stripe_account_id set, stripe_charges_enabled=true; settings shows Connected + Update Stripe details + Open my Stripe dashboard). Demo login env set: /login (signed out) shows both Demo as a tutor / Demo as a student buttons. Next: card payment on Stripe Checkout as newstudent (user enters Stripe test card on the Stripe-hosted page).
2026-10-07: card payment verified with a Stripe test card as newstudent (Connect direct charge on Nora's account). Bug found + fixed: /book/confirmed stayed on 'Confirming your payment...' because on localhost no webhook is forwarded (and in production it depended on webhook timing). Added confirmPaymentReturn() in src/lib/payments/fulfill.ts (asks Stripe on the connected account, then runs the idempotent fulfillPayment); called from /t/[slug]/book/confirmed and from /student/dashboard?paid=1 (packages). Webhook still works alongside. No unit test yet for it (needs a Stripe mock). For local webhook testing use: stripe listen --forward-to localhost:3000/api/webhooks/stripe (check route path in src/app/api/webhooks).
2026-10-07: demo login verified (Demo as a tutor -> Ana, Demo as a student -> Sam). /reset-password renders in light and dark (the link from the admin API uses the implicit flow, so the PKCE /auth/callback ignored it: that is a test-method limit, not an app bug; the real emailed link uses the code flow). Contrast audit (automated, text vs effective solid background, WCAG AA) over student pages, public tutor page and lesson room: 0 failures in light and dark; only false positives are white text on gradient backgrounds. Not yet audited: tutor pages, onboarding, checkout, auth pages.
2026-10-07: real forgot-password flow verified with the user's real inbox: /forgot-password -> Supabase Auth email (noreply@mail.app.supabase.io, PKCE token) -> link opens /auth/callback?next=/reset-password -> lands on /reset-password. Links are one-time: a reused/expired link (otp_expired) lands on the site root with the error in the URL fragment and no message (UX gap, optional fix). Observed once: first click on Send showed 'Enter a valid email address' before the typed text registered; second attempt worked (not reproduced).
2026-10-07: expired/invalid email-link notice added (src/components/shared/auth-link-error.tsx in the root layout reads #error_code=... and redirects to /forgot-password?link=expired|invalid, which shows a warning). Tutor-page contrast audit (light + dark, automated WCAG AA on solid backgrounds; gradients skipped): found and fixed two real calendar bugs: (1) dark mode confirmed lessons were 3.8:1 (now white on brand-600), (2) .fc-event-main forced white text so completed/pending/cancelled/trial lesson blocks were unreadable in light mode (now inherits status colour). All other tutor pages: 0 failures. Nora's DB shows one paid payment (30 EUR, confirmed booking), so her earnings should read 30 EUR for this month / 30 days / all time; viewing the page needs a Nora session (not yet looked at).
2026-10-07: added tests/payment-return.test.ts (7 tests for confirmPaymentReturn: paid booking confirmed on the tutor's connected account, idempotent, unpaid stays pending, session for another payment ignored, missing session/account no-op, Stripe error propagates, package credits granted once); stripe-fake now records checkout.sessions.retrieve calls (stripeCalls.retrieves). Mutation-checked. Stitch key: .mcp.json is gitignored, never tracked or committed; it only appeared in session output, so rotate it (user action), then paste the new key into .mcp.json (X-Goog-Api-Key). Supabase advisors reviewed: not about disabled RLS (see P-notes): stripe_events RLS-on/no-policy is intentional (service role only); SECURITY DEFINER helpers are RLS helper functions using auth.uid(); no change made. NEXT_PUBLIC_JITSI_DOMAIN=meet.jit.si is the default, so the 5-minute embed limit (P18) is NOT solved by it.

## Video provider switch + VPS deployment bundle (2026-10-07)
- **`VIDEO_PROVIDER=self-hosted|jaas|public`** (server env, `src/lib/video-provider.ts`; `src/lib/video.ts` still holds `embedUrl` for tutor intro videos). `self-hosted` uses `JITSI_DOMAIN` (+ optional HS256 token login `JITSI_JWT_APP_ID/SECRET/SUB`); `jaas` uses `JAAS_APP_ID/KEY_ID/PRIVATE_KEY` and signs an RS256 token per person (tutor = moderator); `public` = meet.jit.si (demo, 5-minute cut). Unset: custom `JITSI_DOMAIN`/`NEXT_PUBLIC_JITSI_DOMAIN` means self-hosted, else public. The lesson page builds the config server-side and passes `video` to `LessonRoom` -> `JitsiFrame` (shows a clear message if the chosen provider is not configured). Tests: `tests/video-provider.test.ts` (13).
- **`deploy/`**: docker-compose (caddy, app, cron + profile `supabase`: db, kong, auth, rest, realtime, storage + profile `jitsi`: prosody, jicofo, jvb, jitsi-web), `.env.example`, `scripts/` (setup, deploy, migrate, doctor, backup, update, jaas-key, lib), root `Dockerfile` (+ `.dockerignore`, `next.config.ts` standalone output via NEXT_OUTPUT). Guide: `docs/vps-setup-guide.md` (the old `deploy/README.md` was merged into it and removed). Root `docker-compose.yml` + `npm run docker:up|down|logs` run just the app locally from `.env.local`. Needs TWO Stripe webhook secrets (`STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`); both are passed through and documented. Mistake made and fixed while building this: `src/lib/video.ts` (embedUrl) was overwritten and rebuilt from the Turbopack build output; provider code lives in `video-provider.ts`.


## Free-plan seats, archiving and credit refunds (2026-10-12)
Checklist (all done, tests in `tests/student-archive.test.ts`, `tests/credit-refunds.test.ts`, `tests/free-plan-trial.test.ts`; key tests mutation-checked):
- [x] **Archive guard** (`setStudentStatusAction`, `src/lib/student-archive.ts`): archiving is refused while the student has unused credits or upcoming lessons (confirmed or pending_payment, in the future); the message names which one (or both). Past and cancelled lessons never block. Restoring keeps its Free-plan room check.
- [x] **Refund of unused paid credits** (`refundUnusedCredits`, `creditRefundPreview`, `removeFreeCredits` in `src/lib/payments/fulfill.ts`): partial Stripe refunds on the tutor's connected account, newest payment first, each credit priced at package price / lessons, idempotency key `refund-credits-<paymentId>-<refundedBefore>-<cents>`. The DB is updated BEFORE Stripe is called and put back if Stripe refuses, so the `charge.refunded` webhook (`recordExternalRefund`) finds it already recorded; the webhook now ignores events whose running total is not above what is recorded, and a later dashboard refund removes only the credits not already refunded.
- [x] **Tutor UI** on `/tutor/students/[id]`: "Before you can archive <name>" card with Refund unused credits (confirm text with the amount), Remove free credits, Cancel upcoming lessons. Server actions `refundUnusedCreditsAction`, `removeFreeCreditsAction`, `cancelUpcomingLessonsAction` (tutor only, own student only, rate limited).
- [x] **Free trial on a full tutor**: `ensureStudentLink(..., { trial: true })` skips the cap (archived students are still refused). Public page `/t/[slug]`: a full tutor shows a note, keeps the trial selectable and offers no paid slots (`SlotPicker paidUnavailable`).
- [x] **One seat rule** (`takesSeat` / `studentSeats` / `studentHoldsSeat` in `src/lib/data/queries.ts`), used by invites, restoring a student, booking, the public page and the billing page (replaces the old `countActiveStudents`): a pending invite takes a seat; an active student takes one if invited by the tutor, or holds credits, or has a non-cancelled lesson that is not a free trial; trial-only students and archived students take none. Existing seat holders are never locked out.
- [x] `netCents` (earnings) now subtracts `refundedCents` for partial refunds (status stays "paid"); credit reasons are constants in `src/lib/credit-reasons.ts`.

Decisions and limits to know about:
- **Paid vs free credits** is not stored per credit. Rule used: free credits (welcome, "Added by tutor", minus "Free credits removed by tutor") are assumed unused and used lessons are assumed to have come from paid credits, so a refund never covers more than was certainly paid for. A different mix of used credits can leave a student with paid credits that this rule treats as free (the tutor can still adjust by hand).
- With several payments, a Stripe failure on a later one leaves the earlier refunds in place; the error says how many credits were refunded before it.
- A Stripe refusal (balance too low, payment too old, no connected account) changes nothing and is shown to the tutor.
- Cancelling a lesson that was paid with a credit returns the credit (unchanged behaviour), so it can re-block archiving until refunded or removed.
- Giving credits ("Add credits") does not check the Free-plan cap (unchanged), but the student then takes a seat. Two new paid students racing for the last seat can both get in (check-then-insert, unchanged).
- The full-tutor note on the public page is covered by logic tests but was not seen in a browser (the demo tutor is on Pro). The archive card and refusal message were checked in a browser as the demo tutor.

### Verified in a browser and against Stripe TEST mode (2026-10-12)
- [x] Full Free-plan tutor (Nora: 1 client + 2 pending invites): public page `/t/[slug]` shows "This tutor isn't taking new paid lessons right now. You can still book a free trial lesson below.", the trial is pre-selected and the paid lengths are disabled.
- [x] Real refund: a real test-mode charge (EUR 50, "5 lessons", on Nora's connected account) was refunded from the student page as the tutor. The page offered "Refund 1 unused credit (EUR 10)", the confirmation read "Refund EUR 10 to Noah's card? It comes out of your Stripe balance.", Stripe shows ONE refund of EUR 10 (succeeded) on the connected account and `amount_refunded` 10 (charge not fully refunded), the DB shows `refunded_cents` 1000 with status "paid", the credit balance dropped by exactly 1 and the 2 free credits were untouched. A signed `charge.refunded` event posted to `/api/webhooks/stripe` changed nothing, and replaying the same event id returned `duplicate: true`.
- Finding: the paid-vs-free rule (see above) can under-refund. Example seen: 2 free welcome credits (1 used on a lesson), then 5 paid credits, 4 used: the rule treats all used lessons as paid, so it shows 0 refundable although in reality 1-2 paid credits remain. A FIFO rule over the credit ledger (oldest credits used first) would be more accurate; not built (not asked). Test data was removed afterwards (the Stripe test charge and refund stay in Stripe's test mode).
