import { and, count, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { assertSameSchool } from '@/lib/tenant';
import { guardianUserIds, notify } from '@/lib/services/notify';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Fee money.
 *
 * Two rules govern everything here, and both exist because this is the part of
 * the product a school will be audited on:
 *
 *   1. **Nothing is ever destroyed.** A raised fee is not deleted and a payment
 *      is not edited — a correction is a new row that references the old one.
 *   2. **The balance is derived, never stored twice.** `paidAmount` on a fee is
 *      a cache of its payments; `recomputeFee` is the only thing allowed to
 *      write it, and it always recomputes from the payment rows rather than
 *      incrementing, so a retried request cannot inflate a balance.
 *
 * All amounts are integer minor units (paise). Floating point never touches money.
 */

export type FeeTotals = { billed: number; collected: number; outstanding: number; overdue: number };

/** Net payable for one fee row after discount and late fee. */
export const netPayable = (fee: { amount: number; discount: number; lateFee: number }) =>
  Math.max(0, fee.amount - fee.discount + fee.lateFee);

export const balanceOf = (fee: { amount: number; discount: number; lateFee: number; paidAmount: number }) =>
  Math.max(0, netPayable(fee) - fee.paidAmount);

function statusFor(fee: { amount: number; discount: number; lateFee: number; paidAmount: number; dueDate: string }) {
  const payable = netPayable(fee);
  if (payable === 0) return 'WAIVED' as const;
  if (fee.paidAmount >= payable) return 'PAID' as const;
  const overdue = fee.dueDate < new Date().toISOString().slice(0, 10);
  if (fee.paidAmount > 0) return overdue ? 'OVERDUE' : 'PARTIAL';
  return overdue ? 'OVERDUE' : 'PENDING';
}

/**
 * Re-derives `paidAmount` and `status` from the payment ledger.
 *
 * Called after every payment, refund or discount change. Deriving rather than
 * incrementing is what makes the whole module safe to retry: applying the same
 * payment twice is prevented by the receipt's unique index, and even if a
 * caller recomputes ten times the answer is identical.
 */
export async function recomputeFee(schoolId: string, studentFeeId: string) {
  const fee = await db.query.studentFees.findFirst({ where: eq(t.studentFees.id, studentFeeId) });
  assertSameSchool(fee ?? null, schoolId);

  const [sum] = await db
    .select({ paid: sql<number>`coalesce(sum(${t.payments.amount}), 0)::int` })
    .from(t.payments)
    .where(and(eq(t.payments.studentFeeId, studentFeeId), eq(t.payments.status, 'SUCCESS')));

  const paidAmount = Number(sum?.paid ?? 0);
  const [updated] = await db
    .update(t.studentFees)
    .set({ paidAmount, status: statusFor({ ...fee!, paidAmount }) })
    .where(eq(t.studentFees.id, studentFeeId))
    .returning();
  return updated;
}

/** Concession for a student, resolved to an absolute discount on a given amount. */
export async function discountFor(schoolId: string, studentId: string, academicYearId: string, amount: number) {
  const rows = await db
    .select()
    .from(t.feeConcessions)
    .where(
      and(
        eq(t.feeConcessions.schoolId, schoolId),
        eq(t.feeConcessions.studentId, studentId),
        eq(t.feeConcessions.academicYearId, academicYearId),
      ),
    );
  // Concessions stack, but can never exceed the fee itself.
  const total = rows.reduce((sum, c) => sum + (c.percent ? Math.round((amount * c.percent) / 100) : (c.amount ?? 0)), 0);
  return Math.min(amount, Math.max(0, total));
}

/**
 * Raises one instalment for every student in scope.
 *
 * Idempotent by design: a student who already has a fee with this title for
 * this year is skipped rather than double-billed. Running the same generation
 * twice — the single most likely operator mistake — costs nothing.
 */
export async function generateFees(input: {
  schoolId: string;
  academicYearId: string;
  feeStructureId: string;
  title: string;
  dueDate: string;
  classId?: string | null;
}) {
  const { schoolId, academicYearId, feeStructureId, title, dueDate } = input;

  const structure = await db.query.feeStructures.findFirst({
    where: eq(t.feeStructures.id, feeStructureId),
    with: { items: true },
  });
  assertSameSchool(structure ?? null, schoolId);
  if (!structure!.items.length) throw badRequest('Add at least one line item to this fee structure first.');

  const amount = structure!.items.reduce((sum, i) => sum + i.amount, 0);

  // Students currently enrolled in the year, optionally narrowed to one class.
  const rows = await db
    .select({ studentId: t.enrollments.studentId })
    .from(t.enrollments)
    .innerJoin(t.sections, eq(t.sections.id, t.enrollments.sectionId))
    .innerJoin(t.students, eq(t.students.id, t.enrollments.studentId))
    .where(
      and(
        eq(t.enrollments.schoolId, schoolId),
        eq(t.enrollments.academicYearId, academicYearId),
        eq(t.enrollments.isCurrent, true),
        eq(t.students.status, 'ACTIVE'),
        isNull(t.students.deletedAt),
        input.classId ? eq(t.sections.classId, input.classId) : undefined,
      ),
    );
  if (!rows.length) return { created: 0, skipped: 0, amount };

  const studentIds = rows.map((r) => r.studentId);
  const existing = await db
    .select({ studentId: t.studentFees.studentId })
    .from(t.studentFees)
    .where(
      and(
        eq(t.studentFees.schoolId, schoolId),
        eq(t.studentFees.academicYearId, academicYearId),
        eq(t.studentFees.title, title),
        inArray(t.studentFees.studentId, studentIds),
      ),
    );
  const already = new Set(existing.map((e) => e.studentId));
  const pending = studentIds.filter((id) => !already.has(id));
  if (!pending.length) return { created: 0, skipped: already.size, amount };

  const values: (typeof t.studentFees.$inferInsert)[] = [];
  for (const studentId of pending) {
    const discount = await discountFor(schoolId, studentId, academicYearId, amount);
    values.push({
      schoolId,
      studentId,
      academicYearId,
      feeStructureId,
      title,
      amount,
      discount,
      dueDate,
      status: amount - discount === 0 ? 'WAIVED' : 'PENDING',
    });
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < values.length; i += 400) await tx.insert(t.studentFees).values(values.slice(i, i + 400));
  });

  return { created: values.length, skipped: already.size, amount };
}

/** Sequential, human-readable receipt number scoped to the school. */
export async function nextReceiptNumber(schoolId: string) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(t.payments)
    .where(eq(t.payments.schoolId, schoolId));
  const year = new Date().getFullYear();
  return `RCP-${year}-${String(value + 1).padStart(5, '0')}`;
}

/**
 * Records money received against one fee.
 *
 * Over-payment is refused rather than silently credited: a school that wants to
 * hold an advance raises a separate advance fee, which keeps the ledger honest.
 */
export async function collectPayment(input: {
  session: SessionUser & { schoolId: string };
  studentFeeId: string;
  amount: number;
  method: string;
  provider?: string | null;
  providerRef?: string | null;
}) {
  const { session } = input;
  const fee = await db.query.studentFees.findFirst({
    where: eq(t.studentFees.id, input.studentFeeId),
    with: { student: { columns: { id: true, firstName: true, lastName: true } } },
  });
  assertSameSchool(fee ?? null, session.schoolId);
  if (!fee) throw notFound('That fee could not be found.');

  if (!Number.isInteger(input.amount) || input.amount <= 0) throw badRequest('Enter an amount greater than zero.');
  const outstanding = balanceOf(fee);
  if (outstanding === 0) throw conflict('That fee is already settled.');
  if (input.amount > outstanding) {
    throw badRequest(`That is more than the outstanding balance of ${(outstanding / 100).toFixed(2)}.`);
  }

  const receiptNumber = await nextReceiptNumber(session.schoolId);
  const [payment] = await db
    .insert(t.payments)
    .values({
      schoolId: session.schoolId,
      studentFeeId: fee.id,
      receiptNumber,
      amount: input.amount,
      method: input.method,
      provider: input.provider ?? null,
      providerRef: input.providerRef ?? null,
      status: 'SUCCESS',
      recordedById: session.id,
    })
    .returning();

  const updated = await recomputeFee(session.schoolId, fee.id);

  const guardians = await guardianUserIds(session.schoolId, [fee.studentId]);
  await notify({
    schoolId: session.schoolId,
    userIds: guardians,
    type: 'FEE',
    title: `Payment received — ${receiptNumber}`,
    body: `We have received ₹${(input.amount / 100).toLocaleString('en-IN')} towards ${fee.title} for ${fee.student.firstName}. ${
      balanceOf(updated) ? `Balance outstanding ₹${(balanceOf(updated) / 100).toLocaleString('en-IN')}.` : 'This fee is now fully paid.'
    }`,
    link: '/parent/fees',
    channels: ['IN_APP', 'SMS'],
  });

  return { payment, fee: updated };
}

/** School-wide money position. */
export async function feeTotals(schoolId: string, academicYearId?: string): Promise<FeeTotals> {
  const where = and(
    eq(t.studentFees.schoolId, schoolId),
    academicYearId ? eq(t.studentFees.academicYearId, academicYearId) : undefined,
  );
  const [row] = await db
    .select({
      billed: sql<number>`coalesce(sum(${t.studentFees.amount} - ${t.studentFees.discount} + ${t.studentFees.lateFee}), 0)::int`,
      collected: sql<number>`coalesce(sum(${t.studentFees.paidAmount}), 0)::int`,
      overdue: sql<number>`coalesce(sum(case when ${t.studentFees.status} = 'OVERDUE' then ${t.studentFees.amount} - ${t.studentFees.discount} + ${t.studentFees.lateFee} - ${t.studentFees.paidAmount} else 0 end), 0)::int`,
    })
    .from(t.studentFees)
    .where(where);

  const billed = Number(row?.billed ?? 0);
  const collected = Number(row?.collected ?? 0);
  return { billed, collected, outstanding: Math.max(0, billed - collected), overdue: Number(row?.overdue ?? 0) };
}

/** Marks fees past their due date, so reminders and dashboards agree. */
export async function refreshOverdue(schoolId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .update(t.studentFees)
    .set({ status: 'OVERDUE' })
    .where(
      and(
        eq(t.studentFees.schoolId, schoolId),
        lt(t.studentFees.dueDate, today),
        inArray(t.studentFees.status, ['PENDING', 'PARTIAL']),
      ),
    )
    .returning({ id: t.studentFees.id });
  return rows.length;
}

/**
 * Sends one reminder per fee per stage. The unique index on
 * (studentFeeId, stage) is the dedupe, so re-running a daily job is safe.
 */
export async function sendReminders(input: { schoolId: string; stage: 'BEFORE_DUE' | 'ON_DUE' | 'OVERDUE' | 'ESCALATION' }) {
  const { schoolId, stage } = input;
  const today = new Date().toISOString().slice(0, 10);

  const candidates = await db.query.studentFees.findMany({
    where: and(
      eq(t.studentFees.schoolId, schoolId),
      inArray(t.studentFees.status, stage === 'BEFORE_DUE' ? ['PENDING'] : ['PENDING', 'PARTIAL', 'OVERDUE']),
    ),
    with: { student: { columns: { id: true, firstName: true } } },
    limit: 2000,
  });

  const due = candidates.filter((f) => (stage === 'BEFORE_DUE' ? f.dueDate >= today : f.dueDate <= today));
  if (!due.length) return { sent: 0 };

  const alreadySent = await db
    .select({ studentFeeId: t.feeReminders.studentFeeId })
    .from(t.feeReminders)
    .where(
      and(
        eq(t.feeReminders.schoolId, schoolId),
        eq(t.feeReminders.stage, stage),
        inArray(t.feeReminders.studentFeeId, due.map((f) => f.id)),
      ),
    );
  const seen = new Set(alreadySent.map((r) => r.studentFeeId));
  const target = due.filter((f) => !seen.has(f.id));
  if (!target.length) return { sent: 0 };

  let sent = 0;
  for (const fee of target) {
    const outstanding = balanceOf(fee);
    if (outstanding <= 0) continue;
    const guardians = await guardianUserIds(schoolId, [fee.studentId]);
    if (!guardians.length) continue;

    await notify({
      schoolId,
      userIds: guardians,
      type: 'FEE',
      title: stage === 'OVERDUE' || stage === 'ESCALATION' ? `Fee overdue for ${fee.student.firstName}` : `Fee due for ${fee.student.firstName}`,
      body: `₹${(outstanding / 100).toLocaleString('en-IN')} towards ${fee.title} is due on ${fee.dueDate}. You can pay from the parent portal.`,
      link: '/parent/fees',
      priority: stage === 'ESCALATION' ? 'HIGH' : 'NORMAL',
      channels: stage === 'BEFORE_DUE' ? ['IN_APP'] : ['IN_APP', 'SMS'],
    });
    await db.insert(t.feeReminders).values({ schoolId, studentFeeId: fee.id, stage }).onConflictDoNothing();
    sent++;
  }
  return { sent };
}
