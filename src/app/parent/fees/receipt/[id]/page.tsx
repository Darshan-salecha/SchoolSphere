import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, Printer } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { assertParentOwnsStudent } from '@/lib/scope';
import { PrintButton } from '@/components/print-button';
import { formatCurrency, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** A printable receipt. Browser print-to-PDF avoids shipping a PDF engine. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolPage('portal.parent');
  const { id } = await params;

  const payment = await db.query.payments.findFirst({
    where: and(eq(t.payments.id, id), eq(t.payments.schoolId, session.schoolId)),
    with: { studentFee: { with: { student: true, academicYear: true } } },
  });
  if (!payment) notFound();

  // The receipt is only readable by a guardian of that child.
  await assertParentOwnsStudent(session, payment.studentFee.studentId);

  const school = await db.query.schools.findFirst({ where: eq(t.schools.id, session.schoolId) });
  const student = payment.studentFee.student;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href="/parent/fees" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to fees
        </Link>
        <PrintButton label="Print or save as PDF" icon={<Printer className="h-4 w-4" />} />
      </div>

      <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 shadow-card print:border-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{school?.name}</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {[school?.addressLine, school?.city, school?.state].filter(Boolean).join(', ')}
            </p>
            {school?.phone && <p className="text-xs text-slate-500">{school.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Fee receipt</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">{payment.receiptNumber}</p>
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 py-6 text-sm">
          {[
            ['Student', `${student.firstName} ${student.lastName}`],
            ['Admission number', student.admissionNumber],
            ['Academic year', payment.studentFee.academicYear.name],
            ['Instalment', payment.studentFee.title],
            ['Payment method', payment.method.replace('_', ' ').toLowerCase()],
            ['Paid on', formatDate(payment.paidAt, { dateStyle: 'long', timeStyle: 'short' })],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="mt-0.5 capitalize text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>

        <table className="w-full border-t border-slate-200 text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr>
              <td className="py-3 text-slate-600">Fee amount</td>
              <td className="py-3 text-right text-slate-900">{formatCurrency(payment.studentFee.amount)}</td>
            </tr>
            {payment.studentFee.discount > 0 && (
              <tr>
                <td className="py-3 text-slate-600">Concession</td>
                <td className="py-3 text-right text-emerald-700">−{formatCurrency(payment.studentFee.discount)}</td>
              </tr>
            )}
            <tr>
              <td className="py-3 font-medium text-slate-900">Amount received</td>
              <td className="py-3 text-right text-lg font-semibold text-slate-900">{formatCurrency(payment.amount)}</td>
            </tr>
            <tr>
              <td className="py-3 text-slate-600">Balance after this payment</td>
              <td className="py-3 text-right text-slate-900">
                {formatCurrency(
                  Math.max(
                    0,
                    payment.studentFee.amount - payment.studentFee.discount + payment.studentFee.lateFee - payment.studentFee.paidAmount,
                  ),
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <footer className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
          <p>This is a computer-generated receipt and does not require a signature.</p>
          {payment.providerRef && <p className="mt-1">Reference: {payment.providerRef}</p>}
        </footer>
      </div>
    </>
  );
}
