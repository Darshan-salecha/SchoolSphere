import { handler, ok } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { runAutomation } from '@/lib/services/automation';
import { recordAudit } from '@/lib/audit';

/**
 * Runs the smart notification rules for this school.
 *
 * Exposed as an endpoint rather than an internal cron so it can be driven by
 * any scheduler — a container cron, a platform job, or an admin pressing the
 * button. Idempotent, so none of those can double-notify.
 */
export const POST = handler(async () => {
  const session = await requireSchoolContext('school.settings.manage');
  const results = await runAutomation(session.schoolId);
  await recordAudit({ session, action: 'automation.run', entity: 'School', entityId: session.schoolId, after: { results } });
  return ok({ results });
});
