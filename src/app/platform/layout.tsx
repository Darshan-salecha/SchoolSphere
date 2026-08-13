import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { PLATFORM_NAV } from '@/components/layout/nav-config';
import { filterNav, requirePageSession } from '@/lib/page-guards';
import { landingPath, roleLabel } from '@/lib/auth/landing';

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  if (!session.isPlatform) redirect(landingPath(session));

  const nav = PLATFORM_NAV.map((g) => ({ ...g, items: filterNav(session, g.items) })).filter((g) => g.items.length);

  return (
    <AppShell
      nav={nav}
      user={{ name: session.name, roleLabel: roleLabel(session) }}
      brand={{ title: 'SchoolSphere', subtitle: 'Platform console', href: '/platform' }}
    >
      {children}
    </AppShell>
  );
}
