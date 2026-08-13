import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { STUDENT_NAV } from '@/components/layout/nav-config';
import { requirePageSession } from '@/lib/page-guards';
import { landingPath } from '@/lib/auth/landing';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePageSession();
  if (!session.studentId) redirect(landingPath(session));

  return (
    <AppShell
      nav={STUDENT_NAV}
      user={{ name: session.name, roleLabel: 'Student' }}
      brand={{ title: session.schoolName ?? 'School', subtitle: 'Student portal', href: '/student' }}
    >
      {children}
    </AppShell>
  );
}
