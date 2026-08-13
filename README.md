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
| **Parent** | `/parent-login` | Delhi Public Academy + `9810000001` |
| Second school (isolation test) | `/login` | `admin@sunrise.edu` |

Parents sign in with **school + mobile number + OTP**. In demo mode the code is shown on screen and printed to the server console; in production it goes through the SMS provider.

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

**Phase 1 — foundation.** Session auth (JWT in an httpOnly cookie, revocable server-side), parent OTP sign-in with expiry, attempt limits and rate limiting, multi-tenancy, RBAC, platform console (schools, plans, subscriptions, suspend/activate, audit, support), school onboarding and a progress-driven 13-step setup wizard.

**Phase 2 — school administration.** Academic years, classes, sections, subjects, teachers with section/subject assignments, students with enrolment history, guardians, staff, per-user permission management, and a validate-then-commit CSV bulk import with duplicate detection.

**Phase 3 — academics.** Attendance (five states, configurable edit window, automatic guardian notification on absence), timetable with clash prevention, homework, assignments, exams with per-section papers, marks entry with range validation, result computation with section ranking, publish/unpublish, plus parent, student, teacher, principal and admin dashboards and reporting.

**Phases 4–10 — ahead of the UI.** The schema, provider abstractions and permissions for fees, payments, transport, GPS trips, documents, certificates and library are already in place, so those modules slot in without migrations that reshape existing data.

---

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

41 tests run against a real Postgres (PGlite, in-process — no Docker needed in CI), covering:

- Tenant isolation: school A's admin cannot list, load or act on school B's records
- Suspended tenants: every user is denied a session immediately
- Teacher scope: unassigned sections and unowned subjects are refused
- Parent scope: parent A cannot reach parent B's child
- Permission matrix: teachers have no destructive, financial or platform powers
- Per-user permission overrides grant, revoke and reset correctly
- Parent OTP: unenrolled numbers rejected, codes single-use, wrong codes counted, resends throttled
- Onboarding: tenant, settings, trial subscription and first admin created atomically
- Notifications reach only the right household
- Results: unpublished results are invisible; ranks are per-section and monotonic
- Duplicate detection, CSV parsing, grading, phone normalisation, password hashing

---

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
