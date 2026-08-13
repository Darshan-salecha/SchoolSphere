import { eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { staffSchema } from '@/lib/validation/schemas';
import { hashPassword } from '@/lib/auth/password';
import { conflict } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('staff.manage');
  const input = await parseBody(req, staffSchema);
  const email = input.email.toLowerCase();
  if (await db.query.users.findFirst({ where: eq(t.users.email, email) })) {
    throw conflict('That email address is already registered.');
  }

  const passwordHash = await hashPassword(input.password ?? 'Password123!');
  const row = await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(t.users)
      .values({ schoolId: session.schoolId, name: input.name, email, phone: input.phone, passwordHash })
      .returning();
    await tx.insert(t.userRoles).values({ userId: user.id, role: 'STAFF' });
    const [staffRow] = await tx
      .insert(t.staff)
      .values({
        schoolId: session.schoolId,
        userId: user.id,
        employeeId: input.employeeId,
        designation: input.designation,
        department: input.department || null,
      })
      .returning();
    return staffRow;
  });

  await recordAudit({ session, action: 'staff.created', entity: 'Staff', entityId: row.id, after: { name: input.name, designation: input.designation } });
  return created(row);
});
