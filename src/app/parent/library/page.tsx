import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { listLoans, FINE_PER_DAY } from '@/lib/services/library';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { formatCurrency, formatDate } from '@/lib/utils';
import { BookMarked, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ParentLibraryPage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);
  if (!selected) return <EmptyState title="No children linked" description="Please contact the school office." />;

  const loans = await listLoans(session.schoolId, { studentId: selected.id });
  const open = loans.filter((l) => l.status === 'ISSUED' || l.status === 'OVERDUE');
  const owed = loans.reduce((sum, l) => sum + l.currentFine, 0);

  return (
    <>
      <PageHeader title="Library" description={`Books ${selected.firstName} has borrowed.`} />
      <ChildSwitcher
        selectedId={selected.id}
        children={children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          photoUrl: c.photoUrl,
          label: currentSection(c) ? `${currentSection(c)!.section.class.name}-${currentSection(c)!.section.name}` : 'Not enrolled',
        }))}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Books out" value={open.length} sub={`${formatCurrency(FINE_PER_DAY)} per day if late`} icon={BookMarked} tone={open.some((l) => l.status === 'OVERDUE') ? 'amber' : 'blue'} />
        <StatCard label="Fines" value={owed ? formatCurrency(owed) : 'None'} icon={AlertTriangle} tone={owed ? 'red' : 'green'} />
      </div>

      <Card className="mt-5">
        <CardHeader title="Borrowing history" />
        {loans.length === 0 ? (
          <CardBody><p className="text-sm text-slate-500">{selected.firstName} has not borrowed anything yet.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Book</TH>
                <TH>Issued</TH>
                <TH>Due</TH>
                <TH>Returned</TH>
                <TH>Fine</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {loans.map((l) => (
                <TR key={l.id}>
                  <TD className="font-medium text-slate-900">
                    {l.book.title}
                    {l.book.author && <p className="text-xs text-slate-500">{l.book.author}</p>}
                  </TD>
                  <TD className="text-slate-500">{formatDate(l.issuedAt)}</TD>
                  <TD className={l.status === 'OVERDUE' ? 'font-medium text-rose-600' : ''}>{formatDate(l.dueDate)}</TD>
                  <TD className="text-slate-500">{l.returnedAt ? formatDate(l.returnedAt) : '—'}</TD>
                  <TD>{l.currentFine ? formatCurrency(l.currentFine) : '—'}</TD>
                  <TD><StatusBadge status={l.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
