import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import { verifyPassword } from '@/lib/auth/password';
import { loadSessionUser } from '@/lib/auth/session';
import { landingPath } from '@/lib/auth/landing';
import { normalisePhone } from '@/lib/utils';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
});

/**
 * Sign-in reachability.
 *
 * A driver is hired without a school email address, so an email-only lookup
 * left the whole driver console unreachable — the bug these tests exist to
 * prevent coming back.
 */

/** Mirrors the candidate lookup in the login route. */
async function lookup(identifier: string) {
  const key = identifier.toLowerCase();
  const looksLikePhone = /^[\d\s+\-()]+$/.test(identifier);
  const phone = looksLikePhone ? normalisePhone(identifier) : null;

  const all = await db.query.users.findMany({ with: { school: { columns: { status: true } } } });
  return all.filter((u) => !u.deletedAt && (u.email === key || (phone !== null && u.phone === phone)));
}

describe('driver sign-in', () => {
  it('seeds drivers with a password but no email', async () => {
    const driver = await db.query.drivers.findFirst({
      where: eq(t.drivers.schoolId, fx.schoolId),
      with: { user: true },
    });
    expect(driver!.user.email).toBeNull();
    expect(driver!.user.passwordHash).toBeTruthy();
  });

  it('finds the driver by mobile number and the password verifies', async () => {
    const candidates = await lookup('9860000001');
    expect(candidates).toHaveLength(1);
    expect(await verifyPassword('Password123!', candidates[0].passwordHash!)).toBe(true);
  });

  it('tolerates a number typed with spaces or a country code', async () => {
    for (const typed of ['+91 98600 00001', '098600-00001', '9860000001']) {
      const candidates = await lookup(typed);
      expect(candidates.map((c) => c.name)).toContain('Balbir Singh');
    }
  });

  it('lands the driver on the driver console', async () => {
    const candidates = await lookup('9860000001');
    const session = await loadSessionUser(candidates[0].id);
    expect(session!.driverId).toBeTruthy();
    expect(session!.permissions).toContain('portal.driver');
    expect(landingPath(session!)).toBe('/driver');
  });

  it('gives the driver a route and riders to work with', async () => {
    const candidates = await lookup('9860000001');
    const session = await loadSessionUser(candidates[0].id);

    const route = await db.query.routes.findFirst({
      where: and(eq(t.routes.schoolId, fx.schoolId), eq(t.routes.driverId, session!.driverId!)),
      with: { stops: true, assignments: true },
    });
    expect(route).toBeDefined();
    expect(route!.stops.length).toBeGreaterThan(0);
    expect(route!.assignments.length).toBeGreaterThan(0);
  });
});

describe('password login stays closed where it should be', () => {
  it('will not let a parent password-login — they have no password at all', async () => {
    const parent = await db.query.parents.findFirst({
      where: eq(t.parents.schoolId, fx.schoolId),
      with: { user: true },
    });
    expect(parent!.user.passwordHash).toBeNull();

    const candidates = await lookup(parent!.phone);
    // The row is found, but with no hash nothing can ever verify.
    expect(candidates.every((c) => c.passwordHash === null)).toBe(true);
  });

  it('rejects a wrong password for a real driver', async () => {
    const candidates = await lookup('9860000001');
    expect(await verifyPassword('not-the-password', candidates[0].passwordHash!)).toBe(false);
  });

  it('finds nobody for an unknown number', async () => {
    expect(await lookup('9999999999')).toHaveLength(0);
  });

  it('still signs staff in by email', async () => {
    const candidates = await lookup('admin@dpa.edu');
    expect(candidates).toHaveLength(1);
    const session = await loadSessionUser(candidates[0].id);
    expect(landingPath(session!)).toBe('/school');
  });
});

describe('every demo credential on the login screen actually works', () => {
  const emails = [
    ['admin@schoolsphere.io', '/platform'],
    ['admin@dpa.edu', '/school'],
    ['principal@dpa.edu', '/school'],
    ['meera.iyer@dpa.edu', '/school'],
    ['rohit.verma@dpa.edu', '/school'],
    ['aarav.sharma@dpa.edu', '/student'],
    ['admin@sunrise.edu', '/school'],
  ] as const;

  it.each(emails)('%s signs in and lands on %s', async (email, expected) => {
    const candidates = await lookup(email);
    expect(candidates).toHaveLength(1);
    expect(await verifyPassword('Password123!', candidates[0].passwordHash!)).toBe(true);
    const session = await loadSessionUser(candidates[0].id);
    expect(landingPath(session!)).toBe(expected);
  });

  it.each([['9860000001'], ['9860000002'], ['9860000003']])('driver %s signs in', async (phone) => {
    const candidates = await lookup(phone);
    expect(candidates).toHaveLength(1);
    expect(await verifyPassword('Password123!', candidates[0].passwordHash!)).toBe(true);
  });

  it('the demo parent number is enrolled and can be sent an OTP', async () => {
    const parent = await db.query.parents.findFirst({
      where: and(eq(t.parents.schoolId, fx.schoolId), eq(t.parents.phone, '9810000001')),
      with: { children: true },
    });
    expect(parent).toBeDefined();
    expect(parent!.children.length).toBeGreaterThan(0);
  });
});

describe('wrong-door guidance', () => {
  it('bus crew are NOT parents, so the parent OTP flow legitimately has no row for them', async () => {
    const driver = await db.query.drivers.findFirst({
      where: eq(t.drivers.schoolId, fx.schoolId),
      with: { user: true },
    });
    const asParent = await db.query.parents.findFirst({
      where: and(eq(t.parents.schoolId, fx.schoolId), eq(t.parents.phone, driver!.phone)),
    });
    // This is the state that produced "not registered with this school" — correct
    // behaviour on the parent screen, and the reason the copy now redirects.
    expect(asParent).toBeUndefined();
  });

  it('but the same number does resolve on the staff sign-in path', async () => {
    const driver = await db.query.drivers.findFirst({
      where: eq(t.drivers.schoolId, fx.schoolId),
      with: { user: true },
    });
    const candidates = await lookup(driver!.phone);
    expect(candidates).toHaveLength(1);
    expect(await verifyPassword('Password123!', candidates[0].passwordHash!)).toBe(true);
  });

  it('the OTP refusal tells them where to go instead of just refusing', async () => {
    const source = readFileSync('src/app/api/auth/otp/request/route.ts', 'utf8');
    expect(source).toMatch(/staff sign-in/i);
    // It must still not confirm that any particular account exists.
    expect(source).not.toMatch(/driver account exists|belongs to/i);
  });
});

describe('seeding is safe to get wrong', () => {
  it('refuses a second seed with an actionable instruction, not a constraint error', async () => {
    await expect(seed(db, { log: false })).rejects.toThrow(/npm run db:reset/);
  });
});
