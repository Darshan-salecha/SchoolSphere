import { NextResponse } from 'next/server';
import { destroySession, getSession } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit';
import { handler } from '@/lib/api';

export const POST = handler(async (req: Request) => {
  const session = await getSession();
  if (session) await recordAudit({ session, action: 'auth.logout', entity: 'User', entityId: session.id });
  await destroySession();
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 });
});
