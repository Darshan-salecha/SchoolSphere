import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { busSchema, driverSchema, routeSchema, routeStopSchema, transportAssignSchema } from '@/lib/validation/schemas';
import { assertSameSchool } from '@/lib/tenant';
import { assertCanViewStudent } from '@/lib/scope';
import { hashPassword } from '@/lib/auth/password';
import { clearRouteCache } from '@/lib/services/transport';
import { recordAudit } from '@/lib/audit';
import { conflict, badRequest } from '@/lib/errors';

const iso = (d?: Date) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * One endpoint for the transport setup entities, keyed by `kind`.
 * They are all small, all admin-only, and all invalidate the same cache.
 */
const bodySchema = z.discriminatedUnion('kind', [
  busSchema.extend({ kind: z.literal('bus') }),
  driverSchema.extend({ kind: z.literal('driver') }),
  routeSchema.extend({ kind: z.literal('route') }),
  routeStopSchema.extend({ kind: z.literal('stop') }),
  transportAssignSchema.extend({ kind: z.literal('assign') }),
]);

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('transport.manage');
  const input = await parseBody(req, bodySchema);

  switch (input.kind) {
    case 'bus': {
      const [row] = await db
        .insert(t.buses)
        .values({
          schoolId: session.schoolId,
          busNumber: input.busNumber,
          registrationNumber: input.registrationNumber || null,
          capacity: input.capacity,
          model: input.model || null,
          insuranceExpiry: iso(input.insuranceExpiry),
          fitnessExpiry: iso(input.fitnessExpiry),
          pollutionExpiry: iso(input.pollutionExpiry),
        })
        .returning();
      await recordAudit({ session, action: 'bus.created', entity: 'Bus', entityId: row.id, after: row });
      return created(row);
    }

    case 'driver': {
      // Drivers sign in with a phone number, so it must be unique in the school.
      const existing = await db.query.users.findFirst({
        where: and(eq(t.users.schoolId, session.schoolId), eq(t.users.phone, input.phone)),
      });
      if (existing) throw conflict('That mobile number already belongs to someone at this school.');

      const passwordHash = await hashPassword(input.password ?? 'Password123!');
      const row = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(t.users)
          .values({ schoolId: session.schoolId, name: input.name, phone: input.phone, passwordHash })
          .returning();
        await tx.insert(t.userRoles).values({ userId: user.id, role: input.role === 'CONDUCTOR' ? 'CONDUCTOR' : 'DRIVER' });
        const [driver] = await tx
          .insert(t.drivers)
          .values({
            schoolId: session.schoolId,
            userId: user.id,
            licenseNumber: input.licenseNumber,
            licenseExpiry: iso(input.licenseExpiry),
            phone: input.phone,
            role: input.role,
          })
          .returning();
        return driver;
      });
      await recordAudit({ session, action: 'driver.created', entity: 'Driver', entityId: row.id, after: { name: input.name, role: input.role } });
      return created(row);
    }

    case 'route': {
      if (input.busId) assertSameSchool(await db.query.buses.findFirst({ where: eq(t.buses.id, input.busId) }), session.schoolId);
      if (input.driverId) assertSameSchool(await db.query.drivers.findFirst({ where: eq(t.drivers.id, input.driverId) }), session.schoolId);
      if (input.conductorId) assertSameSchool(await db.query.drivers.findFirst({ where: eq(t.drivers.id, input.conductorId) }), session.schoolId);

      const [row] = await db
        .insert(t.routes)
        .values({
          schoolId: session.schoolId,
          name: input.name,
          busId: input.busId || null,
          driverId: input.driverId || null,
          conductorId: input.conductorId || null,
        })
        .returning();
      clearRouteCache();
      await recordAudit({ session, action: 'route.created', entity: 'TransportRoute', entityId: row.id, after: row });
      return created(row);
    }

    case 'stop': {
      assertSameSchool(await db.query.routes.findFirst({ where: eq(t.routes.id, input.routeId) }), session.schoolId);
      const [row] = await db
        .insert(t.routeStops)
        .values({
          schoolId: session.schoolId,
          routeId: input.routeId,
          name: input.name,
          order: input.order,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          pickupTime: input.pickupTime || null,
          dropTime: input.dropTime || null,
        })
        .returning();
      clearRouteCache();
      await recordAudit({ session, action: 'route_stop.created', entity: 'RouteStop', entityId: row.id, after: row });
      return created(row);
    }

    case 'assign': {
      await assertCanViewStudent(session, input.studentId);
      const route = assertSameSchool(await db.query.routes.findFirst({ where: eq(t.routes.id, input.routeId) }), session.schoolId);
      const stop = assertSameSchool(await db.query.routeStops.findFirst({ where: eq(t.routeStops.id, input.stopId) }), session.schoolId);
      if (stop.routeId !== route.id) throw badRequest('That stop is not on the selected route.');

      // A student rides one route at a time; re-assigning replaces the old one.
      await db
        .delete(t.studentTransport)
        .where(and(eq(t.studentTransport.schoolId, session.schoolId), eq(t.studentTransport.studentId, input.studentId)));

      const [row] = await db
        .insert(t.studentTransport)
        .values({
          schoolId: session.schoolId,
          studentId: input.studentId,
          routeId: input.routeId,
          stopId: input.stopId,
          type: input.type,
          validFrom: new Date().toISOString().slice(0, 10),
        })
        .returning();
      clearRouteCache();
      await recordAudit({ session, action: 'transport.assigned', entity: 'StudentTransport', entityId: row.id, after: row });
      return created(row);
    }

    default:
      throw badRequest('Unknown transport record.');
  }
});
