import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { feeStructureSchema } from '@/lib/validation/schemas';
import { assertSameSchool } from '@/lib/tenant';
import { recordAudit } from '@/lib/audit';

/** A structure and its line items are created together or not at all. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('fees.manage');
  const input = await parseBody(req, feeStructureSchema);

  assertSameSchool(
    await db.query.academicYears.findFirst({ where: eq(t.academicYears.id, input.academicYearId) }),
    session.schoolId,
  );
  if (input.classId) {
    assertSameSchool(await db.query.classLevels.findFirst({ where: eq(t.classLevels.id, input.classId) }), session.schoolId);
  }
  for (const item of input.items) {
    assertSameSchool(await db.query.feeCategories.findFirst({ where: eq(t.feeCategories.id, item.categoryId) }), session.schoolId);
  }

  const row = await db.transaction(async (tx) => {
    const [structure] = await tx
      .insert(t.feeStructures)
      .values({
        schoolId: session.schoolId,
        academicYearId: input.academicYearId,
        classId: input.classId || null,
        name: input.name,
        frequency: input.frequency,
      })
      .returning();

    await tx.insert(t.feeStructureItems).values(
      input.items.map((i) => ({
        feeStructureId: structure.id,
        categoryId: i.categoryId,
        // Rupees on the wire, paise in the ledger.
        amount: Math.round(i.amount * 100),
        dueDate: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : null,
      })),
    );
    return structure;
  });

  await recordAudit({ session, action: 'fee_structure.created', entity: 'FeeStructure', entityId: row.id, after: { name: row.name, items: input.items.length } });
  return created(row);
});
