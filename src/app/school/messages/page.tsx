import { requireSchoolPage } from '@/lib/page-guards';
import { listThreads } from '@/lib/services/messaging';
import { PageHeader } from '@/components/ui/page';
import { ThreadList } from '@/components/messaging/thread-list';

export const dynamic = 'force-dynamic';

export default async function SchoolMessagesPage() {
  const session = await requireSchoolPage();
  const threads = await listThreads(session);

  return (
    <>
      <PageHeader
        title="Messages"
        description="Conversations with guardians. Start one from a student's profile."
      />
      <ThreadList threads={threads} basePath="/school/messages" counterpartOf={(t) => t.parent.user.name} />
    </>
  );
}
