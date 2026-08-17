'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Bell, CheckCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/client';
import { cn, formatDate } from '@/lib/utils';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  priority: string;
  readAt: Date | null;
  createdAt: Date;
};

const TONE: Record<string, 'red' | 'amber' | 'brand' | 'blue' | 'slate' | 'green'> = {
  ATTENDANCE: 'amber',
  RESULT: 'brand',
  FEE: 'red',
  TRANSPORT: 'blue',
  HOMEWORK: 'slate',
  ANNOUNCEMENT: 'brand',
  MESSAGE: 'green',
  LEAVE: 'slate',
};

export function NotificationList({ initial, backHref }: { initial: Notification[]; backHref: string }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  const unread = items.filter((n) => !n.readAt).length;

  async function markAll() {
    setBusy(true);
    try {
      await api.patch('/api/notifications', {});
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date() })));
      toast.success('All caught up');
      router.refresh();
    } catch {
      toast.error('Could not update your notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function open(item: Notification) {
    if (!item.readAt) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date() } : n)));
      await api.patch('/api/notifications', { id: item.id }).catch(() => undefined);
    }
    if (item.link) router.push(item.link);
  }

  return (
    <>
      <Link href={backHref} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : 'You are all caught up.'}
        action={
          unread > 0 ? (
            <Button variant="outline" onClick={markAll} loading={busy}>
              <CheckCheck className="h-4 w-4" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <div className="card">
          <EmptyState icon={Bell} title="Nothing yet" description="Attendance, results, fees and bus alerts will appear here." />
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                onClick={() => open(n)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                  n.readAt ? 'border-slate-200 bg-white hover:bg-slate-50' : 'border-brand-200 bg-brand-50/60 hover:bg-brand-50',
                )}
              >
                {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                <span className={cn('min-w-0 flex-1', n.readAt && 'pl-5')}>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{n.title}</span>
                    <Badge tone={TONE[n.type] ?? 'slate'}>{n.type.toLowerCase()}</Badge>
                    {n.priority === 'EMERGENCY' && <Badge tone="red">urgent</Badge>}
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-600">{n.body}</span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {formatDate(n.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
