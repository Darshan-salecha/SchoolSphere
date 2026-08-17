import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requirePageSession } from '@/lib/page-guards';
import { landingPath } from '@/lib/auth/landing';
import { NotificationList } from './notification-list';

export const dynamic = 'force-dynamic';

/**
 * One notification centre for every role — the rows are already scoped to the
 * signed-in user, so there is no reason to build this three times.
 */
export default async function NotificationsPage() {
  const session = await requirePageSession();
  if (!session.schoolId) redirect(landingPath(session));

  const rows = await db
    .select()
    .from(t.notifications)
    .where(and(eq(t.notifications.schoolId, session.schoolId), eq(t.notifications.userId, session.id)))
    .orderBy(desc(t.notifications.createdAt))
    .limit(100);

  return <NotificationList initial={rows} backHref={landingPath(session)} />;
}
