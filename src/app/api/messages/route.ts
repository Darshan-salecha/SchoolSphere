import { handler, created, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { threadSchema, messageSchema } from '@/lib/validation/schemas';
import { listThreads, postMessage, startThread } from '@/lib/services/messaging';
import { recordAudit } from '@/lib/audit';

export const GET = handler(async () => {
  const session = await requireSchoolContext();
  return ok({ data: await listThreads(session) });
});

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext();
  const input = await parseBody(req, threadSchema);
  const thread = await startThread({ session, ...input });
  await recordAudit({ session, action: 'message_thread.started', entity: 'MessageThread', entityId: thread.id });
  return created(thread);
});

export const PATCH = handler(async (req: Request) => {
  const session = await requireSchoolContext();
  const input = await parseBody(req, messageSchema);
  const message = await postMessage({ session, threadId: input.threadId, body: input.body });
  return ok(message);
});
