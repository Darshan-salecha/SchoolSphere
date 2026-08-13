import Link from 'next/link';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { SearchInput } from '@/components/ui/search-input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

export default async function ParentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireSchoolPage('parents.view');
  const { q } = await searchParams;

  const parents = await db.query.parents.findMany({
    where: and(eq(t.parents.schoolId, session.schoolId), isNull(t.parents.deletedAt)),
    with: {
      user: { columns: { name: true, email: true, status: true } },
      children: { with: { student: { columns: { id: true, firstName: true, lastName: true } } } },
    },
    limit: 200,
  });

  const filtered = q
    ? parents.filter((p) => `${p.user.name} ${p.phone}`.toLowerCase().includes(q.toLowerCase()))
    : parents;

  return (
    <>
      <PageHeader
        title="Parents and guardians"
        description="Only numbers listed here can sign in to the parent portal. Link guardians from a student's profile."
      />
      <div className="mb-4">
        <SearchInput placeholder="Search by name or mobile…" />
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No guardians enrolled yet"
            description="Open a student and use “Link guardian” to enrol a parent's mobile number."
          />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Guardian</TH>
              <TH>Mobile</TH>
              <TH>Children</TH>
              <TH>Occupation</TH>
              <TH>Portal access</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((p) => (
              <TR key={p.id}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={p.user.name} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{p.user.name}</p>
                      <p className="truncate text-xs text-slate-500">{p.email ?? p.user.email ?? '—'}</p>
                    </div>
                  </div>
                </TD>
                <TD><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{p.phone}</code></TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {p.children.map((c) => (
                      <Link key={c.id} href={`/school/students/${c.student.id}`}>
                        <Badge tone="brand">
                          {c.student.firstName} {c.student.lastName}
                        </Badge>
                      </Link>
                    ))}
                    {p.children.length === 0 && <span className="text-xs text-slate-400">No children linked</span>}
                  </div>
                </TD>
                <TD className="text-slate-500">{p.occupation ?? '—'}</TD>
                <TD>{p.user.status === 'ACTIVE' ? <Badge tone="green">Enabled</Badge> : <Badge tone="red">Suspended</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
