import Link from 'next/link';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { Wallet, CheckCircle2 } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { balanceOf, refreshOverdue } from '@/lib/services/fees';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PayButton } from './pay-button';

export const dynamic = 'force-dynamic';

export default async function ParentFeesPage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);
  if (!selected) return <EmptyState title="No children linked" description="Please contact the school office." />;

  await refreshOverdue(session.schoolId);

  const fees = await db.query.studentFees.findMany({
    where: and(eq(t.studentFees.schoolId, session.schoolId), eq(t.studentFees.studentId, selected.id)),
    orderBy: desc(t.studentFees.dueDate),
  });

  const receipts = fees.length
    ? await db
        .select()
        .from(t.payments)
        .where(inArray(t.payments.studentFeeId, fees.map((f) => f.id)))
        .orderBy(desc(t.payments.paidAt))
    : [];

  const outstanding = fees.reduce((sum, f) => sum + balanceOf(f), 0);
  const paid = fees.reduce((sum, f) => sum + f.paidAmount, 0);

  return (
    <>
      <PageHeader title="Fees" description={`Statements and receipts for ${selected.firstName}.`} />
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
        <StatCard
          label="Outstanding"
          value={outstanding ? formatCurrency(outstanding) : 'All clear'}
          sub={outstanding ? 'across all instalments' : 'Nothing due right now'}
          icon={outstanding ? Wallet : CheckCircle2}
          tone={outstanding ? 'red' : 'green'}
        />
        <StatCard label="Paid this year" value={formatCurrency(paid)} sub={`${receipts.length} receipt${receipts.length === 1 ? '' : 's'}`} icon={CheckCircle2} tone="green" />
      </div>

      <Card className="mt-5">
        <CardHeader title="Instalments" />
        {fees.length === 0 ? (
          <CardBody><p className="text-sm text-slate-500">The school has not raised any fees yet.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Instalment</TH>
                <TH>Payable</TH>
                <TH>Paid</TH>
                <TH>Balance</TH>
                <TH>Due</TH>
                <TH>Status</TH>
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {fees.map((f) => (
                <TR key={f.id}>
                  <TD className="font-medium text-slate-900">{f.title}</TD>
                  <TD>
                    {formatCurrency(f.amount - f.discount + f.lateFee)}
                    {f.discount > 0 && <span className="ml-1 text-xs text-emerald-600">concession −{formatCurrency(f.discount)}</span>}
                  </TD>
                  <TD>{formatCurrency(f.paidAmount)}</TD>
                  <TD className={balanceOf(f) ? 'font-medium text-slate-900' : 'text-slate-400'}>{formatCurrency(balanceOf(f))}</TD>
                  <TD className="whitespace-nowrap text-slate-500">{formatDate(f.dueDate)}</TD>
                  <TD><StatusBadge status={f.status} /></TD>
                  <TD className="text-right">
                    {balanceOf(f) > 0 ? <PayButton feeId={f.id} title={f.title} balance={balanceOf(f)} /> : <span className="text-xs text-slate-400">Paid</span>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader title="Receipts" description="Every payment recorded against this child" />
        {receipts.length === 0 ? (
          <CardBody><p className="text-sm text-slate-500">No payments recorded yet.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Receipt</TH>
                <TH>Amount</TH>
                <TH>Method</TH>
                <TH>Paid on</TH>
                <TH className="text-right">Download</TH>
              </TR>
            </THead>
            <TBody>
              {receipts.map((r) => (
                <TR key={r.id}>
                  <TD><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{r.receiptNumber}</code></TD>
                  <TD className="font-medium text-slate-900">{formatCurrency(r.amount)}</TD>
                  <TD className="capitalize text-slate-600">{r.method.replace('_', ' ').toLowerCase()}</TD>
                  <TD className="text-slate-500">{formatDate(r.paidAt, { dateStyle: 'medium', timeStyle: 'short' })}</TD>
                  <TD className="text-right">
                    <Link href={`/parent/fees/receipt/${r.id}`} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      View
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
