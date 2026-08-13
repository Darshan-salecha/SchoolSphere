import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requirePagePermission } from '@/lib/page-guards';
import { listSchools } from '@/lib/services/schools';
import { PageHeader } from '@/components/ui/page';
import { SearchInput } from '@/components/ui/search-input';
import { Table, TBody, TD, TH, THead, TR, Pagination } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const STATUSES = ['ALL', 'ACTIVE', 'PENDING', 'SUSPENDED', 'CANCELLED'];

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requirePagePermission('platform.schools.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const status = params.status && params.status !== 'ALL' ? params.status : undefined;

  const { rows, total } = await listSchools({ q: params.q, status, page, pageSize: 20 });
  const query = new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(status ? { status } : {}) }).toString();

  return (
    <>
      <PageHeader
        title="Schools"
        description="Every tenant on the platform, with usage and lifecycle controls."
        action={
          <Link href="/platform/schools/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Onboard a school
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput placeholder="Search schools…" />
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => {
            const active = (params.status ?? 'ALL') === s;
            const next = new URLSearchParams({ ...(params.q ? { q: params.q } : {}), ...(s !== 'ALL' ? { status: s } : {}) });
            return (
              <Link
                key={s}
                href={`/platform/schools?${next.toString()}`}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
              >
                {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No schools match that view"
            description="Try a different search or status filter, or onboard a new school."
            action={
              <Link href="/platform/schools/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
                <Plus className="h-4 w-4" /> Onboard a school
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>School</TH>
                <TH>School ID</TH>
                <TH>Students</TH>
                <TH>Teachers</TH>
                <TH>Plan</TH>
                <TH>Status</TH>
                <TH>Last active</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <Link href={`/platform/schools/${s.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                      {s.name}
                    </Link>
                    <p className="text-xs text-slate-500">{[s.city, s.board].filter(Boolean).join(' · ') || '—'}</p>
                  </TD>
                  <TD><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{s.code}</code></TD>
                  <TD>{s.studentCount}</TD>
                  <TD>{s.teacherCount}</TD>
                  <TD>
                    {s.subscription?.plan ? (
                      <span className="flex items-center gap-1.5">
                        <Badge tone="brand">{s.subscription.plan.name}</Badge>
                        <StatusBadge status={s.subscription.status} />
                      </span>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD><StatusBadge status={s.status} /></TD>
                  <TD className="text-slate-500">{s.lastActiveAt ? formatDate(s.lastActiveAt) : 'Never'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / 20))} total={total} baseHref={`/platform/schools?${query}`} />
        </>
      )}
    </>
  );
}
