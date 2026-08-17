import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { ArrowLeft, Phone, Mail } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { assertCanViewStudent, isClassTeacherOf } from '@/lib/scope';
import { studentProfile } from '@/lib/services/students';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { QuickForm } from '@/components/forms/quick-form';
import { StudentFiles } from '@/components/student-files';
import { listDocuments } from '@/lib/services/documents';
import { listCertificates } from '@/lib/services/certificates';
import { formatDate, percent } from '@/lib/utils';
import { ClipboardCheck, Trophy } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolPage('students.view');
  const { id } = await params;
  await assertCanViewStudent(session, id);

  const student = await studentProfile(session.schoolId, id);
  if (!student) notFound();

  const current = student.enrollments.find((e) => e.isCurrent);

  const attendance = await db
    .select({ status: t.studentAttendance.status, value: count() })
    .from(t.studentAttendance)
    .where(and(eq(t.studentAttendance.studentId, id), eq(t.studentAttendance.schoolId, session.schoolId)))
    .groupBy(t.studentAttendance.status);
  const totalDays = attendance.reduce((a, b) => a + b.value, 0);
  const presentDays = attendance
    .filter((a) => a.status === 'PRESENT' || a.status === 'LATE' || a.status === 'HALF_DAY')
    .reduce((a, b) => a + b.value, 0);

  const results = await db.query.results.findMany({
    where: and(eq(t.results.studentId, id), eq(t.results.isPublished, true)),
    with: { exam: true },
    orderBy: desc(t.results.createdAt),
    limit: 5,
  });
  const bestPct = results.length ? Math.max(...results.map((r) => r.percentage)) : 0;

  const [documents, certificates] = await Promise.all([
    listDocuments(session.schoolId, id),
    listCertificates(session.schoolId, id),
  ]);

  const canManageParents =
    session.permissions.includes('parents.manage') &&
    (session.roles.includes('SCHOOL_ADMIN') || session.roles.includes('PRINCIPAL') || (current ? await isClassTeacherOf(session, current.sectionId) : false));

  return (
    <>
      <Link href="/school/students" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> All students
      </Link>

      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`${student.admissionNumber}${current ? ` · ${current.section.class.name} — ${current.section.name}` : ''}`}
        action={<StatusBadge status={student.status} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Attendance" value={`${percent(presentDays, totalDays)}%`} sub={`${presentDays} of ${totalDays} school days`} icon={ClipboardCheck} tone={percent(presentDays, totalDays) < 75 ? 'red' : 'green'} />
        <StatCard label="Best result" value={results.length ? `${bestPct}%` : '—'} sub={results.length ? results[0].exam.name : 'No published results'} icon={Trophy} tone="amber" />
        <StatCard label="Roll number" value={current?.rollNumber ?? '—'} sub={current?.academicYear.name ?? '—'} />
        <StatCard label="Guardians" value={student.guardians.length} sub="linked to this student" tone="blue" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Student profile" />
          <CardBody>
            <div className="mb-5 flex items-center gap-4">
              <Avatar name={`${student.firstName} ${student.lastName}`} src={student.photoUrl} size="lg" />
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {student.firstName} {student.lastName}
                </p>
                <p className="text-sm text-slate-500">{current ? `${current.section.class.name} — ${current.section.name}` : 'Not enrolled'}</p>
              </div>
            </div>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {[
                ['Date of birth', formatDate(student.dateOfBirth)],
                ['Gender', student.gender ? student.gender.toLowerCase() : '—'],
                ['Blood group', student.bloodGroup ?? '—'],
                ['Admission date', formatDate(student.admissionDate)],
                ['Previous school', student.previousSchool ?? '—'],
                ['Address', [student.addressLine, student.city].filter(Boolean).join(', ') || '—'],
                ['Emergency contact', student.emergencyContactName ?? '—'],
                ['Emergency phone', student.emergencyContactPhone ?? '—'],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label as string}</dt>
                  <dd className="mt-1 text-sm capitalize text-slate-900">{value as string}</dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Guardians"
            description="Only these numbers can sign in to the parent portal"
            action={
              canManageParents ? (
                <QuickForm
                  title="Link a guardian"
                  description="Enrols this mobile number for parent portal access."
                  endpoint="/api/school/parents"
                  triggerLabel="Link"
                  variant="outline"
                  successMessage="Guardian linked"
                  fields={[
                    { name: 'studentId', label: 'Student', type: 'select', required: true, defaultValue: student.id, options: [{ value: student.id, label: `${student.firstName} ${student.lastName}` }], colSpan: 2 },
                    { name: 'name', label: 'Guardian name', required: true, colSpan: 2 },
                    { name: 'phone', label: 'Mobile number', type: 'tel', required: true, maxLength: 10, hint: 'This is the number they sign in with' },
                    { name: 'relation', label: 'Relationship', type: 'select', required: true, defaultValue: 'FATHER', options: [{ value: 'FATHER', label: 'Father' }, { value: 'MOTHER', label: 'Mother' }, { value: 'GUARDIAN', label: 'Guardian' }, { value: 'OTHER', label: 'Other' }] },
                    { name: 'email', label: 'Email', type: 'email' },
                    { name: 'access', label: 'Access level', type: 'select', required: true, defaultValue: 'FULL', options: [{ value: 'FULL', label: 'Full access' }, { value: 'LIMITED', label: 'Limited access' }] },
                    { name: 'isPrimary', label: 'Primary contact', type: 'checkbox', colSpan: 2 },
                  ]}
                />
              ) : undefined
            }
          />
          <CardBody className="space-y-4">
            {student.guardians.length === 0 && <p className="text-sm text-slate-500">No guardians linked yet.</p>}
            {student.guardians.map((g) => (
              <div key={g.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{g.parent.user.name}</p>
                    <p className="text-xs capitalize text-slate-500">
                      {g.relation.toLowerCase()} {g.isPrimary && '· primary'}
                    </p>
                  </div>
                  <Badge tone={g.access === 'FULL' ? 'green' : 'amber'}>{g.access.toLowerCase()}</Badge>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <p className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {g.parent.phone}
                  </p>
                  {g.parent.email && (
                    <p className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" /> {g.parent.email}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Published results" />
        {results.length === 0 ? (
          <CardBody><p className="text-sm text-slate-500">No results have been published for this student yet.</p></CardBody>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Exam</TH>
                <TH>Marks</TH>
                <TH>Percentage</TH>
                <TH>Grade</TH>
                <TH>Rank</TH>
                <TH className="text-right">Report card</TH>
              </TR>
            </THead>
            <TBody>
              {results.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium text-slate-900">{r.exam.name}</TD>
                  <TD>{r.totalMarks} / {r.maxMarks}</TD>
                  <TD>{r.percentage}%</TD>
                  <TD><Badge tone={r.percentage >= 60 ? 'green' : r.percentage >= 35 ? 'amber' : 'red'}>{r.grade}</Badge></TD>
                  <TD>{r.rank ?? '—'}</TD>
                  <TD className="text-right">
                    <Link
                      href={`/school/students/${student.id}/report-card/${r.examId}`}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Report card
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="mt-5">
        <StudentFiles
          studentId={student.id}
          documents={documents}
          certificates={certificates}
          canManage={session.permissions.includes('documents.manage')}
        />
      </div>

      <Card className="mt-5">
        <CardHeader title="Enrolment history" />
        <Table>
          <THead>
            <TR>
              <TH>Academic year</TH>
              <TH>Class</TH>
              <TH>Roll</TH>
              <TH>State</TH>
            </TR>
          </THead>
          <TBody>
            {student.enrollments.map((e) => (
              <TR key={e.id}>
                <TD>{e.academicYear.name}</TD>
                <TD>{e.section.class.name} — {e.section.name}</TD>
                <TD>{e.rollNumber ?? '—'}</TD>
                <TD>{e.isCurrent ? <Badge tone="green">Current</Badge> : <Badge tone="slate">Past</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
