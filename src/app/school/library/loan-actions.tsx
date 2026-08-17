'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { formatCurrency } from '@/lib/utils';

export function LoanActions({ loanId, title, fine }: { loanId: string; title: string; fine: number }) {
  const router = useRouter();
  const toast = useToast();
  const [confirm, setConfirm] = useState<'return' | 'lost' | null>(null);
  const [loading, setLoading] = useState(false);

  async function act(lost: boolean) {
    setLoading(true);
    try {
      await api.patch('/api/school/library', { loanId, lost });
      toast.success(lost ? 'Recorded as lost' : 'Book returned', fine ? `Fine of ${formatCurrency(fine)} recorded.` : undefined);
      setConfirm(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'That did not work.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setConfirm('return')}>
          <Undo2 className="h-3.5 w-3.5" /> Return
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm('lost')}>
          Lost
        </Button>
      </div>
      <ConfirmDialog
        open={confirm === 'return'}
        onClose={() => setConfirm(null)}
        onConfirm={() => act(false)}
        loading={loading}
        title="Take this book back?"
        confirmLabel="Return book"
        message={fine ? `${title} is late — a fine of ${formatCurrency(fine)} will be recorded and the guardians told.` : `${title} will be returned to the shelf.`}
      />
      <ConfirmDialog
        open={confirm === 'lost'}
        onClose={() => setConfirm(null)}
        onConfirm={() => act(true)}
        loading={loading}
        danger
        title="Mark this book as lost?"
        confirmLabel="Record as lost"
        message={`${title} will be written off and the copy taken out of circulation. This is recorded in the audit log.`}
      />
    </>
  );
}
