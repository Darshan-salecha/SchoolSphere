import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { leaveDecisionSchema, leaveRequestSchema } from '@/lib/validation/schemas';
import { assertCanViewStudent, isClassTeacherOf } from '@/lib/scope';
import { assertSameSchool } from '@/lib/tenant';
import { notify } from '@/lib/services/notify';
import { recordAudit } from '@/lib/audit';
import { badRequest, forbidden } from '@/lib/errors';

/** Parents raise leave for their own child; staff raise leave for themselves. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('leave.request');
  const input = await parseBody(req, leaveRequestSchema);

  if (session.parentId) {
    if (!input.studentId) throw badRequest('Select which child this leave is for.');
    await assertCanViewStudent(session, input.studentId);
  }

  const [row] = await db
    .insert(t.leaveRequests)
    .values({
      schoolId: session.schoolId,
      requestType: session.parentId ? 'STUDENT' : 'STAFF',
      studentId: session.parentId ? input.studentId! : null,
      parentId: session.parentId,
      requestedById: session.id,
      fromDate: input.fromDate.toISOString().slice(0, 10),
      toDate: input.toDate.toISOString().slice(0, 10),
      reason: input.reason,
    })
    .returning();

  await recordAudit({ session, action: 'leave.requested', entity: 'LeaveRequest', entityId: row.id, after: { from: row.fromDate, to: row.toDate } });
  return created(row);
});

export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext('leave.approve');
  const input = await parseBody(req, leaveDecisionSchema.extend({ id: z.string() }));

  const request = assertSameSchool(
    await db.query.leaveRequests.findFirst({ where: eq(t.leaveRequests.id, input.id), with: { student: true } }),
    session.schoolId,
  );

  // A class teacher may only decide leave for their own class.
  if (request.studentId && session.teacherId) {
    const enrollment = await db.query.enrollments.findFirst({
      where: and(eq(t.enrollments.studentId, request.studentId), eq(t.enrollments.isCurrent, true)),
    });
    if (!enrollment || !(await isClassTeacherOf(session, enrollment.sectionId))) {
      throw forbidden('Only the class teacher or a school admin can decide this request.');
    }
  }

  const [after] = await db
    .update(t.leaveRequests)
    .set({ status: input.status, decidedById: session.id, decidedAt: new Date(), decisionNote: input.decisionNote || null })
    .where(and(eq(t.leaveRequests.id, input.id), eq(t.leaveRequests.schoolId, session.schoolId)))
    .returning();

  if (request.requestedById) {
    await notify({
      schoolId: session.schoolId,
      userIds: [request.requestedById],
      type: 'LEAVE',
      title: `Leave request ${input.status.toLowerCase()}`,
      body: input.decisionNote || `Your leave request from ${request.fromDate} to ${request.toDate} was ${input.status.toLowerCase()}.`,
      link: session.parentId ? '/parent/leave' : '/school/leave',
    });
  }

  await recordAudit({ session, action: `leave.${input.status.toLowerCase()}`, entity: 'LeaveRequest', entityId: input.id, before: { status: request.status }, after: { status: after.status } });
  return ok(after);
});
