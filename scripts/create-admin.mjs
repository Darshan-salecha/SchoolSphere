#!/usr/bin/env node
/**
 * Creates a platform super admin — the one account that has to exist before
 * anyone can sign in and onboard a school.
 *
 * Plain ESM using only `pg` and `bcryptjs`, both runtime dependencies, so it
 * runs in the production image without TypeScript or a build step.
 *
 *   node scripts/create-admin.mjs --name "Your Name" --email you@example.com
 *
 * The password may be passed with --password, supplied as ADMIN_PASSWORD, or
 * typed at the prompt (which keeps it out of your shell history — preferred).
 */
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

function arg(flag) {
  const i = process.argv.indexOf(`--${flag}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function prompt(question, { mask = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (!mask) {
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  }
  // Suppress echo so the password is not shown while typing.
  const onData = () => rl.output.write('[2K[200D' + question);
  rl.input.on('data', onData);
  const answer = await rl.question(question);
  rl.input.off('data', onData);
  rl.output.write('\n');
  rl.close();
  return answer.trim();
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const name = arg('name') ?? process.env.ADMIN_NAME ?? (await prompt('Full name: '));
  const emailRaw = arg('email') ?? process.env.ADMIN_EMAIL ?? (await prompt('Email: '));
  const password = arg('password') ?? process.env.ADMIN_PASSWORD ?? (await prompt('Password: ', { mask: true }));

  const email = emailRaw?.trim().toLowerCase();

  if (!name || !email || !password) {
    console.error('Name, email and password are all required.');
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('That does not look like a valid email address.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Use at least 12 characters for a platform admin password.');
    process.exit(1);
  }

  const pool = new pg.Pool({
    connectionString,
    max: 1,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  const existing = await pool.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing.rows.length) {
    console.error(`A user with the email ${email} already exists.`);
    await pool.end();
    process.exit(1);
  }

  // Ids are generated in the application layer, so supply one explicitly here.
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO users (id, school_id, name, email, password_hash, status) VALUES ($1, NULL, $2, $3, $4, $5)',
      [id, name, email, passwordHash, 'ACTIVE'],
    );
    await client.query('INSERT INTO user_roles (user_id, role) VALUES ($1, $2)', [id, 'PLATFORM_SUPER_ADMIN']);
    await client.query(
      'INSERT INTO audit_logs (id, school_id, user_id, actor_name, action, entity, entity_id) VALUES ($1, NULL, $2, $3, $4, $5, $6)',
      [randomUUID(), id, name, 'platform_admin.created', 'User', id],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
  console.log(`\nPlatform super admin created: ${email}`);
  console.log('Sign in at /login, then onboard your first school from the platform console.');
}

main().catch((err) => {
  console.error('Could not create the admin:', err instanceof Error ? err.message : err);
  process.exit(1);
});
