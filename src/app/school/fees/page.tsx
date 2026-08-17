import { and, asc, desc, eq } from 'drizzle-orm';
import { Wallet, TrendingUp, AlertTriangle, Receipt } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listAcademicYears, listClasses } from '@/lib/school-data';
import { feeTotals, refreshOverdue, balanceOf } from '@/lib/services/fees';
import { PageHeader } from '@/components/ui/page';
import { StatCard, Card, CardHeader, CardBody } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { QuickForm } from '@/components/forms/quick-form';
import { formatCurrency, formatDate, percent } from '@/lib/utils';
import { CollectPayment } from './collect-payment';
import { ReminderButton } from './reminder-button';

export const dynamic = 'force-dynamic';

export default async function FeesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireSchoolPage('fees.view');
  const params = await searchParams;

  await refreshOverdue(session.schoolId);

  const [years, classes, categories, structures] = await Promise.all([
    listAcademicYears(session.schoolId),
    listClasses(session.schoolId),
    db.select().from(t.feeCategories).where(eq(t.feeCategories.schoolId, session.schoolId)).orderBy(asc(t.feeCategories.name)),
    db.query.feeStructures.findMany({
      where: eq(t.feeStructures.schoolId, session.schoolId),
      with: { items: { with: { category: true } }, academicYear: true, class: true },
    }),
  ]);
  const currentYear = years.find((y) => y.isCurrent) ?? years[0];

  const totals = await feeTotals(session.schoolId);
  const fees = await db.query.studentFees.findMany({
    where: and(
      eq(t.studentFees.schoolId, session.schoolId),
      params.status ? eq(t.studentFees.status, params.status as 'PENDING') : undefined,
    ),
    with: { student: { columns: { id: true, firstName: true, lastName: true, admissionNumber: true } } },
    orderBy: [desc(t.studentFees.status), asc(t.studentFees.dueDate)],
    limit: 200,
  });

  const canManage = session.permissions.includes('fees.manage');
  const canCollect = session.permissions.includes('fees.collect');

  return (
    <>
      <PageHeader
        title="Fees"
        description="Raise instalments, collect payments and chase what is outstanding."
        action={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <ReminderButton />
              <QuickForm
                title="Add a fee category"
                endpoint="/api/school/fees"
                triggerLabel="Category"
                variant="outline"
                successMessage="Category created"
                fields={[
                  { name: 'name', label: 'Name', required: true, placeholder: 'Tuition fee' },
                  { name: 'code', label: 'Code', required: true, placeholder: 'TUITION', maxLength: 30 },
                  { name: 'isRecurring', label: 'Charged every term', type: 'checkbox', defaultValue: true, colSpan: 2 },
                ]}
              />
              <QuickForm
                title="Raise an instalment"
                description="Creates one fee for every enrolled student in scope. Running it twice will not double-bill."
                endpoint="/api/school/fees/generate"
                triggerLabel="Raise fees"
                successMessage="Fees raised"
                disabled={!structures.length}
                disabledHint="Create a fee structure first"
                fields={[
                  { name: 'feeStructureId', label: 'Fee structure', type: 'select', required: true, options: structures.map((s) => ({ value: s.id, label: `${s.name} (${s.items.reduce((a, i) => a + i.amount, 0) / 100})` })), colSpan: 2 },
                  { name: 'academicYearId', label: 'Academic year', type: 'select', required: true, defaultValue: currentYear?.id, options: years.map((y) => ({ value: y.id, label: y.name })) },
                  { name: 'classId', label: 'Limit to class', type: 'select', options: classes.map((c) => ({ value: c.id, label: c.name })), hint: 'Leave empty for the whole school' },
                  { name: 'title', label: 'Instalment title', required: true, placeholder: 'Term 1 fee' },
                  { name: 'dueDate', label: 'Due date', type: 'date', required: true },
                ]}
              />
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Billed" value={formatCurrency(totals.billed)} sub="net of concessions" icon={Wallet} />
        <StatCard label="Collected" value={formatCurrency(totals.collected)} sub={totals.billed ? `${percent(totals.collected, totals.billed)}% of billed` : '—'} icon={TrendingUp} tone="green" />
        <StatCard label="Outstanding" value={formatCurrency(totals.outstanding)} icon={Receipt} tone="amber" />
        <StatCard label="Overdue" value={formatCurrency(totals.overdue)} icon={AlertTriangle} tone={totals.overdue ? 'red' : 'green'} />
      </div>

      {structures.length > 0 && (
        <Card className="mt-5">
          <CardHeader title="Fee structures" description="What each instalment is composed of" />
          <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {structures.map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-slate-900">{s.name}</p>
                  <Badge tone="brand">{s.frequency.toLowerCase().replace('_', ' ')}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {s.academicYear.name}
                  {s.class ? ` · ${s.class.name}` : ' · all classes'}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {s.items.map((i) => (
                    <li key={i.id} className="flex justify-between">
                      <span>{i.category.name}</span>
                      <span className="font-medium">{formatCurrency(i.amount)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-slate-100 pt-2 text-sm font-semibold text-slate-900">
                  {formatCurrency(s.items.reduce((a, i) => a + i.amount, 0))}
                </p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      <div className="mt-5 mb-4 flex flex-wrap gap-1">
        {['ALL', 'OVERDUE', 'PENDING', 'PARTIAL', 'PAID'].map((s) => (
          <a
            key={s}
            href={s === 'ALL' ? '/school/fees' : `/school/fees?status=${s}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${(params.status ?? 'ALL') === s ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </a>
        ))}
      </div>

      {fees.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No fees raised yet"
            description={canManage ? 'Create a fee structure, then raise an instalment for a class or the whole school.' : 'Nothing has been raised for this view.'}
          />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Student</TH>
              <TH>Instalment</TH>
              <TH>Payable</TH>
              <TH>Paid</TH>
              <TH>Balance</TH>
              <TH>Due</TH>
              <TH>Status</TH>
              {canCollect && <TH className="text-right">Collect</TH>}
            </TR>
          </THead>
          <TBody>
            {fees.map((f) => (
              <TR key={f.id}>
                <TD>
                  <p className="font-medium text-slate-900">
                    {f.student.firstName} {f.student.lastName}
                  </p>
                  <p className="text-xs text-slate-500">{f.student.admissionNumber}</p>
                </TD>
                <TD>{f.title}</TD>
                <TD>
                  {formatCurrency(f.amount - f.discount + f.lateFee)}
                  {f.discount > 0 && <span className="ml-1 text-xs text-emerald-600">−{formatCurrency(f.discount)}</span>}
                </TD>
                <TD>{formatCurrency(f.paidAmount)}</TD>
                <TD className={balanceOf(f) ? 'font-medium text-slate-900' : 'text-slate-400'}>{formatCurrency(balanceOf(f))}</TD>
                <TD className="whitespace-nowrap text-slate-500">{formatDate(f.dueDate)}</TD>
                <TD><StatusBadge status={f.status} /></TD>
                {canCollect && (
                  <TD className="text-right">
                    {balanceOf(f) > 0 ? (
                      <CollectPayment
                        feeId={f.id}
                        studentName={`${f.student.firstName} ${f.student.lastName}`}
                        title={f.title}
                        balance={balanceOf(f)}
                      />
                    ) : (
                      <span className="text-xs text-slate-400">Settled</span>
                    )}
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
