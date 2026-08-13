import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { SCHOOL_NAV } from '@/components/layout/nav-config';
import { filterNav, requirePageSession } from '@/lib/page-guards';
import { landingPath, roleLabel } from '@/lib/auth/landing';

export default async function SchoolLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  // Parents, students and drivers have their own portals.
  if (!session.schoolId || session.parentId || session.driverId || (session.studentId && !session.teacherId)) {
    redirect(landingPath(session));
  }

  const nav = SCHOOL_NAV.map((g) => ({ ...g, items: filterNav(session, g.items) })).filter((g) => g.items.length);

  return (
    <AppShell
      nav={nav}
      user={{ name: session.name, roleLabel: roleLabel(session) }}
      brand={{ title: session.schoolName ?? 'School', subtitle: session.schoolCode, href: '/school' }}
    >
      {children}
    </AppShell>
  );
}
