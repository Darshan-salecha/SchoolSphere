import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { PARENT_NAV } from '@/components/layout/nav-config';
import { requirePageSession } from '@/lib/page-guards';
import { unreadNotifications } from '@/lib/services/messaging';
import { landingPath } from '@/lib/auth/landing';

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  if (!session.parentId) redirect(landingPath(session));

  const unread = session.schoolId ? await unreadNotifications(session.schoolId, session.id) : 0;

  return (
    <AppShell
      nav={PARENT_NAV}
      user={{ name: session.name, roleLabel: 'Parent', unread }}
      brand={{ title: session.schoolName ?? 'School', subtitle: 'Parent portal', href: '/parent' }}
    >
      {children}
    </AppShell>
  );
}
