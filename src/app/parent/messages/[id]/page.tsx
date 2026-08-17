import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireSchoolPage } from '@/lib/page-guards';
import { readThread } from '@/lib/services/messaging';
import { PageHeader } from '@/components/ui/page';
import { ThreadView } from '@/components/messaging/thread-view';

export const dynamic = 'force-dynamic';

export default async function ParentThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSchoolPage('portal.parent');
  const { id } = await params;
  const { thread, messages } = await readThread(session, id);

  return (
    <>
      <Link href="/parent/messages" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> All messages
      </Link>
      <PageHeader title={thread.subject} description={`About ${thread.student.firstName} ${thread.student.lastName}`} />
      <ThreadView
        threadId={thread.id}
        subject={thread.subject}
        messages={messages}
        currentUserId={session.id}
        closed={Boolean(thread.closedAt)}
      />
    </>
  );
}
