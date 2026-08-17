# Seeing the UI

```bash
cd ~/Documents/SchoolSphere
npm install
npm run setup     # Docker Postgres + schema + demo data (~1 min)
npm run dev       # http://localhost:3000
```

`npm run setup` needs Docker running. If you'd rather use your own Postgres, put its URL in `.env` and run `npm run db:push && npm run db:seed` instead.

Every account below uses the password **`Password123!`**

---

## Every role, and where to see it

Ten roles are defined and all ten have a working account. Password for every one: **`Password123!`**

| Role | Sign in at | Credential | Portal |
| --- | --- | --- | --- |
| Platform Super Admin | `/login` | `admin@schoolsphere.io` | `/platform` |
| Platform Support | `/login` | `support@schoolsphere.io` | `/platform` (read-only + tickets) |
| School Admin | `/login` | `admin@dpa.edu` | `/school` |
| Principal | `/login` | `principal@dpa.edu` | `/school` (executive view) |
| Teacher — class teacher of 5-A | `/login` | `meera.iyer@dpa.edu` | `/school` (own classes only) |
| Teacher — subject only | `/login` | `rohit.verma@dpa.edu` | `/school` (narrower still) |
| Staff — receptionist | `/login` | `neha.kulkarni@dpa.edu` | Student & parent directory |
| Staff — accountant | `/login` | `sanjay.gupta@dpa.edu` | Directory + **Fees** |
| Staff — librarian | `/login` | `latha.krishnan@dpa.edu` | Directory + **Library** |
| Student | `/login` | `aarav.sharma@dpa.edu` | `/student` |
| **Bus driver** | `/login` | `9860000001` *(mobile)* | `/driver` |
| **Bus conductor** | `/login` | `9870000011` *(mobile)* | `/driver` |
| **Parent** — two children | `/parent-login` | Delhi Public Academy + `9810000001` | `/parent` |
| Parent — limited-access guardian | `/parent-login` | Delhi Public Academy + `9812000001` | `/parent` |

Bus crew sign in with a **mobile number**, not an email — crew are hired without school email addresses.

> **Both driver *and* parent sign-in take a mobile number, so it is easy to pick the wrong one.**
> Bus crew belong on `/login` (mobile + password). `/parent-login` is guardians only, and will tell you
> *"that mobile number is not registered as a parent at this school"* if you try a driver's number there —
> which is correct, not a seeding problem.

### Refreshing the demo data

`db:seed` is deliberately not idempotent — it would otherwise half-write a second copy of a school. If you
seeded before the conductor and limited-guardian accounts were added, or you just want a clean slate:

```bash
npm run db:reset     # drops the schema, re-applies it, re-seeds
```

It refuses to run unless `DEMO_MODE=true`, so it cannot be fired at a real database by muscle memory.

### Also seeded, for testing the edges

| Account | Why it exists |
| --- | --- |
| `admin@sunrise.edu` | A second school. Confirms nothing from Delhi Public Academy is reachable. |
| `priya.shah@sunrise.edu` | A teacher at that second school, for cross-tenant checks. |
| `admin@stmarys.edu` | A **suspended** school. Sign-in is refused — this is the lockout working. |
| `9811000001` | Aarav's mother. Same child, a second full guardian. |
| `9812000001` | Aarav's grandmother, `LIMITED` access rather than `FULL`. |

There is a test (`tests/roles.test.ts`) that fails the build if any declared role loses its account, so this table cannot quietly drift.

---

## 1. The driver console — `/driver`

Sign in at `/login` with **`9860000001`** / `Password123!`. You land straight on `/driver`.

It is built for one hand in a moving bus, so **open your browser's device toolbar and pick a phone** (in Chrome: ⌘⌥I, then ⌘⇧M). On a desktop width it still works, it just looks sparse.

You'll see:

- **Bus 12 · Route A — Green Park**, with a not-started badge
- **Start pickup** / **Start drop** — full-width buttons
- Each stop in order, with the children who board there
- Three large actions per child: **Boarded · Dropped · Absent**

Press **Start pickup**. The browser asks for location permission — allow it. Then:

- The badge turns green and live
- A counter appears: *"3 positions sent · accurate to 24 m"*
- The boarding buttons become active

Location is only shared while a trip is running — press **End trip** and the watch stops. That's deliberate: a driver's phone is not tracked outside their shift.

> On a laptop, browser geolocation is wifi-based and can be off by a kilometre or two. The app publishes those fixes anyway and labels them *approximate* rather than freezing the map — which is the behaviour you want on a real bus phone that has lost sky view.

---

## 2. Watching the bus as a parent

The satisfying demo needs two windows side by side.

**Window A — the driver.** Sign in as `9860000001`, press **Start pickup**, allow location.

**Window B — the parent.** Use a private/incognito window so the two sessions don't collide. Go to `/parent-login`, choose **Delhi Public Academy**, enter **`9810000001`**, press send. The OTP appears **on screen** (demo mode) and in the terminal running `npm run dev`. Enter it, then open **School bus** in the sidebar.

You'll see the bus on the map with a pulsing marker, ETA and distance to *your child's* stop, the route drawn through the stops, and your stop highlighted. Move the driver window's simulated location (Chrome device toolbar → Sensors → Location) and the marker animates across within a few seconds.

Back in the driver window, press **Boarded** for Aarav. The parent window gets a notification, and *Aarav boarded the bus* appears under Today. Only that household is told — the notice ledger makes sure each family hears once per trip.

If the driver hasn't started a trip, the parent sees an honest empty state — *"The bus is not on the road right now"* — rather than a dead map.

---

## 3. Worth a look elsewhere

**As `admin@dpa.edu`:**

- **Fees** → **Raise fees** creates one instalment for a whole year group; run it twice and it refuses to double-bill. **Collect** records a payment and issues a sequential receipt.
- **Transport** → the fleet, routes with stops, live trips, and document-expiry alerts (one bus has insurance expiring in 15 days on purpose).
- **Students** → open any child for documents, certificates, guardians and a printable **Report card**.
- **Settings** → **Run smart rules** fires the low-attendance, upcoming-exam and overdue-fee rules. Run it twice — the second run notifies nobody.
- **Reports** → CSV exports and print-to-PDF.

**As the three staff accounts** — each job title unlocks a different desk. The receptionist gets the student and parent directory (whole school, look-up only — they cannot enrol or transfer anyone). The accountant additionally gets **Fees**. The librarian additionally gets **Library**, where one book is deliberately overdue so you can see a fine accruing at ₹2/day. Those extras appear as explicit grants under **Users & roles**, so an admin can see and change exactly what each hire can do.

**As `meera.iyer@dpa.edu`** (class teacher of 5-A) — notice she sees only her own classes. Try `/school/fees`; she has no fees permission and is redirected rather than shown a broken page.

**As `principal@dpa.edu`** — attendance trends, class performance, teacher workload.

**As `admin@schoolsphere.io`** — **Schools** and **Usage**. Suspend Delhi Public Academy and every one of its users is signed out on their next click; reactivate to restore.

**As `admin@sunrise.edu`** — the isolation check. This is a different school: none of Delhi Public Academy's students, fees or buses are reachable, by URL or otherwise.

---

## Turning it off for real use

Set `DEMO_MODE=false` in `.env`. That hides the credential list and stops OTP codes appearing on screen — after which parents need a real SMS provider to sign in at all. `docker-compose.prod.yml` already forces it off. See [DEPLOYMENT.md](./DEPLOYMENT.md).
