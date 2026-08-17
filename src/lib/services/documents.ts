import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import * as t from '@/db/schema';
import { storage } from '@/lib/integrations/storage';
import { assertCanViewStudent } from '@/lib/scope';
import { badRequest, forbidden } from '@/lib/errors';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Student documents.
 *
 * Files are private by default: nothing is ever served from a public path.
 * The stored key is namespaced by school so one tenant's object prefix can
 * never address another's, and every download re-checks the guardian or staff
 * relationship rather than trusting possession of the key.
 */

const MAX_BYTES = 8 * 1024 * 1024;

/** Deliberately narrow. Anything executable or scriptable is refused. */
const ALLOWED = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);

export const DOCUMENT_CATEGORIES = [
  'BIRTH_CERTIFICATE',
  'ID_PROOF',
  'TRANSFER_CERTIFICATE',
  'PREVIOUS_MARKSHEET',
  'MEDICAL',
  'PHOTO',
  'OTHER',
] as const;

export async function uploadDocument(input: {
  session: SessionUser & { schoolId: string };
  studentId: string;
  title: string;
  category: string;
  file: File;
}) {
  const { session, studentId, file } = input;
  await assertCanViewStudent(session, studentId);

  if (file.size > MAX_BYTES) throw badRequest('That file is larger than 8 MB.');
  const extension = ALLOWED.get(file.type);
  if (!extension) throw badRequest('Only PDF, JPEG, PNG and WebP files can be uploaded.');

  // The key is server-generated; a client-supplied filename never reaches disk.
  const key = `${session.schoolId}/students/${studentId}/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await storage().put(key, buffer, file.type);

  const [row] = await db
    .insert(t.documents)
    .values({
      schoolId: session.schoolId,
      studentId,
      ownerType: 'STUDENT',
      ownerId: studentId,
      title: input.title,
      category: input.category,
      fileKey: key,
      mimeType: file.type,
      sizeBytes: file.size,
      uploadedById: session.id,
    })
    .returning();
  return row;
}

/** Authorises a download and returns the bytes. Never a redirect to storage. */
export async function readDocument(session: SessionUser & { schoolId: string }, documentId: string) {
  const doc = await db.query.documents.findFirst({
    where: and(eq(t.documents.id, documentId), eq(t.documents.schoolId, session.schoolId)),
  });
  if (!doc) throw forbidden('That document is not available.');
  if (doc.studentId) await assertCanViewStudent(session, doc.studentId);

  const body = await storage().get(doc.fileKey);
  return { doc, body };
}

export const listDocuments = (schoolId: string, studentId: string) =>
  db
    .select()
    .from(t.documents)
    .where(and(eq(t.documents.schoolId, schoolId), eq(t.documents.studentId, studentId)))
    .orderBy(desc(t.documents.createdAt));
