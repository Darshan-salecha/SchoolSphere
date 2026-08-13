'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

export function SchoolActions({ schoolId, status }: { schoolId: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<'SUSPENDED' | 'ACTIVE' | null>(null);
  const [loading, setLoading] = useState(false);

  async function apply(next: 'SUSPENDED' | 'ACTIVE') {
    setLoading(true);
    try {
      await api.post(`/api/platform/schools/${schoolId}/status`, { status: next });
      toast.success(
        next === 'SUSPENDED' ? 'School suspended' : 'School reactivated',
        next === 'SUSPENDED' ? 'All of its users have been signed out.' : 'Its users can sign in again.',
      );
      setPending(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <StatusBadge status={status} />
      {status === 'ACTIVE' ? (
        <Button variant="danger" size="sm" onClick={() => setPending('SUSPENDED')}>
          <Ban className="h-4 w-4" /> Suspend
        </Button>
      ) : (
        <Button size="sm" onClick={() => setPending('ACTIVE')}>
          <CheckCircle2 className="h-4 w-4" /> Activate
        </Button>
      )}

      <ConfirmDialog
        open={pending === 'SUSPENDED'}
        onClose={() => setPending(null)}
        onConfirm={() => apply('SUSPENDED')}
        loading={loading}
        danger
        title="Suspend this school?"
        confirmLabel="Suspend school"
        message="Every user at this school will be signed out immediately and blocked from signing in until you reactivate it. No data is deleted."
      />
      <ConfirmDialog
        open={pending === 'ACTIVE'}
        onClose={() => setPending(null)}
        onConfirm={() => apply('ACTIVE')}
        loading={loading}
        title="Reactivate this school?"
        confirmLabel="Activate school"
        message="Staff, parents and students will be able to sign in again straight away."
      />
    </div>
  );
}
