'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Calculator, Send, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

export function ResultActions({ examId, status, resultCount }: { examId: string; status: string; resultCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'unpublish' | null>(null);
  const published = status === 'RESULTS_PUBLISHED';

  async function run(action: 'compute' | 'publish' | 'unpublish') {
    setLoading(action);
    try {
      if (action === 'unpublish') {
        await api.del(`/api/school/results?examId=${examId}`);
        toast.success('Results unpublished', 'Teachers can edit marks again.');
      } else {
        const res = await api.post<{ computed: number }>('/api/school/results', { examId, publish: action === 'publish' });
        toast.success(
          action === 'publish' ? 'Results published' : 'Results computed',
          action === 'publish'
            ? `${res.computed} report cards are now visible to guardians.`
            : `${res.computed} results calculated. Review them before publishing.`,
        );
      }
      setConfirm(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {!published && (
        <>
          <Button variant="outline" size="sm" loading={loading === 'compute'} onClick={() => run('compute')}>
            <Calculator className="h-4 w-4" /> Compute results
          </Button>
          <Button size="sm" loading={loading === 'publish'} onClick={() => setConfirm('publish')}>
            <Send className="h-4 w-4" /> Publish
          </Button>
        </>
      )}
      {published && (
        <Button variant="outline" size="sm" loading={loading === 'unpublish'} onClick={() => setConfirm('unpublish')}>
          <Undo2 className="h-4 w-4" /> Unpublish
        </Button>
      )}

      <ConfirmDialog
        open={confirm === 'publish'}
        onClose={() => setConfirm(null)}
        onConfirm={() => run('publish')}
        loading={loading === 'publish'}
        title="Publish these results?"
        confirmLabel="Publish results"
        message={`Report cards become visible in the parent portal and every guardian is notified. ${resultCount ? `${resultCount} results are ready.` : 'Results will be computed from the marks entered.'}`}
      />
      <ConfirmDialog
        open={confirm === 'unpublish'}
        onClose={() => setConfirm(null)}
        onConfirm={() => run('unpublish')}
        loading={loading === 'unpublish'}
        danger
        title="Unpublish these results?"
        confirmLabel="Unpublish"
        message="Guardians will no longer see these report cards, and teachers will be able to edit marks again. This action is recorded in the audit log."
      />
    </>
  );
}
