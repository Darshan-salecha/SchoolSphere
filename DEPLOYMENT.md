# Deploying SchoolSphere

The stack runs as four containers: **Caddy** (TLS + reverse proxy) → **app** (Next.js standalone server) → **Postgres**, with a **migrate** job that runs once per deploy and must succeed before the app starts.

These steps work identically on AWS EC2, Google Compute Engine, Azure VMs, DigitalOcean, Hetzner, Linode or any Linux box you can SSH into. Managed-database and platform-as-a-service variants are at the end.

---

## What you need

- A Linux VM — 2 vCPU / 4 GB RAM handles a few thousand students comfortably; 1 vCPU / 2 GB is enough to trial it
- A domain name you control
- Ports 80 and 443 open to the internet in the firewall or security group
- SSH access

---

## Step 1 — Point your domain at the server

Create a DNS **A record** for `school.yourdomain.com` pointing to the server's public IP address.

Do this first. Caddy requests a certificate the moment it starts, and that only works once the name resolves. Check it has propagated:

```bash
dig +short school.yourdomain.com
```

---

## Step 2 — Install Docker on the server

```bash
ssh your-user@your-server-ip

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker            # or log out and back in

docker --version && docker compose version
```

---

## Step 3 — Get the code onto the server

```bash
git clone https://github.com/your-org/schoolsphere.git
cd schoolsphere
```

No Git remote yet? From your laptop:

```bash
rsync -av --exclude node_modules --exclude .next --exclude .env \
  ~/Documents/SchoolSphere/ your-user@your-server-ip:~/schoolsphere/
```

---

## Step 4 — Create the production environment file

```bash
cp .env.production.example .env.production
```

Generate two strong secrets:

```bash
echo "AUTH_SECRET=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
```

Edit `.env.production` and set:

| Variable | Value |
| --- | --- |
| `APP_DOMAIN` | `school.yourdomain.com` — no scheme, no trailing slash |
| `APP_URL` | `https://school.yourdomain.com` |
| `AUTH_SECRET` | the generated hex string |
| `POSTGRES_PASSWORD` | the generated password |
| `DATABASE_URL` | `postgresql://schoolsphere:<that password>@db:5432/schoolsphere` |

The password appears twice — in `POSTGRES_PASSWORD` and inside `DATABASE_URL`. They must match, and if the password contains `@`, `:` or `/`, URL-encode it in `DATABASE_URL`.

Lock the file down:

```bash
chmod 600 .env.production
```

---

## Step 5 — Build and start

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

First build takes a few minutes. In order, Compose will: start Postgres and wait for it to be healthy, run the migration job to completion, start the app, then start Caddy, which fetches a certificate from Let's Encrypt.

Watch it come up:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f app
```

Confirm the app is healthy from the server itself:

```bash
curl -s https://school.yourdomain.com/api/health
# {"status":"ok"}
```

---

## Step 6 — Create your first platform admin

The production stack does **not** seed demo data. Create the real super admin once:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm \
  migrate node scripts/create-admin.mjs \
  --name "Your Name" --email you@yourdomain.com
```

It prompts for the password so it never reaches your shell history. For an automated setup you can pass `--password` or set `ADMIN_PASSWORD`, but prefer the prompt. Minimum 12 characters; the account is created with the `PLATFORM_SUPER_ADMIN` role and recorded in the audit log.

Then sign in at `https://school.yourdomain.com/login` and onboard your first school from the platform console.

> Want the demo data instead, to explore the product? Run
> `docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate npm run db:seed`.
> Do **not** do this on a real deployment — it creates accounts with a published password.

---

## Deploying an update

```bash
cd ~/schoolsphere
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Migrations run automatically before the new app container takes over. If a migration fails, the job exits non-zero, the app is not restarted, and the previous container keeps serving traffic.

Roll back:

```bash
git checkout <previous-commit>
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Application code rolls back cleanly. **Database migrations do not** — write additive migrations (add a nullable column, backfill, then drop later) so an old app version can still run against a newer schema.

---

## Backups

Nothing here is optional — this is student and financial data.

```bash
mkdir -p backups

# Manual backup
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_dump -U schoolsphere schoolsphere | gzip > backups/$(date +%F-%H%M).sql.gz
```

Nightly at 02:00, keeping 14 days — `crontab -e`:

```cron
0 2 * * * cd /home/your-user/schoolsphere && docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db pg_dump -U schoolsphere schoolsphere | gzip > backups/$(date +\%F).sql.gz && find backups -name '*.sql.gz' -mtime +14 -delete
```

Restore:

```bash
gunzip -c backups/2026-08-13.sql.gz | \
  docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  psql -U schoolsphere schoolsphere
```

Copy `backups/` off the server — to S3, Backblaze or another machine. A backup on the same disk as the database is not a backup. Restore-test it at least once; an untested backup is a guess.

Uploaded documents live in the `uploads` volume, separate from the database:

```bash
docker run --rm -v schoolsphere_uploads:/data -v $(pwd)/backups:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

---

## Before you let real families in

- [ ] `DEMO_MODE` is `false` — the compose file forces this, so demo credentials and on-screen OTP codes are off
- [ ] `AUTH_SECRET` is unique to this deployment and never committed
- [ ] Postgres publishes no host port — it is on an internal Docker network only
- [ ] A **real SMS provider** is configured. With `SMS_PROVIDER=mock`, OTP codes only reach the container log, so **no parent can sign in**. This is the single most common thing to miss.
- [ ] Backups are running *and* you have restored one successfully
- [ ] The server firewall allows only 22, 80 and 443
- [ ] Unattended security upgrades enabled: `sudo apt install unattended-upgrades`

Wire up a real SMS gateway by adding a driver in `src/lib/integrations/sms.ts` alongside the existing `mock`, then set `SMS_PROVIDER` to its key. Email, storage and payments follow the same pattern — no business logic changes.

---

## Variants

### Managed Postgres (RDS, Cloud SQL, Neon, Supabase)

Recommended once this is real: you get automated backups, point-in-time recovery and failover without maintaining them yourself.

1. Delete the `db` service from `docker-compose.prod.yml`, and remove the two `depends_on: db` blocks.
2. Point `DATABASE_URL` at the managed instance.
3. Set `DATABASE_SSL=true` — most managed providers require TLS.
4. Allow the server's IP in the database firewall.

The migrate job works unchanged.

### Scaling past one app container

The app itself is stateless — sessions are JWTs in cookies, validated against the database. Two things need attention first:

- **Uploads.** `STORAGE_PROVIDER=local` writes to a per-container volume. Add an S3 driver in `src/lib/integrations/storage.ts` before running more than one instance.
- **Login throttling.** The failed-login counter in `src/app/api/auth/login/route.ts` is in-process memory, so with N instances an attacker effectively gets N times the attempts. Move it to Redis.

Then scale with `docker compose up -d --scale app=3`; Caddy load-balances across them automatically.

### Platform-as-a-service

The same Dockerfile deploys unchanged:

- **Fly.io** — `fly launch --dockerfile Dockerfile`, `fly postgres create`, `fly secrets set AUTH_SECRET=...`, and run the migrator as a release command
- **Render / Railway** — point at the repo, select the Dockerfile, add a managed Postgres, set env vars, use `node scripts/migrate.mjs` as the pre-deploy command
- **AWS ECS / Google Cloud Run** — push the image to ECR/Artifact Registry, run the migrator as a one-off task before the service update, and keep `/api/health` as the load-balancer health check

In every case drop Caddy — the platform terminates TLS for you.

---

## Troubleshooting

**Caddy cannot get a certificate.** DNS is not pointing here yet, or 80/443 are blocked. Check `dig +short school.yourdomain.com` and your security group, then `docker compose ... logs caddy`.

**App container restarts in a loop.** Almost always `DATABASE_URL` or `AUTH_SECRET`. `docker compose ... logs app` will say which. `AUTH_SECRET` must be at least 16 characters.

**Migrate job fails.** Read `docker compose ... logs migrate`. The failing statement rolled back, so the schema is untouched and safe to retry after a fix.

**Parents never receive an OTP.** `SMS_PROVIDER` is still `mock`. Codes are in `docker compose ... logs app`. Configure a real gateway.

**`password authentication failed`.** `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` disagree, or the password contains a character needing URL-encoding. Note that changing `POSTGRES_PASSWORD` after the first start has no effect — the volume already holds the initialised database. Either change it with `ALTER USER` or delete the volume and restore from backup.
