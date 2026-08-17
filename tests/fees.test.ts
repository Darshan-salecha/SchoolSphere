import { beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb } from './helpers/test-db';
import { sessionFor, expectForbidden } from './helpers/session';
import { seed } from '@/db/seed';
import * as t from '@/db/schema';
import type { Db } from '@/db';
import {
  balanceOf,
  collectPayment,
  discountFor,
  feeTotals,
  generateFees,
  netPayable,
  recomputeFee,
  refreshOverdue,
  sendReminders,
} from '@/lib/services/fees';

let db: Db;
let fx: Awaited<ReturnType<typeof seed>>;
let structureId: string;

beforeAll(async () => {
  ({ db } = await createTestDb());
  fx = await seed(db, { log: false });
  const structure = await db.query.feeStructures.findFirst({ where: eq(t.feeStructures.schoolId, fx.schoolId) });
  structureId = structure!.id;
});

/** Money is the part a school gets audited on, so these are the strictest tests. */

describe('money arithmetic', () => {
  it('nets discount and late fee against the amount', () => {
    expect(netPayable({ amount: 100_000, discount: 20_000, lateFee: 5_000 })).toBe(85_000);
  });

  it('never returns a negative payable or balance', () => {
    expect(netPayable({ amount: 1_000, discount: 5_000, lateFee: 0 })).toBe(0);
    expect(balanceOf({ amount: 1_000, discount: 5_000, lateFee: 0, paidAmount: 0 })).toBe(0);
  });

  it('treats an overpaid row as settled, not as credit', () => {
    expect(balanceOf({ amount: 10_000, discount: 0, lateFee: 0, paidAmount: 15_000 })).toBe(0);
  });
});

describe('concessions', () => {
  it('resolves a percentage against the amount', async () => {
    const year = await db.query.academicYears.findFirst({
      where: and(eq(t.academicYears.schoolId, fx.schoolId), eq(t.academicYears.isCurrent, true)),
    });
    const discount = await discountFor(fx.schoolId, fx.concessionStudentId, year!.id, 100_000);
    expect(discount).toBe(15_000); // seeded 15% sibling concession
  });

  it('never exceeds the fee itself', async () => {
    const year = await db.query.academicYears.findFirst({
      where: and(eq(t.academicYears.schoolId, fx.schoolId), eq(t.academicYears.isCurrent, true)),
    });
    await db.insert(t.feeConcessions).values({
      schoolId: fx.schoolId,
      studentId: fx.concessionStudentId,
      academicYearId: year!.id,
      type: 'SCHOLARSHIP',
      amount: 10_000_000,
    });
    const discount = await discountFor(fx.schoolId, fx.concessionStudentId, year!.id, 50_000);
    expect(discount).toBe(50_000);
  });

  it('does not leak a concession across tenants', async () => {
    const year2 = await db.query.academicYears.findFirst({ where: eq(t.academicYears.schoolId, fx.school2Id) });
    const discount = await discountFor(fx.school2Id, fx.concessionStudentId, year2!.id, 100_000);
    expect(discount).toBe(0);
  });
});

describe('raising fees', () => {
  it('creates one fee per enrolled student and applies concessions', async () => {
    const year = await db.query.academicYears.findFirst({
      where: and(eq(t.academicYears.schoolId, fx.schoolId), eq(t.academicYears.isCurrent, true)),
    });
    const result = await generateFees({
      schoolId: fx.schoolId,
      academicYearId: year!.id,
      feeStructureId: structureId,
      title: 'Term 2 fee',
      dueDate: '2027-01-10',
    });
    expect(result.created).toBeGreaterThan(0);

    const withConcession = await db.query.studentFees.findFirst({
      where: and(eq(t.studentFees.studentId, fx.concessionStudentId), eq(t.studentFees.title, 'Term 2 fee')),
    });
    expect(withConcession!.discount).toBeGreaterThan(0);
  });

  it('is idempotent — running the same generation twice does not double-bill', async () => {
    const year = await db.query.academicYears.findFirst({
      where: and(eq(t.academicYears.schoolId, fx.schoolId), eq(t.academicYears.isCurrent, true)),
    });
    const again = await generateFees({
      schoolId: fx.schoolId,
      academicYearId: year!.id,
      feeStructureId: structureId,
      title: 'Term 2 fee',
      dueDate: '2027-01-10',
    });
    expect(again.created).toBe(0);
    expect(again.skipped).toBeGreaterThan(0);
  });
});

describe('collecting payment', () => {
  async function freshFee() {
    const year = await db.query.academicYears.findFirst({
      where: and(eq(t.academicYears.schoolId, fx.schoolId), eq(t.academicYears.isCurrent, true)),
    });
    const [fee] = await db
      .insert(t.studentFees)
      .values({
        schoolId: fx.schoolId,
        studentId: fx.students[3].id,
        academicYearId: year!.id,
        title: `Test fee ${Math.random()}`,
        amount: 100_000,
        dueDate: '2027-03-01',
      })
      .returning();
    return fee;
  }

  it('records a receipt and recomputes the balance from the ledger', async () => {
    const session = await sessionFor(fx.adminUserId);
    const fee = await freshFee();

    const { payment, fee: updated } = await collectPayment({
      session,
      studentFeeId: fee.id,
      amount: 40_000,
      method: 'CASH',
    });

    expect(payment.receiptNumber).toMatch(/^RCP-/);
    expect(updated.paidAmount).toBe(40_000);
    expect(updated.status).toBe('PARTIAL');
    expect(balanceOf(updated)).toBe(60_000);
  });

  it('settles the fee when the balance reaches zero', async () => {
    const session = await sessionFor(fx.adminUserId);
    const fee = await freshFee();
    await collectPayment({ session, studentFeeId: fee.id, amount: 100_000, method: 'UPI' });
    const settled = await db.query.studentFees.findFirst({ where: eq(t.studentFees.id, fee.id) });
    expect(settled!.status).toBe('PAID');
  });

  it('refuses more than the outstanding balance', async () => {
    const session = await sessionFor(fx.adminUserId);
    const fee = await freshFee();
    const err = await expectForbidden(() =>
      collectPayment({ session, studentFeeId: fee.id, amount: 500_000, method: 'CASH' }),
    );
    expect(err.message).toMatch(/more than the outstanding/i);
  });

  it('refuses zero and negative amounts', async () => {
    const session = await sessionFor(fx.adminUserId);
    const fee = await freshFee();
    await expectForbidden(() => collectPayment({ session, studentFeeId: fee.id, amount: 0, method: 'CASH' }));
    await expectForbidden(() => collectPayment({ session, studentFeeId: fee.id, amount: -100, method: 'CASH' }));
  });

  it('refuses a fee belonging to another school', async () => {
    const otherAdmin = await sessionFor(fx.school2AdminUserId);
    const fee = await freshFee();
    await expectForbidden(() => collectPayment({ session: otherAdmin, studentFeeId: fee.id, amount: 1_000, method: 'CASH' }));
  });

  it('derives the balance rather than incrementing, so recompute is safe to repeat', async () => {
    const session = await sessionFor(fx.adminUserId);
    const fee = await freshFee();
    await collectPayment({ session, studentFeeId: fee.id, amount: 30_000, method: 'CASH' });

    await recomputeFee(fx.schoolId, fee.id);
    await recomputeFee(fx.schoolId, fee.id);
    const after = await db.query.studentFees.findFirst({ where: eq(t.studentFees.id, fee.id) });
    expect(after!.paidAmount).toBe(30_000);
  });

  it('notifies the guardians with a receipt number', async () => {
    const session = await sessionFor(fx.adminUserId);
    const fee = await freshFee();
    const { payment } = await collectPayment({ session, studentFeeId: fee.id, amount: 10_000, method: 'CASH' });

    const notes = await db
      .select()
      .from(t.notifications)
      .where(and(eq(t.notifications.schoolId, fx.schoolId), eq(t.notifications.type, 'FEE')));
    expect(notes.some((n) => n.title.includes(payment.receiptNumber))).toBe(true);
  });
});

describe('overdue and reminders', () => {
  it('marks past-due fees overdue', async () => {
    const year = await db.query.academicYears.findFirst({
      where: and(eq(t.academicYears.schoolId, fx.schoolId), eq(t.academicYears.isCurrent, true)),
    });
    await db.insert(t.studentFees).values({
      schoolId: fx.schoolId,
      studentId: fx.students[5].id,
      academicYearId: year!.id,
      title: 'Late fee test',
      amount: 50_000,
      dueDate: '2020-01-01',
    });
    await refreshOverdue(fx.schoolId);
    const row = await db.query.studentFees.findFirst({
      where: and(eq(t.studentFees.schoolId, fx.schoolId), eq(t.studentFees.title, 'Late fee test')),
    });
    expect(row!.status).toBe('OVERDUE');
  });

  it('reminds each family once per stage, so a repeated run sends nothing', async () => {
    const first = await sendReminders({ schoolId: fx.schoolId, stage: 'OVERDUE' });
    expect(first.sent).toBeGreaterThan(0);
    const second = await sendReminders({ schoolId: fx.schoolId, stage: 'OVERDUE' });
    expect(second.sent).toBe(0);
  });
});

describe('school totals', () => {
  it('never reports collected above billed', async () => {
    const totals = await feeTotals(fx.schoolId);
    expect(totals.collected).toBeLessThanOrEqual(totals.billed);
    expect(totals.outstanding).toBe(Math.max(0, totals.billed - totals.collected));
  });

  it('counts only its own school', async () => {
    const mine = await feeTotals(fx.schoolId);
    const other = await feeTotals(fx.school2Id);
    expect(mine.billed).toBeGreaterThan(0);
    expect(other.billed).toBe(0);
  });
});
