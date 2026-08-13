import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { getSession } from '@/lib/auth/session';
import { landingPath } from '@/lib/auth/landing';
import { ParentLoginForm } from './parent-login-form';

export const dynamic = 'force-dynamic';

export default async function ParentLoginPage() {
  const session = await getSession();
  if (session) redirect(landingPath(session));

  const schools = await db
    .select({ id: t.schools.id, name: t.schools.name, city: t.schools.city })
    .from(t.schools)
    .where(and(eq(t.schools.status, 'ACTIVE'), isNull(t.schools.deletedAt)))
    .orderBy(asc(t.schools.name))
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Parent sign in</h1>
        <p className="mt-1 text-sm text-slate-500">
          Use the mobile number your child&apos;s school has on record. We&apos;ll text you a one-time code.
        </p>
      </div>
      <div className="card p-6">
        <ParentLoginForm schools={schools} />
      </div>
      <p className="text-center text-sm text-slate-500">
        Staff member?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Sign in with email
        </Link>
      </p>
    </div>
  );
}
