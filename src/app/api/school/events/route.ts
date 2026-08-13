import { db } from '@/db';
import * as t from '@/db/schema';
import { created, handler, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { eventSchema } from '@/lib/validation/schemas';
import { recordAudit } from '@/lib/audit';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('events.manage');
  const input = await parseBody(req, eventSchema);
  const [row] = await db
    .insert(t.events)
    .values({
      schoolId: session.schoolId,
      title: input.title,
      description: input.description || null,
      category: input.category,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      location: input.location || null,
      audience: input.audience,
      requiresRsvp: input.requiresRsvp,
    })
    .returning();
  await recordAudit({ session, action: 'event.created', entity: 'Event', entityId: row.id, after: { title: row.title } });
  return created(row);
});
