import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/utils';
import { MessagesSquare } from 'lucide-react';

export type ThreadSummary = {
  id: string;
  subject: string;
  lastMessageAt: Date;
  unread: number;
  student: { firstName: string; lastName: string };
  parent: { user: { name: string } };
  staffUser: { id: string; name: string };
};

export function ThreadList({
  threads,
  basePath,
  counterpartOf,
}: {
  threads: ThreadSummary[];
  basePath: string;
  counterpartOf: (t: ThreadSummary) => string;
}) {
  if (!threads.length) {
    return (
      <div className="card">
        <EmptyState
          icon={MessagesSquare}
          title="No conversations yet"
          description="Messages stay inside the school — personal phone numbers are never shared."
        />
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {threads.map((thread) => (
        <li key={thread.id}>
          <Link
            href={`${basePath}/${thread.id}`}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
          >
            <Avatar name={counterpartOf(thread)} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-900">{thread.subject}</span>
                {thread.unread > 0 && <Badge tone="brand">{thread.unread} new</Badge>}
              </span>
              <span className="block truncate text-xs text-slate-500">
                {counterpartOf(thread)} · about {thread.student.firstName} {thread.student.lastName}
              </span>
            </span>
            <span className="shrink-0 text-xs text-slate-400">{formatDate(thread.lastMessageAt, { dateStyle: 'medium' })}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
