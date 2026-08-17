import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { studentTrackingView } from '@/lib/services/transport';
import { PageHeader } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { LiveTracking } from './live-tracking';
import { Bus } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ParentTransportPage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);
  if (!selected) return <EmptyState title="No children linked" description="Please contact the school office." />;

  const view = await studentTrackingView(session.schoolId, selected.id);

  const switcher = (
    <ChildSwitcher
      selectedId={selected.id}
      children={children.map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        photoUrl: c.photoUrl,
        label: currentSection(c) ? `${currentSection(c)!.section.class.name}-${currentSection(c)!.section.name}` : 'Not enrolled',
      }))}
    />
  );

  if (!view) {
    return (
      <>
        <PageHeader title="School bus" />
        {switcher}
        <div className="card">
          <EmptyState
            icon={Bus}
            title={`${selected.firstName} is not using school transport`}
            description="If this is wrong, contact the school office to have a route and stop assigned."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="School bus"
        description={`${view.route.name}${view.route.busNumber ? ` · ${view.route.busNumber}` : ''}`}
      />
      {switcher}
      <LiveTracking studentId={selected.id} childName={selected.firstName} initial={view} />
    </>
  );
}
