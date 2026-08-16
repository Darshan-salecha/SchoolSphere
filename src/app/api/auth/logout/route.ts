import { destroySession, getSession } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { handler, seeOther } from '@/lib/api';

export const POST = handler(async () => {
  const session = await getSession();
  if (session) await recordAudit({ session, action: 'auth.logout', entity: 'User', entityId: session.id });
  await destroySession();
  // Relative on purpose — an absolute URL built from req.url resolves to the
  // container's own bind address (0.0.0.0:3000) once we are behind a proxy.
  return seeOther('/login');
});
