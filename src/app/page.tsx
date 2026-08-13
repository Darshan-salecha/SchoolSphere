import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { landingPath } from '@/lib/auth/landing';

export default async function RootPage() {
  const session = await getSession();
  redirect(session ? landingPath(session) : '/login');
}
