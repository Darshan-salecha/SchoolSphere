'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Check, ExternalLink, RotateCcw, Undo2 } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge, type Tone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { formatDate } from '@/lib/utils';

type ReviewStatus = 'PENDING' | 'ACKNOWLEDGED' | 'NEEDS_REWORK';

export type Row = {
  studentId: string;
  name: string;
  rollNumber: number | null;
  photoUrl: string | null;
  status: 'PENDING' | 'SUBMITTED' | 'LATE' | 'GRADED';
  submittedAt: string | Date | null;
  note: string | null;
  link: string | null;
  reviewStatus: ReviewStatus;
  feedback: string | null;
  reviewedAt: string | Date | null;
  reviewedBy: string | null;
};

const DONE_LABEL: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Not done', tone: 'slate' },
  SUBMITTED: { label: 'Done', tone: 'green' },
  LATE: { label: 'Done · late', tone: 'amber' },
  GRADED: { label: 'Done', tone: 'green' },
};

const REVIEW_LABEL: Record<ReviewStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Awaiting review', tone: 'slate' },
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'brand' },
  NEEDS_REWORK: { label: 'Needs rework', tone: 'red' },
};

export function TrackingBoard({
  homeworkId,
  rows,
  canReview,
}: {
  homeworkId: string;
  rows: Row[];
  canReview: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const pendingDone = useMemo(
    () => rows.filter((r) => (r.status === 'SUBMITTED' || r.status === 'LATE') && r.reviewStatus === 'PENDING'),
    [rows],
  );

  async function review(entries: { studentId: string; status: ReviewStatus; feedback?: string }[], busyKey: string) {
    setBusy(busyKey);
    try {
      await api.post(`/api/school/homework/${homeworkId}/review`, { entries });
      const acknowledged = entries.filter((e) => e.status === 'ACKNOWLEDGED').length;
      const rework = entries.filter((e) => e.status === 'NEEDS_REWORK').length;
      toast.success(
        entries.length === 1
          ? entries[0].status === 'ACKNOWLEDGED'
            ? 'Acknowledged'
            : entries[0].status === 'NEEDS_REWORK'
              ? 'Sent back for rework'
              : 'Review cleared'
          : `${entries.length} students updated`,
        acknowledged || rework ? 'The student and their guardians have been notified.' : undefined,
      );
      setFeedback((prev) => {
        const next = { ...prev };
        for (const e of entries) delete next[e.studentId];
        return next;
      });
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {canReview && pendingDone.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-900">{pendingDone.length}</span> student
            {pendingDone.length === 1 ? ' has' : 's have'} marked this done and are waiting for you.
          </p>
          <Button
            size="sm"
            loading={busy === 'bulk'}
            onClick={() =>
              review(
                pendingDone.map((r) => ({ studentId: r.studentId, status: 'ACKNOWLEDGED' as const })),
                'bulk',
              )
            }
          >
            <Check className="h-4 w-4" /> Acknowledge all
          </Button>
        </div>
      )}

      <Table>
        <THead>
          <TR>
            <TH>Student</TH>
            <TH>Done</TH>
            <TH>What they sent</TH>
            <TH>Review</TH>
            {canReview && <TH className="text-right">Action</TH>}
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => {
            const done = DONE_LABEL[r.status] ?? DONE_LABEL.PENDING;
            const review_ = REVIEW_LABEL[r.reviewStatus];
            return (
              <TR key={r.studentId}>
                <TD>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} src={r.photoUrl} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{r.name}</p>
                      <p className="text-xs text-slate-500">Roll {r.rollNumber ?? '—'}</p>
                    </div>
                  </div>
                </TD>
                <TD>
                  <Badge tone={done.tone}>{done.label}</Badge>
                  {r.submittedAt && (
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDate(r.submittedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </TD>
                <TD className="max-w-[16rem]">
                  {r.note && <p className="line-clamp-2 text-xs text-slate-600">{r.note}</p>}
                  {r.link && (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      Open link <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {!r.note && !r.link && <span className="text-xs text-slate-400">—</span>}
                </TD>
                <TD>
                  <Badge tone={review_.tone}>{review_.label}</Badge>
                  {r.feedback && <p className="mt-1 line-clamp-2 text-xs text-slate-500">“{r.feedback}”</p>}
                  {r.reviewedBy && r.reviewStatus !== 'PENDING' && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      {r.reviewedBy} · {formatDate(r.reviewedAt, { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </TD>
                {canReview && (
                  <TD>
                    <div className="flex flex-col items-end gap-2">
                      <Input
                        value={feedback[r.studentId] ?? ''}
                        onChange={(e) => setFeedback((p) => ({ ...p, [r.studentId]: e.target.value }))}
                        placeholder="Feedback (optional)"
                        maxLength={500}
                        className="h-8 w-48 py-1 text-xs"
                      />
                      <div className="flex gap-2">
                        {r.reviewStatus === 'PENDING' ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              loading={busy === `${r.studentId}:rework`}
                              onClick={() =>
                                review(
                                  [
                                    {
                                      studentId: r.studentId,
                                      status: 'NEEDS_REWORK',
                                      feedback: feedback[r.studentId],
                                    },
                                  ],
                                  `${r.studentId}:rework`,
                                )
                              }
                            >
                              <RotateCcw className="h-3.5 w-3.5" /> Rework
                            </Button>
                            <Button
                              size="sm"
                              loading={busy === `${r.studentId}:ack`}
                              onClick={() =>
                                review(
                                  [
                                    {
                                      studentId: r.studentId,
                                      status: 'ACKNOWLEDGED',
                                      feedback: feedback[r.studentId],
                                    },
                                  ],
                                  `${r.studentId}:ack`,
                                )
                              }
                            >
                              <Check className="h-3.5 w-3.5" /> Acknowledge
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={busy === `${r.studentId}:undo`}
                            onClick={() => review([{ studentId: r.studentId, status: 'PENDING' }], `${r.studentId}:undo`)}
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Undo
                          </Button>
                        )}
                      </div>
                    </div>
                  </TD>
                )}
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
