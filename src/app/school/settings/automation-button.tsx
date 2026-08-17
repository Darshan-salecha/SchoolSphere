'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

type RuleResult = { rule: string; matched: number; notified: number };

const LABELS: Record<string, string> = {
  'attendance.low': 'Attendance below the school threshold',
  'exam.upcoming': 'Exams starting within three days',
  'fee.overdue': 'Overdue fees',
  'trip.stale': 'Bus trips that stopped reporting',
};

export function AutomationButton() {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RuleResult[] | null>(null);

  async function run() {
    setLoading(true);
    try {
      const res = await api.post<{ results: RuleResult[] }>('/api/school/automation', {});
      setResults(res.results);
      const total = res.results.reduce((a, r) => a + r.notified, 0);
      toast.success(total ? `${total} notification${total === 1 ? '' : 's'} sent` : 'Nothing needed attention');
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Could not run the rules.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" /> Run smart rules
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Smart notification rules"
        description="Safe to run as often as you like — each family is told once per rule."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
            <Button onClick={run} loading={loading}>Run now</Button>
          </>
        }
      >
        <div className="space-y-3">
          <ul className="space-y-1.5 text-sm text-slate-600">
            {Object.values(LABELS).map((l) => (
              <li key={l} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" /> {l}
              </li>
            ))}
          </ul>
          {results && (
            <div className="rounded-lg border border-slate-200">
              {results.map((r) => (
                <div key={r.rule} className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0">
                  <span className="text-slate-700">{LABELS[r.rule] ?? r.rule}</span>
                  <span className="text-xs text-slate-500">
                    {r.matched} matched · {r.notified} notified
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Point a scheduler at <code className="rounded bg-slate-100 px-1">POST /api/school/automation</code> to run
            these automatically each morning.
          </p>
        </div>
      </Modal>
    </>
  );
}
