import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireSchoolPage } from '@/lib/page-guards';
import { assertCanAccessSection } from '@/lib/scope';
import { homeworkForSchool, trackingBoard, summarise } from '@/lib/services/homework';
import { PageHeader } from '@/components/ui/page';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { TrackingBoard } from './tracking-board';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function HomeworkTrackingPage({ params }: Props) {
  const session = await requireSchoolPage('homework.view');
  const { id } = await params;

  const hw = await homeworkForSchool(session.schoolId, id).catch(() => null);
  if (!hw) notFound();
  await assertCanAccessSection(session, hw.sectionId);

  const rows = await trackingBoard(session.schoolId, hw.id, hw.sectionId);
  const stats = summarise(rows);
  const overdue = hw.dueDate < new Date().toISOString().slice(0, 10);
  const canReview = session.permissions.includes('homework.manage');

  return (
    <>
      <Link
        href="/school/homework"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" /> All homework
      </Link>

      <PageHeader
        title={hw.title}
        description={`${hw.section.class.name}-${hw.section.name} · ${hw.subject.name} · set by ${hw.teacher.user.name}`}
        action={
          <Badge tone={overdue ? 'slate' : 'blue'}>
            {overdue ? 'was due' : 'due'} {formatDate(hw.dueDate, { day: 'numeric', month: 'short' })}
          </Badge>
        }
      />

      <div className="card mb-5 p-5">
        <p className="text-sm text-slate-600">{hw.description}</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Done"
          value={`${stats.done}/${stats.total}`}
          sub={stats.late ? `${stats.late} marked late` : 'On the class roster'}
          tone="green"
        />
        <StatCard label="Acknowledged" value={stats.acknowledged} sub="Reviewed by a teacher" tone="brand" />
        <StatCard label="Awaiting review" value={stats.awaitingReview} sub="Done, not yet acknowledged" tone="amber" />
        <StatCard label="Needs rework" value={stats.rework} sub="Sent back to the student" tone="red" />
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No students in this class yet"
            description="Enrol students in this section and they will appear here."
          />
        </div>
      ) : (
        <TrackingBoard homeworkId={hw.id} rows={rows} canReview={canReview} />
      )}
    </>
  );
}
