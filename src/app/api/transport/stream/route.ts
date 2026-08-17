import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolContext } from '@/lib/auth/session';
import { assertParentOwnsStudent, hasSchoolWideAccess } from '@/lib/scope';
import { subscribe, encodeSse, SSE_KEEPALIVE } from '@/lib/services/tracking-bus';
import { trackingChannels } from '@/lib/tracking';
import { apiError } from '@/lib/api';
import { forbidden } from '@/lib/errors';

export const dynamic = 'force-dynamic';

/**
 * Live bus position stream.
 *
 * Authorisation happens once, here, before the stream opens — after that the
 * subscriber is pinned to one route channel that the server chose, so no
 * message a client sends can widen what it receives. A parent may only attach
 * to the route their own child is assigned to.
 */
export async function GET(req: Request) {
  try {
    const session = await requireSchoolContext();
    const url = new URL(req.url);
    const studentId = url.searchParams.get('studentId');
    const requestedRoute = url.searchParams.get('routeId');

    let routeId: string;

    if (session.parentId) {
      if (!studentId) throw forbidden('Select a child first.');
      await assertParentOwnsStudent(session, studentId);
      const assignment = await db.query.studentTransport.findFirst({
        where: and(eq(t.studentTransport.schoolId, session.schoolId), eq(t.studentTransport.studentId, studentId)),
      });
      if (!assignment) throw forbidden('That child does not use school transport.');
      routeId = assignment.routeId;
    } else if (session.driverId) {
      const route = await db.query.routes.findFirst({
        where: and(eq(t.routes.schoolId, session.schoolId), eq(t.routes.driverId, session.driverId)),
      });
      if (!route) throw forbidden('You are not assigned to a route.');
      routeId = route.id;
    } else if (hasSchoolWideAccess(session) || session.permissions.includes('transport.view')) {
      if (!requestedRoute) throw forbidden('Select a route.');
      const route = await db.query.routes.findFirst({
        where: and(eq(t.routes.id, requestedRoute), eq(t.routes.schoolId, session.schoolId)),
      });
      if (!route) throw forbidden('That route is not available.');
      routeId = route.id;
    } else {
      throw forbidden();
    }

    const channel = trackingChannels.route(session.schoolId, routeId);
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const send = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // Client vanished mid-write; cleanup below handles it.
          }
        };

        send(encodeSse({ event: 'ready', data: { routeId } }));
        const unsubscribe = subscribe(channel, (message) => send(encodeSse(message)));

        // Proxies drop idle connections; a comment frame keeps it warm without
        // being visible as an event to the client.
        const keepalive = setInterval(() => send(SSE_KEEPALIVE), 25_000);

        const close = () => {
          clearInterval(keepalive);
          unsubscribe();
          try {
            controller.close();
          } catch {
            // already closed
          }
        };
        req.signal.addEventListener('abort', close);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Nginx buffers streamed responses by default, which would hold every
        // position update until the connection closed.
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
