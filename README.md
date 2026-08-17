# SchoolSphere

A multi-tenant School Management SaaS platform. One deployment serves many schools; each school gets a completely isolated environment for its students, parents, teachers, staff, classes, attendance, timetable, exams, results, fees, transport and communication.

Built with **Next.js 15 (App Router) · TypeScript · Drizzle ORM · PostgreSQL · Tailwind CSS**.

---

## Getting started

```bash
git clone <your-repo> schoolsphere && cd schoolsphere
cp .env.example .env          # then set AUTH_SECRET to a long random string
npm install
npm run setup                 # starts Postgres in Docker, pushes the schema, seeds demo data
npm run dev                   # http://localhost:3000
```

`npm run setup` is shorthand for:

```bash
npm run db:up      # docker compose up -d  (Postgres 16)
npm run db:push    # apply the schema
npm run db:seed    # realistic demo data
```

Already seeded and want the newer demo accounts, or just a clean slate?

```bash
npm run db:reset   # drops the schema, re-applies it, re-seeds (DEMO_MODE only)
```

If you'd rather use migration files than `db:push`:

```bash
npm run db:generate   # writes SQL to ./drizzle
npm run db:migrate    # applies anything not yet applied
```

### Demo accounts

Every staff account uses the password **`Password123!`**.

| Role | Sign in at | Credential |
| --- | --- | --- |
| Platform Super Admin | `/login` | `admin@schoolsphere.io` |
| Platform Support | `/login` | `support@schoolsphere.io` |
| School Admin | `/login` | `admin@dpa.edu` |
| Principal | `/login` | `principal@dpa.edu` |
| Class Teacher (5-A) | `/login` | `meera.iyer@dpa.edu` |
| Subject Teacher | `/login` | `rohit.verma@dpa.edu` |
| Student | `/login` | `aarav.sharma@dpa.edu` |
| Bus driver | `/login` | `9860000001` (mobile, not email) |
| Bus conductor | `/login` | `9870000011` (mobile) |
| Staff | `/login` | `neha.kulkarni@dpa.edu` |
| Platform Support | `/login` | `support@schoolsphere.io` |
| **Parent** | `/parent-login` | Delhi Public Academy + `9810000001` |
| Second school (isolation test) | `/login` | `admin@sunrise.edu` |

Want a guided tour of each interface — including the driver console and live bus tracking? See **[DEMO.md](./DEMO.md)**.

Staff sign in with an email address *or* a mobile number: bus crew are hired without school email, so an email-only login would lock them out of their own console. Parents sign in with **school + mobile number + OTP**. In demo mode the code is shown on screen and printed to the server console; in production it goes through the SMS provider.

Sign in as `admin@sunrise.edu` to confirm for yourself that no data from Delhi Public Academy is reachable.

---

## How tenancy and permissions work

Three independent layers, all enforced on the server:

**1. Tenant isolation.** Every tenant-owned table carries `schoolId` with an index, and every unique constraint that could collide across schools is scoped by it (`(schoolId, admissionNumber)`, `(schoolId, phone)`, …). `src/lib/tenant.ts` provides `assertSameSchool`, which every endpoint runs against any id that arrived in a request body. A cross-tenant id returns *not found* rather than *forbidden*, so the API never confirms that a record exists somewhere else.

**2. Permissions.** `src/lib/rbac/permissions.ts` holds the canonical catalogue (`students.create`, `attendance.mark`, `results.publish`, …). `roles.ts` maps roles to defaults, and `user_permissions` stores per-user grants and revocations on top. Nothing authorises against a role name at the call site — always a permission key.

**3. Row scope.** Permissions say *what* you may do; `src/lib/scope.ts` says *which rows*. A teacher reaches only their assigned sections, a class teacher gets section-wide rights over their own class only, a parent reaches only linked children, a student only themselves.

API routes throw (`requireSchoolContext('students.create')`); pages redirect (`requireSchoolPage(...)`). Both consult the same permission set, so the UI can never show an action the server would refuse.

Suspending a school flips its status *and* revokes every live session, so users are locked out on their next request rather than at next login.

---

## What's built

All ten phases are implemented.

**Phase 1 — foundation.** Session auth (JWT in an httpOnly cookie, revocable server-side), parent OTP sign-in with expiry, attempt limits and rate limiting, multi-tenancy, RBAC, platform console (schools, plans, subscriptions, usage, suspend/activate, audit, support), school onboarding and a progress-driven 13-step setup wizard.

**Phase 2 — school administration.** Academic years, classes, sections, subjects, teachers with section/subject assignments, students with enrolment history, guardians, staff, per-user permission overrides, and a validate-then-commit CSV import with duplicate detection.

**Phase 3 — academics.** Attendance (five states, configurable edit window, automatic guardian notification on absence), timetable with clash prevention, homework with submission tracking and teacher acknowledgement, assignments, exams with per-section papers, marks entry with range validation, result computation with section ranking, publish/unpublish.

**Phase 4 — parent portal.** Child switching, attendance, homework, results, timetable, fees, transport, announcements, events, leave, messages, documents. Private document upload/download, certificate issue with frozen wording, and printable report cards.

**Phase 5 — finance.** Fee categories and structures, idempotent bulk fee generation, concessions (scholarship, sibling, staff ward), collection with sequential receipts, parent online payment through the provider abstraction, printable receipts, staged reminders with per-stage dedupe, and finance reporting. All amounts are integer minor units; balances are derived from the payment ledger, never incremented.

**Phase 6 — transport with live tracking.** Buses, crew, routes, stops, student assignments, document-expiry alerts. Live GPS: the driver console streams position under a shared publish policy, guardians watch the bus on a map with ETA and distance, and proximity crossings notify each family exactly once per trip. Architecture ported from the attached Lactora project (see below).

**Phase 7 — communication.** Notification centre with unread counts in every portal, and parent–teacher messaging threads scoped to one student, so no personal phone number is ever exposed.

**Phase 8 — reports and exports.** Attendance trends, class performance, teacher workload, finance position, plus role-scoped CSV export of students, attendance, fees, results and transport, and print-to-PDF throughout.

**Phase 9 — platform SaaS.** Plans, subscriptions, per-tenant usage against plan limits, invoice ledger, and **enforced** limits — student and teacher caps and plan-gated features now fail closed with a 402 and a clear message.

**Phase 10 — advanced.** PWA (manifest, shortcuts, service worker with an offline page; nothing authenticated is ever cached), and smart notification rules for low attendance, upcoming exams, overdue fees and stale bus trips — all idempotent and safe to schedule.

---

## Live bus tracking

The tracking architecture follows the reference implementation in the attached **Lactora DairyOS** project: a single dependency-free domain module (`src/lib/tracking.ts`) shared by producer and consumer, so the throttle window, the accuracy policy, the proximity radii and the ETA maths cannot drift between the driver's phone, the server and the parent's map. Also carried across: tenant-first channel naming, the per-trip notice ledger for deduplication, staleness detection with a polling fallback, and interpolated marker animation.

Two things are deliberately different from the reference:

**Transport — Server-Sent Events, not Socket.IO.** Bus position is a one-way server→client stream. The driver publishes over ordinary HTTP POSTs, which retry cleanly on a flaky mobile network, and parents subscribe over SSE. This needs no custom server, so `next start` and the container image are unchanged, and there is one fewer moving part to operate.

**Rendering — raster tiles and SVG, not a WebGL map library.** The map is OpenStreetMap tiles positioned with CSS plus an SVG overlay. No API key, no account, no WebGL requirement on the inexpensive Android phones most parents actually use. Attribution is a licence condition and must stay.

Note that fan-out is in-process (`src/lib/services/tracking-bus.ts`), which is correct for the single-container deployment here. It is also deliberately the only thing that must change to scale horizontally — swap it for Redis pub/sub and nothing above it moves.

## Project layout

```
src/
  app/
    (auth)/            sign-in screens (staff password, parent OTP)
    platform/          platform admin console
    school/            school workspace — admin, principal, teacher
    parent/            parent portal
    student/           student portal
    driver/            driver portal (phase 6)
    api/               REST endpoints, all guarded server-side
  components/          design system + shared widgets
  db/                  Drizzle schema, seed, migrate
  lib/
    auth/              sessions, JWT, passwords, OTP
    rbac/              permission catalogue and role matrix
    scope.ts           row-level access rules
    tenant.ts          tenant isolation helpers
    services/          business logic (students, schools, attendance, notify)
    integrations/      SMS, email, storage, payments — swappable providers
drizzle/               generated SQL migrations
tests/                 security, flow and schema tests
```

---

## Integrations

SMS, email, file storage and payments sit behind provider interfaces in `src/lib/integrations/`. The default drivers are local mocks, so OTP, notifications and receipts work end-to-end on a laptop with no accounts or keys. Swap in Twilio, SES, S3 or Razorpay by adding a driver and changing one environment variable — no business logic changes.

---

## Testing

```bash
npm test
```

145 tests across 9 files, run against a real Postgres (PGlite, in-process — no Docker needed in CI):

| Suite | What it proves |
| --- | --- |
| `security` | School A cannot list, load or act on school B's records; suspended tenants are denied a session; unassigned teachers are refused a section; parent A cannot reach parent B's child; teachers hold no destructive, financial or platform permission; per-user overrides grant, revoke and reset |
| `flows` | Parent OTP — unenrolled numbers refused, codes single-use, wrong codes counted, resends throttled; onboarding creates tenant, settings, trial and admin atomically; notifications reach only the right household |
| `fees` | Money arithmetic never goes negative; concessions cap at the fee and never cross tenants; generation is idempotent; over-payment, zero and negative amounts refused; balances derived so recompute is repeatable; reminders dedupe per stage |
| `transport` | Trip lifecycle and orphan closure; fix throttling; unusable readings rejected; proximity alerts fire once per trip; boarding refused for students not on the route; stale trips reaped; stream channels isolated per school |
| `tracking` | The shared domain rules as pure functions — haversine against known distances, bearings, interpolation clamping, coarse fixes accepted but labelled, null island rejected, publish policy, ETA sanity, radius boundaries |
| `communication` | Thread access for participants only (admins may audit, other teachers may not); replies notify one side; certificates freeze wording and allocate serials; plan limits fail closed at 402; automation rules are idempotent |
| `homework` | Student ticks, teacher acknowledgement, rework round-trips, class and tenant scoping |
| `boundaries` | No client component reaches the database or a node-only package, transitively; every API route exports a method and is authorisation-guarded; every data-reading page opts out of static rendering; sensitive writes record an audit entry |
| `schema` | Migrations apply to a fresh database; seed meets the demo-data bar; every student has an enrolment and a guardian; published results carry ranks |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Session signing key — 32+ random characters |
| `DEMO_MODE` | `true` shows demo credentials and OTP codes on screen. **Set to `false` in production.** |
| `SMS_PROVIDER` / `EMAIL_PROVIDER` / `STORAGE_PROVIDER` / `PAYMENT_PROVIDER` | Which driver each integration uses |

---

## Deploying

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for a step-by-step cloud deployment with Docker — TLS, migrations, backups and the production checklist.

```bash
cp .env.production.example .env.production   # fill in the CHANGE-ME values
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
  migrate node scripts/create-admin.mjs --name "Your Name" --email you@example.com
```

---

## Before going to production

- Set `DEMO_MODE=false` and a strong unique `AUTH_SECRET`
- Replace the mock SMS, email, storage and payment drivers with real providers
- Put the app behind HTTPS (session cookies switch to `secure` automatically in production)
- Move the login throttle from in-process memory to Redis if you run more than one instance
- Set up database backups and point-in-time recovery
