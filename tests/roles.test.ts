import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { sessionFor, expectForbidden } from './helpers/session';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import { ROLE_KEYS, ROLE_DEFINITIONS } from '@/lib/rbac/roles';
import { crewTrip, recordBoarding, startTrip } from '@/lib/services/transport';
import { landingPath } from '@/lib/auth/landing';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
});

/**
 * Every role declared in the permission matrix must have a seeded account that
 * can actually sign in. A role with permissions and no way to reach them is how
 * the driver console shipped unreachable, and how the conductor role sat
 * declared-but-unwired.
 */
describe('demo coverage: every role is reachable', () => {
  it('has at least one usable account per role', async () => {
    const users = await db.query.users.findMany({ with: { roles: true } });

    const missing: string[] = [];
    for (const role of ROLE_KEYS) {
      const holders = users.filter((u) => u.roles.some((r) => r.role === role));
      // Parents authenticate by OTP and hold no password by design.
      const usable = holders.filter((u) => (role === 'PARENT' ? Boolean(u.phone) : Boolean(u.passwordHash)));
      if (!usable.length) missing.push(role);
    }
    expect(missing).toEqual([]);
  });

  it('gives every role a non-empty permission set', () => {
    for (const role of ROLE_KEYS) {
      expect(ROLE_DEFINITIONS[role].permissions.length).toBeGreaterThan(0);
    }
  });

  it('routes each role to a portal it can actually open', async () => {
    const cases: [string, string][] = [
      [fx.platformAdminId, '/platform'],
      [fx.adminUserId, '/school'],
      [fx.principalUserId, '/school'],
      [fx.classTeacherUserId, '/school'],
      [fx.parentUserId, '/parent'],
      [fx.conductorUserId, '/driver'],
    ];
    for (const [userId, expected] of cases) {
      expect(landingPath(await sessionFor(userId))).toBe(expected);
    }
  });
});

describe('conductor', () => {
  let driverId: string;
  let routeId: string;
  let riderId: string;

  beforeAll(async () => {
    const route = await db.query.routes.findFirst({
      where: and(eq(t.routes.schoolId, fx.schoolId), eq(t.routes.conductorId, fx.conductorId)),
    });
    routeId = route!.id;
    driverId = route!.driverId!;
    const assignment = await db.query.studentTransport.findFirst({
      where: and(eq(t.studentTransport.schoolId, fx.schoolId), eq(t.studentTransport.routeId, routeId)),
    });
    riderId = assignment!.studentId;
  });

  it('is attached to a route as crew, not as its driver', async () => {
    const route = await db.query.routes.findFirst({ where: eq(t.routes.id, routeId) });
    expect(route!.conductorId).toBe(fx.conductorId);
    expect(route!.driverId).not.toBe(fx.conductorId);
  });

  it('signs in to the driver portal with the transport permission', async () => {
    const session = await sessionFor(fx.conductorUserId);
    expect(session.driverId).toBe(fx.conductorId);
    expect(session.permissions).toContain('transport.trip.operate');
    expect(session.roles).toContain('CONDUCTOR');
  });

  it('has no trip to act on until the driver starts one', async () => {
    expect(await crewTrip(fx.schoolId, fx.conductorId)).toBeNull();
  });

  it('cannot start a trip on the route it attends', async () => {
    const err = await expectForbidden(() =>
      startTrip({ schoolId: fx.schoolId, driverId: fx.conductorId, routeId, direction: 'PICKUP' }),
    );
    expect(err.message).toMatch(/not assigned/i);
  });

  it('can mark a child once the driver is under way', async () => {
    await startTrip({ schoolId: fx.schoolId, driverId, routeId, direction: 'PICKUP' });

    const crew = await crewTrip(fx.schoolId, fx.conductorId);
    expect(crew?.role).toBe('CONDUCTOR');

    const event = await recordBoarding({
      schoolId: fx.schoolId,
      driverId: fx.conductorId,
      studentId: riderId,
      type: 'BOARDED',
    });
    expect(event.type).toBe('BOARDED');
  });

  it('still cannot mark a child on someone else’s route', async () => {
    const otherRoute = await db.query.routes.findFirst({
      where: and(eq(t.routes.schoolId, fx.schoolId), eq(t.routes.conductorId, fx.conductorId)),
    });
    const offRoute = await db.query.studentTransport.findFirst({
      where: and(eq(t.studentTransport.schoolId, fx.schoolId)),
    });
    if (!offRoute || offRoute.routeId === otherRoute!.id) return;
    await expectForbidden(() =>
      recordBoarding({ schoolId: fx.schoolId, driverId: fx.conductorId, studentId: offRoute.studentId, type: 'BOARDED' }),
    );
  });
});

describe('limited-access guardian', () => {
  it('is linked to the child with LIMITED rather than FULL access', async () => {
    const session = await sessionFor(fx.limitedParentUserId);
    const link = await db.query.studentParents.findFirst({
      where: and(eq(t.studentParents.parentId, session.parentId!), eq(t.studentParents.studentId, fx.students[0].id)),
    });
    expect(link!.access).toBe('LIMITED');
    expect(link!.relation).toBe('GUARDIAN');
  });

  it('demonstrates that one child can have several authorised guardians', async () => {
    const links = await db.query.studentParents.findMany({
      where: eq(t.studentParents.studentId, fx.students[0].id),
    });
    expect(links.length).toBeGreaterThanOrEqual(3); // father, mother, grandparent
    expect(new Set(links.map((l) => l.access))).toContain('LIMITED');
  });

  it('still cannot reach a child they are not linked to', async () => {
    const session = await sessionFor(fx.limitedParentUserId);
    const notTheirs = fx.students.find((s) => s.sectionKey === '10-A')!;
    const { assertParentOwnsStudent } = await import('@/lib/scope');
    await expectForbidden(() => assertParentOwnsStudent(session, notTheirs.id));
  });
});
