import { desc } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requirePagePermission } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { LifeBuoy } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SupportPage() {
  await requirePagePermission('platform.support.manage');
  const tickets = await db.query.supportTickets.findMany({ orderBy: desc(t.supportTickets.createdAt), limit: 50 });
  const schools = await db.select({ id: t.schools.id, name: t.schools.name }).from(t.schools);
  const schoolMap = new Map(schools.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader title="Support" description="Tickets raised by school administrators." />
      {tickets.length === 0 ? (
        <div className="card">
          <EmptyState icon={LifeBuoy} title="No open tickets" description="Requests from schools will appear here." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Subject</TH>
              <TH>School</TH>
              <TH>Category</TH>
              <TH>Priority</TH>
              <TH>Status</TH>
              <TH>Raised</TH>
            </TR>
          </THead>
          <TBody>
            {tickets.map((ticket) => (
              <TR key={ticket.id}>
                <TD>
                  <p className="font-medium text-slate-900">{ticket.subject}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{ticket.body}</p>
                </TD>
                <TD>{schoolMap.get(ticket.schoolId) ?? '—'}</TD>
                <TD><Badge tone="slate">{ticket.category.toLowerCase()}</Badge></TD>
                <TD><Badge tone={ticket.priority === 'HIGH' ? 'red' : 'slate'}>{ticket.priority.toLowerCase()}</Badge></TD>
                <TD><StatusBadge status={ticket.status.replace(' ', '_')} /></TD>
                <TD className="text-slate-500">{formatDate(ticket.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
