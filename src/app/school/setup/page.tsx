import Link from 'next/link';
import { and, count, eq, isNull } from 'drizzle-orm';
import { Check, ArrowRight, Circle } from 'lucide-react';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** Progress-driven wizard: each step is done when the underlying data exists. */
export default async function SetupPage() {
  const session = await requireSchoolPage('school.settings.manage');
  const schoolId = session.schoolId;

  const c = { value: 0 };
  const [years, classes, sections, subjects, teachers, students, parents, periods, exams, feeStructures, transportRoutes] =
    await Promise.all([
      db.select({ value: count() }).from(t.academicYears).where(eq(t.academicYears.schoolId, schoolId)),
      db.select({ value: count() }).from(t.classLevels).where(eq(t.classLevels.schoolId, schoolId)),
      db.select({ value: count() }).from(t.sections).where(eq(t.sections.schoolId, schoolId)),
      db.select({ value: count() }).from(t.subjects).where(eq(t.subjects.schoolId, schoolId)),
      db.select({ value: count() }).from(t.teachers).where(and(eq(t.teachers.schoolId, schoolId), isNull(t.teachers.deletedAt))),
      db.select({ value: count() }).from(t.students).where(and(eq(t.students.schoolId, schoolId), isNull(t.students.deletedAt))),
      db.select({ value: count() }).from(t.parents).where(eq(t.parents.schoolId, schoolId)),
      db.select({ value: count() }).from(t.periods).where(eq(t.periods.schoolId, schoolId)),
      db.select({ value: count() }).from(t.exams).where(eq(t.exams.schoolId, schoolId)),
      db.select({ value: count() }).from(t.feeStructures).where(eq(t.feeStructures.schoolId, schoolId)),
      db.select({ value: count() }).from(t.routes).where(eq(t.routes.schoolId, schoolId)),
    ]);
  const n = (rows: { value: number }[]) => (rows[0] ?? c).value;

  const STEPS = [
    { n: 1, title: 'School information', description: 'Name, branding, contact details and timezone.', href: '/school/settings', done: true },
    { n: 2, title: 'Academic year', description: 'Create the year everything else hangs off.', href: '/school/academic-years', done: n(years) > 0 },
    { n: 3, title: 'Classes', description: 'Add each grade level your school teaches.', href: '/school/classes', done: n(classes) > 0 },
    { n: 4, title: 'Sections', description: 'Divide classes into sections with a class teacher.', href: '/school/classes', done: n(sections) > 0 },
    { n: 5, title: 'Subjects', description: 'The subjects that appear on timetables and report cards.', href: '/school/subjects', done: n(subjects) > 0 },
    { n: 6, title: 'Teachers', description: 'Add teaching staff and assign them to sections.', href: '/school/teachers', done: n(teachers) > 0 },
    { n: 7, title: 'Students', description: 'Enrol students individually or import a spreadsheet.', href: '/school/students', done: n(students) > 0 },
    { n: 8, title: 'Parents', description: 'Link guardian mobile numbers so they can sign in.', href: '/school/parents', done: n(parents) > 0 },
    { n: 9, title: 'Timetable', description: 'Define periods, then fill the weekly grid.', href: '/school/timetable', done: n(periods) > 0 },
    { n: 10, title: 'Exams', description: 'Schedule your first assessment.', href: '/school/exams', done: n(exams) > 0 },
    { n: 11, title: 'Fees', description: 'Fee categories and structures per class.', href: '/school/settings', done: n(feeStructures) > 0 },
    { n: 12, title: 'Transport', description: 'Buses, drivers, routes and stops.', href: '/school/settings', done: n(transportRoutes) > 0 },
    { n: 13, title: 'Notifications', description: 'Choose what parents are told automatically.', href: '/school/settings', done: true },
  ];

  const completed = STEPS.filter((s) => s.done).length;
  const nextStep = STEPS.find((s) => !s.done);

  return (
    <>
      <PageHeader
        title="Set up your school"
        description="Work top to bottom. Each step unlocks the next part of the platform."
      />

      <Card className="mb-5">
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-900">
                {completed} of {STEPS.length} steps complete
              </p>
              <p className="text-xs text-slate-500">
                {nextStep ? `Next up: ${nextStep.title}` : 'Your school is fully configured.'}
              </p>
            </div>
            {nextStep && (
              <Link
                href={nextStep.href}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
              >
                Continue setup <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(completed / STEPS.length) * 100}%` }} />
          </div>
        </CardBody>
      </Card>

      <ol className="space-y-2">
        {STEPS.map((step) => (
          <li key={step.n}>
            <Link
              href={step.href}
              className={cn(
                'flex items-center gap-4 rounded-xl border bg-white px-4 py-3 transition-colors hover:bg-slate-50',
                step.done ? 'border-emerald-200' : 'border-slate-200',
              )}
            >
              <span
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  step.done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500',
                )}
              >
                {step.done ? <Check className="h-4 w-4" /> : step.n}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{step.title}</span>
                <span className="block truncate text-xs text-slate-500">{step.description}</span>
              </span>
              {step.done ? (
                <span className="text-xs font-medium text-emerald-600">Done</span>
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-slate-300" />
              )}
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
