import { handler, created, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { certificateSchema } from '@/lib/validation/schemas';
import { issueCertificate } from '@/lib/services/certificates';
import { recordAudit } from '@/lib/audit';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('documents.manage');
  const input = await parseBody(req, certificateSchema);

  const row = await issueCertificate({
    session,
    studentId: input.studentId,
    type: input.type,
    note: input.note || null,
  });

  await recordAudit({
    session,
    action: 'certificate.issued',
    entity: 'Certificate',
    entityId: row.id,
    after: { type: row.type, serial: row.serialNumber, studentId: input.studentId },
  });
  return created(row);
});
