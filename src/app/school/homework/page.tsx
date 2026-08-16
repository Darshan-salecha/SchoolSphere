import Link from 'next/link';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { listSections, listSubjects } from '@/lib/school-data';
import { accessibleSectionIds } from '@/lib/scope';
import { trackingCounts } from '@/lib/services/homework';
import { PageHeader } from '@/components/ui/page';
import { QuickForm } from '@/components/forms/quick-form';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function HomeworkPage() {
  const session = await requireSchoolPage('homework.view');
  const all = await listSections(session.schoolId);
  const allowed = await accessibleSectionIds(session);
  const sections = allowed === null ? all : all.filter((s) => allowed.includes(s.id));
  const subjects = await listSubjects(session.schoolId);

  const rows = sections.length
    ? await db.query.homework.findMany({
        where: and(
          eq(t.homework.schoolId, session.schoolId),
          inArray(t.homework.sectionId, sections.map((s) => s.id)),
        ),
        with: { section: { with: { class: true } }, subject: true, teacher: { with: { user: { columns: { name: true } } } } },
        orderBy: desc(t.homework.dueDate),
        limit: 100,
      })
    : [];

  const today = new Date().toISOString().slice(0, 10);
  const counts = await trackingCounts(session.schoolId, rows.map((r) => r.id));
  const rosterSize = new Map(sections.map((s) => [s.id, s.studentCount]));

  return (
    <>
      <PageHeader
        title="Homework"
        description="Guardians are notified as soon as homework is posted. Open an item to track who has done it."
        action={
          session.permissions.includes('homework.manage') ? (
            <QuickForm
              title="Set homework"
              endpoint="/api/school/homework"
              triggerLabel="Set homework"
              successMessage="Homework posted"
              size="lg"
              disabled={!sections.length || !subjects.length}
              disabledHint="You need a section and a subject first"
              fields={[
                { name: 'sectionId', label: 'Class', type: 'select', required: true, options: sections.map((s) => ({ value: s.id, label: s.label })) },
                { name: 'subjectId', label: 'Subject', type: 'select', required: true, options: subjects.map((s) => ({ value: s.id, label: s.name })) },
                { name: 'title', label: 'Title', required: true, placeholder: 'Chapter 4 worksheet', colSpan: 2 },
                { name: 'description', label: 'Instructions', type: 'textarea', required: true },
                { name: 'dueDate', label: 'Due date', type: 'date', required: true },
                { name: 'allowSubmission', label: 'Allow online submission', type: 'checkbox' },
              ]}
            />
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState title="No homework yet" description="Homework you set appears here and in the parent portal straight away." />
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Title</TH>
              <TH>Class</TH>
              <TH>Subject</TH>
              <TH>Set by</TH>
              <TH>Due</TH>
              <TH>Done</TH>
              <TH>Review</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((h) => {
              const c = counts.get(h.id) ?? { done: 0, acknowledged: 0, rework: 0 };
              const total = rosterSize.get(h.sectionId) ?? 0;
              const awaiting = Math.max(0, c.done - c.acknowledged - c.rework);
              return (
                <TR key={h.id}>
                  <TD>
                    <Link href={`/school/homework/${h.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {h.title}
                    </Link>
                    <p className="line-clamp-1 text-xs text-slate-500">{h.description}</p>
                  </TD>
                  <TD>{h.section.class.name}-{h.section.name}</TD>
                  <TD><Badge tone="slate">{h.subject.name}</Badge></TD>
                  <TD className="text-slate-500">{h.teacher.user.name}</TD>
                  <TD>
                    <span className={h.dueDate < today ? 'text-slate-400' : 'font-medium text-slate-900'}>{formatDate(h.dueDate)}</span>
                  </TD>
                  <TD>
                    <span className="font-medium text-slate-900">{c.done}</span>
                    <span className="text-slate-400">/{total}</span>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {c.acknowledged > 0 && <Badge tone="brand">{c.acknowledged} acknowledged</Badge>}
                      {c.rework > 0 && <Badge tone="red">{c.rework} rework</Badge>}
                      {awaiting > 0 && <Badge tone="amber">{awaiting} to review</Badge>}
                      {c.done === 0 && c.acknowledged === 0 && c.rework === 0 && (
                        <span className="text-xs text-slate-400">Nothing yet</span>
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </>
  );
}
