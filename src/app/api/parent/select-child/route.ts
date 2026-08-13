import { cookies } from 'next/headers';
import { z } from 'zod';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { assertParentOwnsStudent } from '@/lib/scope';
import { CHILD_COOKIE } from '@/lib/parent-context';

/** Switching child is authorised server-side, not just in the UI. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('portal.parent');
  const { studentId } = await parseBody(req, z.object({ studentId: z.string() }));
  await assertParentOwnsStudent(session, studentId);

  (await cookies()).set(CHILD_COOKIE, studentId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  return ok({ ok: true });
});
