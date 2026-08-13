import { Table, TBody, TD, TH, THead, TR, Pagination } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { ScrollText } from 'lucide-react';

export type AuditRow = {
  id: string;
  createdAt: Date;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
  school?: { name: string } | null;
};

export function AuditTable({
  rows,
  page,
  total,
  pageSize,
  baseHref,
  showSchool,
}: {
  rows: AuditRow[];
  page: number;
  total: number;
  pageSize: number;
  baseHref: string;
  showSchool?: boolean;
}) {
  if (!rows.length) {
    return (
      <div className="card">
        <EmptyState icon={ScrollText} title="No activity recorded yet" description="Sensitive actions will appear here as they happen." />
      </div>
    );
  }
  return (
    <>
      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            {showSchool && <TH>School</TH>}
            <TH>Actor</TH>
            <TH>Action</TH>
            <TH>Entity</TH>
            <TH>IP</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((a) => (
            <TR key={a.id}>
              <TD className="whitespace-nowrap text-slate-500">{formatDate(a.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</TD>
              {showSchool && <TD>{a.school?.name ?? '—'}</TD>}
              <TD className="font-medium text-slate-900">{a.actorName ?? 'system'}</TD>
              <TD><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{a.action}</code></TD>
              <TD className="text-slate-500">
                {a.entity}
                {a.entityId ? <span className="ml-1 text-xs text-slate-400">#{a.entityId.slice(0, 8)}</span> : null}
              </TD>
              <TD className="text-slate-400">{a.ip ?? '—'}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / pageSize))} total={total} baseHref={baseHref} />
    </>
  );
}
