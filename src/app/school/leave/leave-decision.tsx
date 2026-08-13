'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

export function LeaveDecision({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  async function decide(status: 'APPROVED' | 'REJECTED') {
    setLoading(status);
    try {
      await api.patch('/api/school/leave', { id, status });
      toast.success(`Leave ${status.toLowerCase()}`, 'The requester has been notified.');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" loading={loading === 'REJECTED'} onClick={() => decide('REJECTED')}>
        Reject
      </Button>
      <Button size="sm" loading={loading === 'APPROVED'} onClick={() => decide('APPROVED')}>
        Approve
      </Button>
    </div>
  );
}
