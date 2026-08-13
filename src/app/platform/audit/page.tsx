import { count, desc } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requirePagePermission } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { AuditTable } from '@/components/audit-table';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 30;

export default async function PlatformAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requirePagePermission('platform.audit.view');
  const page = Math.max(1, Number((await searchParams).page ?? 1) || 1);

  const [{ value: total }] = await db.select({ value: count() }).from(t.auditLogs);
  const rows = await db.query.auditLogs.findMany({
    with: { school: { columns: { name: true } } },
    orderBy: desc(t.auditLogs.createdAt),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <>
      <PageHeader title="Audit logs" description="Every sensitive action across the platform. Read-only by design." />
      <AuditTable rows={rows} page={page} total={total} pageSize={PAGE_SIZE} baseHref="/platform/audit" showSchool />
    </>
  );
}
