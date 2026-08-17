import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, count, eq } from 'drizzle-orm';
import { ArrowLeft, Printer } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { assertCanViewStudent } from '@/lib/scope';
import { PrintButton } from '@/components/print-button';
import { formatDate, percent } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * The report card.
 *
 * Rendered as a print-styled page rather than a generated PDF: the browser's
 * own print-to-PDF produces a better document than a bundled renderer, works
 * on every device, and keeps a heavy dependency out of the image.
 */
export default async function ReportCardPage({ params }: { params: Promise<{ id: string; examId: string }> }) {
  const session = await requireSchoolPage('results.view', 'portal.parent');
  const { id, examId } = await params;
  await assertCanViewStudent(session, id);

  const result = await db.query.results.findFirst({
    where: and(eq(t.results.studentId, id), eq(t.results.examId, examId), eq(t.results.schoolId, session.schoolId)),
    with: {
      exam: { with: { academicYear: true } },
      student: true,
      section: { with: { class: true } },
    },
  });
  if (!result) notFound();

  // A parent may only ever see a published report card.
  if (!result.isPublished && session.parentId) notFound();

  const marks = await db.query.marks.findMany({
    where: and(eq(t.marks.studentId, id), eq(t.marks.examId, examId)),
    with: { examSubject: { with: { subject: true } } },
  });

  const school = await db.query.schools.findFirst({ where: eq(t.schools.id, session.schoolId) });

  const attendance = await db
    .select({ status: t.studentAttendance.status, value: count() })
    .from(t.studentAttendance)
    .where(eq(t.studentAttendance.studentId, id))
    .groupBy(t.studentAttendance.status);
  const totalDays = attendance.reduce((a, b) => a + b.value, 0);
  const presentDays = attendance
    .filter((a) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(a.status))
    .reduce((a, b) => a + b.value, 0);

  const backHref = session.parentId ? '/parent/results' : `/school/students/${id}`;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <PrintButton label="Print or save as PDF" icon={<Printer className="h-4 w-4" />} />
      </div>

      <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-card print:border-0 print:shadow-none">
        <header className="border-b-2 border-slate-900 pb-4 text-center">
          <h1 className="text-xl font-bold uppercase tracking-wide text-slate-900">{school?.name}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {[school?.addressLine, school?.city, school?.state].filter(Boolean).join(', ')}
          </p>
          {school?.board && <p className="text-xs text-slate-500">Affiliated to {school.board}</p>}
          <h2 className="mt-4 text-sm font-semibold uppercase tracking-widest text-slate-700">
            Report Card — {result.exam.name}
          </h2>
          <p className="text-xs text-slate-500">Academic year {result.exam.academicYear.name}</p>
        </header>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 border-b border-slate-200 py-5 text-sm sm:grid-cols-3">
          {[
            ['Student', `${result.student.firstName} ${result.student.lastName}`],
            ['Admission no.', result.student.admissionNumber],
            ['Class', `${result.section.class.name} — ${result.section.name}`],
            ['Date of birth', formatDate(result.student.dateOfBirth)],
            ['Attendance', totalDays ? `${percent(presentDays, totalDays)}% (${presentDays}/${totalDays})` : '—'],
            ['Class rank', result.rank ?? '—'],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label as string}</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{value as string}</dd>
            </div>
          ))}
        </dl>

        <table className="mt-5 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-wide text-slate-600">
              <th className="pb-2 font-semibold">Subject</th>
              <th className="pb-2 text-right font-semibold">Marks</th>
              <th className="pb-2 text-right font-semibold">Max</th>
              <th className="pb-2 text-right font-semibold">Grade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {marks.map((m) => (
              <tr key={m.id}>
                <td className="py-2 text-slate-900">{m.examSubject.subject.name}</td>
                <td className="py-2 text-right text-slate-900">{m.isAbsent ? 'AB' : m.marksObtained}</td>
                <td className="py-2 text-right text-slate-500">{m.examSubject.maxMarks}</td>
                <td className="py-2 text-right font-medium text-slate-900">{m.grade ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
              <td className="pt-2">Total</td>
              <td className="pt-2 text-right">{result.totalMarks}</td>
              <td className="pt-2 text-right">{result.maxMarks}</td>
              <td className="pt-2 text-right">{result.grade}</td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-5 grid grid-cols-3 gap-4 rounded-lg bg-slate-50 p-4 text-center print:bg-transparent print:ring-1 print:ring-slate-200">
          {[
            ['Percentage', `${result.percentage}%`],
            ['Grade', result.grade ?? '—'],
            ['Result', result.percentage >= 35 ? 'Pass' : 'Needs improvement'],
          ].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{label as string}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{value as string}</p>
            </div>
          ))}
        </div>

        {(result.teacherRemark || result.principalRemark) && (
          <div className="mt-5 space-y-3 text-sm">
            {result.teacherRemark && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Class teacher&apos;s remark</p>
                <p className="mt-0.5 text-slate-800">{result.teacherRemark}</p>
              </div>
            )}
            {result.principalRemark && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-500">Principal&apos;s remark</p>
                <p className="mt-0.5 text-slate-800">{result.principalRemark}</p>
              </div>
            )}
          </div>
        )}

        <footer className="mt-12 grid grid-cols-3 gap-6 text-center text-xs text-slate-500">
          {['Class teacher', 'Principal', 'Parent / Guardian'].map((role) => (
            <div key={role}>
              <div className="mb-1 border-t border-slate-400" />
              {role}
            </div>
          ))}
        </footer>

        <p className="mt-6 text-center text-[10px] text-slate-400">
          Published {formatDate(result.publishedAt)} · {school?.code}
        </p>
      </article>
    </>
  );
}
