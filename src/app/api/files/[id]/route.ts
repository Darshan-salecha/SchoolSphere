import { requireSchoolContext } from '@/lib/auth/session';
import { readDocument } from '@/lib/services/documents';
import { apiError } from '@/lib/api';

/**
 * Authorised file download.
 *
 * Files are streamed through the app rather than served from a public URL, so
 * the guardian or staff relationship is re-checked on every single request —
 * possession of a link is never authorisation.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSchoolContext('documents.view', 'portal.parent', 'portal.student');
    const { id } = await ctx.params;
    const { doc, body } = await readDocument(session, id);

    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': doc.mimeType ?? 'application/octet-stream',
        'Content-Length': String(body.byteLength),
        // `inline` so a parent can view without downloading; the filename is
        // ours, never the client's original.
        'Content-Disposition': `inline; filename="${doc.title.replace(/[^\w.-]/g, '_')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
