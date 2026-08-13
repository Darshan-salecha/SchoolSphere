import { created, handler, ok, parseBody, parseQuery, paginated } from '@/lib/api';
import { requirePermission } from '@/lib/auth/session';
import { schoolCreateSchema } from '@/lib/validation/schemas';
import { paginationSchema } from '@/lib/validation/common';
import { createSchool, listSchools } from '@/lib/services/schools';
import { recordAudit } from '@/lib/audit';
import { z } from 'zod';

export const GET = handler(async (req: Request) => {
  await requirePermission('platform.schools.view');
  const query = parseQuery(req, paginationSchema.extend({ status: z.string().optional() }));
  const { rows, total } = await listSchools(query);
  return ok(paginated(rows, total, query.page, query.pageSize));
});

export const POST = handler(async (req: Request) => {
  const session = await requirePermission('platform.schools.manage');
  const input = await parseBody(req, schoolCreateSchema);
  const { school, admin } = await createSchool(input);
  await recordAudit({
    session,
    schoolId: school.id,
    action: 'school.created',
    entity: 'School',
    entityId: school.id,
    after: { code: school.code, name: school.name, adminEmail: admin.email },
  });
  return created({ id: school.id, code: school.code, slug: school.slug });
});
