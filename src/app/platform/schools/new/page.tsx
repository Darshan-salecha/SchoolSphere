import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requirePagePermission } from '@/lib/page-guards';
import { PageHeader } from '@/components/ui/page';
import { NewSchoolForm } from './new-school-form';

export const dynamic = 'force-dynamic';

export default async function NewSchoolPage() {
  await requirePagePermission('platform.schools.manage');
  const plans = await db.select().from(t.plans).where(eq(t.plans.isActive, true)).orderBy(asc(t.plans.priceMonthly));

  return (
    <>
      <PageHeader
        title="Onboard a school"
        description="Creates an isolated tenant, a 30-day trial subscription and the first school admin account."
      />
      <NewSchoolForm plans={plans.map((p) => ({ code: p.code, name: p.name, maxStudents: p.maxStudents }))} />
    </>
  );
}
