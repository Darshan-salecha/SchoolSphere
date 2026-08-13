import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { landingPath } from '@/lib/auth/landing';
import { LoginForm } from './login-form';
import { DemoAccounts } from './demo-accounts';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(landingPath(session));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">For platform admins, school staff, teachers and students.</p>
      </div>
      <div className="card p-6">
        <LoginForm />
      </div>
      <p className="text-center text-sm text-slate-500">
        Are you a parent?{' '}
        <Link href="/parent-login" className="font-medium text-brand-600 hover:underline">
          Sign in with your mobile number
        </Link>
      </p>
      {process.env.DEMO_MODE === 'true' && <DemoAccounts />}
    </div>
  );
}
