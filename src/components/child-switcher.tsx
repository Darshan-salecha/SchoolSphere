'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';

type Child = { id: string; firstName: string; lastName: string; photoUrl: string | null; label: string };

export function ChildSwitcher({ children, selectedId }: { children: Child[]; selectedId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  if (children.length <= 1) return null;

  async function select(id: string) {
    setPending(id);
    try {
      await api.post('/api/parent/select-child', { studentId: id });
      router.refresh();
    } catch {
      toast.error('We could not switch children. Please try again.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Select a child">
      {children.map((c) => (
        <button
          key={c.id}
          role="tab"
          aria-selected={c.id === selectedId}
          disabled={pending === c.id}
          onClick={() => select(c.id)}
          className={cn(
            'flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
            c.id === selectedId ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50',
            pending === c.id && 'opacity-60',
          )}
        >
          <Avatar name={`${c.firstName} ${c.lastName}`} src={c.photoUrl} size="sm" />
          <span>
            <span className="block text-sm font-medium text-slate-900">
              {c.firstName} {c.lastName}
            </span>
            <span className="block text-xs text-slate-500">{c.label}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
