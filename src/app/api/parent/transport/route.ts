import { z } from 'zod';
import { handler, ok, parseQuery } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { assertParentOwnsStudent } from '@/lib/scope';
import { studentTrackingView } from '@/lib/services/transport';

/**
 * The polling fallback for the parent map — the same view the page renders on
 * the server, so there is one shape of this payload rather than two that drift.
 */
export const GET = handler(async (req: Request) => {
  const session = await requireSchoolContext('portal.parent');
  const { studentId } = parseQuery(req, z.object({ studentId: z.string() }));
  await assertParentOwnsStudent(session, studentId);
  return ok((await studentTrackingView(session.schoolId, studentId)) ?? { route: null });
});
