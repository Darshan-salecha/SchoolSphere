import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { sendSms } from '@/lib/integrations/sms';
import { sendEmail } from '@/lib/integrations/email';

export type Channel = 'IN_APP' | 'SMS' | 'EMAIL' | 'PUSH';

export type NotifyInput = {
  schoolId: string;
  userIds: string[];
  type: string;
  title: string;
  body: string;
  link?: string;
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'EMERGENCY';
  channels?: Channel[];
};

/**
 * Single fan-out point for every notification. In production this enqueues a
 * background job; the call signature stays identical.
 */
export async function notify(input: NotifyInput) {
  const channels = input.channels ?? ['IN_APP'];
  const userIds = [...new Set(input.userIds)].filter(Boolean);
  if (!userIds.length) return { delivered: 0 };

  await db.insert(t.notifications).values(
    userIds.map((userId) => ({
      schoolId: input.schoolId,
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      priority: input.priority ?? 'NORMAL',
      channels,
    })),
  );

  if (channels.includes('SMS') || channels.includes('EMAIL')) {
    const recipients = await db
      .select({ phone: t.users.phone, email: t.users.email })
      .from(t.users)
      .where(inArray(t.users.id, userIds));
    await Promise.all(
      recipients.flatMap((u) => {
        const jobs: Promise<unknown>[] = [];
        if (channels.includes('SMS') && u.phone) jobs.push(sendSms(u.phone, `${input.title}: ${input.body}`));
        if (channels.includes('EMAIL') && u.email) jobs.push(sendEmail(u.email, input.title, input.body));
        return jobs;
      }),
    );
  }
  return { delivered: userIds.length };
}

/** Guardian user ids for a set of students — used by attendance, results and fees. */
export async function guardianUserIds(schoolId: string, studentIds: string[]) {
  if (!studentIds.length) return [];
  const rows = await db
    .select({ userId: t.parents.userId })
    .from(t.studentParents)
    .innerJoin(t.parents, eq(t.parents.id, t.studentParents.parentId))
    .where(inArray(t.studentParents.studentId, studentIds));
  return [...new Set(rows.map((r) => r.userId))];
}
