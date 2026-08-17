import { requireSchoolPage } from '@/lib/page-guards';
import { listThreads } from '@/lib/services/messaging';
import { parentContext, currentSection } from '@/lib/parent-context';
import { PageHeader } from '@/components/ui/page';
import { ThreadList } from '@/components/messaging/thread-list';
import { QuickForm } from '@/components/forms/quick-form';

export const dynamic = 'force-dynamic';

export default async function ParentMessagesPage() {
  const session = await requireSchoolPage('portal.parent');
  const [threads, { children }] = await Promise.all([listThreads(session), parentContext(session)]);

  return (
    <>
      <PageHeader
        title="Messages"
        description="Talk to your child's class teacher. Nobody's personal number is shared."
        action={
          children.length ? (
            <QuickForm
              title="Start a conversation"
              description="This goes to your child's class teacher."
              endpoint="/api/messages"
              triggerLabel="New message"
              successMessage="Message sent"
              fields={[
                {
                  name: 'studentId',
                  label: 'About which child',
                  type: 'select',
                  required: true,
                  colSpan: 2,
                  options: children.map((c) => ({
                    value: c.id,
                    label: `${c.firstName} ${c.lastName}${currentSection(c) ? ` — ${currentSection(c)!.section.class.name}-${currentSection(c)!.section.name}` : ''}`,
                  })),
                },
                { name: 'subject', label: 'Subject', required: true, placeholder: 'Question about homework', colSpan: 2 },
                { name: 'body', label: 'Message', type: 'textarea', required: true },
              ]}
            />
          ) : undefined
        }
      />
      <ThreadList threads={threads} basePath="/parent/messages" counterpartOf={(t) => t.staffUser.name} />
    </>
  );
}
