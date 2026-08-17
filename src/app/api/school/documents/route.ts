import { handler, created, ok } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { uploadDocument } from '@/lib/services/documents';
import { recordAudit } from '@/lib/audit';
import { badRequest } from '@/lib/errors';

/** Multipart upload — the one place in the product that accepts a file. */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('documents.manage');
  const form = await req.formData();

  const file = form.get('file');
  const studentId = String(form.get('studentId') ?? '');
  const title = String(form.get('title') ?? '').trim();
  const category = String(form.get('category') ?? 'OTHER');

  if (!(file instanceof File) || !file.size) throw badRequest('Choose a file to upload.');
  if (!studentId) throw badRequest('Select a student.');
  if (!title) throw badRequest('Give the document a title.');

  const row = await uploadDocument({ session, studentId, title, category, file });
  await recordAudit({
    session,
    action: 'document.uploaded',
    entity: 'Document',
    entityId: row.id,
    after: { studentId, title, category, sizeBytes: row.sizeBytes },
  });
  return created({ id: row.id, title: row.title });
});
