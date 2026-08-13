'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

export function YearActions({ id, isCurrent, isArchived }: { id: string; isCurrent: boolean; isArchived: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  async function run(action: 'setCurrent' | 'archive') {
    setLoading(action);
    try {
      await api.patch('/api/school/academic-years', { id, action });
      toast.success(action === 'setCurrent' ? 'Current academic year updated' : 'Academic year archived');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex justify-end gap-2">
      {!isCurrent && (
        <Button size="sm" variant="outline" loading={loading === 'setCurrent'} onClick={() => run('setCurrent')}>
          Make current
        </Button>
      )}
      {!isCurrent && !isArchived && (
        <Button size="sm" variant="ghost" loading={loading === 'archive'} onClick={() => run('archive')}>
          Archive
        </Button>
      )}
    </div>
  );
}
