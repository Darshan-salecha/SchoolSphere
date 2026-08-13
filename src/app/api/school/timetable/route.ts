import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { periodSchema, timetableSlotSchema } from '@/lib/validation/schemas';
import { assertSameSchool } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';
import { conflict } from '@/lib/errors';

/** Upserts one cell of a section's weekly timetable, refusing teacher clashes. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('timetable.manage');
  const input = await parseBody(req, timetableSlotSchema);

  assertSameSchool(await db.query.sections.findFirst({ where: eq(t.sections.id, input.sectionId) }), session.schoolId);
  assertSameSchool(await db.query.periods.findFirst({ where: eq(t.periods.id, input.periodId) }), session.schoolId);

  if (input.teacherId) {
    assertSameSchool(await db.query.teachers.findFirst({ where: eq(t.teachers.id, input.teacherId) }), session.schoolId);
    const clash = await db.query.timetableSlots.findFirst({
      where: and(
        eq(t.timetableSlots.schoolId, session.schoolId),
        eq(t.timetableSlots.teacherId, input.teacherId),
        eq(t.timetableSlots.dayOfWeek, input.dayOfWeek),
        eq(t.timetableSlots.periodId, input.periodId),
        ne(t.timetableSlots.sectionId, input.sectionId),
      ),
      with: { section: { with: { class: true } } },
    });
    if (clash) {
      throw conflict(`That teacher is already teaching ${clash.section.class.name}-${clash.section.name} in this period.`);
    }
  }

  const [row] = await db
    .insert(t.timetableSlots)
    .values({
      schoolId: session.schoolId,
      sectionId: input.sectionId,
      periodId: input.periodId,
      dayOfWeek: input.dayOfWeek,
      subjectId: input.subjectId || null,
      teacherId: input.teacherId || null,
      room: input.room || null,
    })
    .onConflictDoUpdate({
      target: [t.timetableSlots.sectionId, t.timetableSlots.dayOfWeek, t.timetableSlots.periodId],
      set: { subjectId: input.subjectId || null, teacherId: input.teacherId || null, room: input.room || null },
    })
    .returning();

  await recordAudit({ session, action: 'timetable.updated', entity: 'TimetableSlot', entityId: row.id, after: input });
  return ok(row);
});

/** Creates the school's period grid (Period 1, break, lunch …). */
export const PUT = handler(async (req: Request) => {
  const session = await requireSchoolContext('timetable.manage');
  const input = await parseBody(req, periodSchema);
  const [row] = await db
    .insert(t.periods)
    .values({ schoolId: session.schoolId, ...input })
    .onConflictDoUpdate({
      target: [t.periods.schoolId, t.periods.order],
      set: { name: input.name, startTime: input.startTime, endTime: input.endTime, isBreak: input.isBreak },
    })
    .returning();
  await recordAudit({ session, action: 'period.saved', entity: 'Period', entityId: row.id, after: row });
  return ok(row);
});
