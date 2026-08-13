import { count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { AuditTable } from '@/components/audit-table';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 30;

export default async function SchoolAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSchoolPage('school.audit.view');
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);

  const [{ value: total }] = await db
    .select({ value: count() })
    .from(t.auditLogs)
    .where(eq(t.auditLogs.schoolId, session.schoolId));

  const rows = await db.query.auditLogs.findMany({
    where: eq(t.auditLogs.schoolId, session.schoolId),
    orderBy: desc(t.auditLogs.createdAt),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Marks changes, fee edits, permission changes and every other sensitive action. Read-only."
      />
      <AuditTable rows={rows} page={page} total={total} pageSize={PAGE_SIZE} baseHref="/school/audit" />
    </>
  );
}
