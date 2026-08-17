import { and, count, eq } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { assertCanViewStudent } from '@/lib/scope';
import { notFound } from '@/lib/errors';
import { formatDate } from '@/lib/utils';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Certificate issue.
 *
 * The wording is generated once and *stored*, not re-rendered from live data.
 * A bonafide certificate issued in June must still read the same in December
 * even if the student has since changed class — a certificate is a statement
 * about a moment, so it is frozen at issue.
 */

export const CERTIFICATE_TYPES = {
  BONAFIDE: 'Bonafide Certificate',
  TRANSFER: 'Transfer Certificate',
  CHARACTER: 'Character Certificate',
  ACHIEVEMENT: 'Certificate of Achievement',
  PARTICIPATION: 'Certificate of Participation',
} as const;

export type CertificateType = keyof typeof CERTIFICATE_TYPES;

function compose(input: {
  type: CertificateType;
  studentName: string;
  className: string | null;
  admissionNumber: string;
  schoolName: string;
  academicYear: string | null;
  note?: string | null;
}) {
  const { studentName, className, admissionNumber, schoolName, academicYear } = input;
  const where = className ? ` of class ${className}` : '';
  const year = academicYear ? ` during the academic year ${academicYear}` : '';

  switch (input.type) {
    case 'BONAFIDE':
      return `This is to certify that ${studentName}${where}, bearing admission number ${admissionNumber}, is a bonafide student of ${schoolName}${year}. This certificate is issued on request for official purposes.`;
    case 'TRANSFER':
      return `This is to certify that ${studentName}${where}, bearing admission number ${admissionNumber}, was a student of ${schoolName}${year}. All dues owed to the school have been settled and the student is hereby relieved. Conduct during the period of study was satisfactory.`;
    case 'CHARACTER':
      return `This is to certify that ${studentName}${where}, bearing admission number ${admissionNumber}, has been a student of ${schoolName}${year}. To the best of our knowledge their character and conduct have been good throughout this period.`;
    case 'ACHIEVEMENT':
      return `This certificate is proudly presented to ${studentName}${where} of ${schoolName} in recognition of outstanding achievement${input.note ? ` in ${input.note}` : ''}${year}.`;
    case 'PARTICIPATION':
      return `This certificate is presented to ${studentName}${where} of ${schoolName} for enthusiastic participation${input.note ? ` in ${input.note}` : ''}${year}.`;
  }
}

async function nextSerial(schoolId: string, type: CertificateType) {
  const [{ value }] = await db
    .select({ value: count() })
    .from(t.certificates)
    .where(and(eq(t.certificates.schoolId, schoolId), eq(t.certificates.type, type)));
  return `${type.slice(0, 3)}-${new Date().getFullYear()}-${String(value + 1).padStart(4, '0')}`;
}

export async function issueCertificate(input: {
  session: SessionUser & { schoolId: string };
  studentId: string;
  type: CertificateType;
  note?: string | null;
}) {
  const { session, studentId, type } = input;
  await assertCanViewStudent(session, studentId);

  const student = await db.query.students.findFirst({
    where: and(eq(t.students.id, studentId), eq(t.students.schoolId, session.schoolId)),
    with: {
      enrollments: {
        where: eq(t.enrollments.isCurrent, true),
        with: { section: { with: { class: true } }, academicYear: true },
      },
    },
  });
  if (!student) throw notFound('Student not found');

  const school = await db.query.schools.findFirst({ where: eq(t.schools.id, session.schoolId) });
  const enrollment = student.enrollments[0];

  const body = compose({
    type,
    studentName: `${student.firstName} ${student.lastName}`,
    className: enrollment ? `${enrollment.section.class.name}-${enrollment.section.name}` : null,
    admissionNumber: student.admissionNumber,
    schoolName: school?.name ?? 'the school',
    academicYear: enrollment?.academicYear.name ?? null,
    note: input.note,
  });

  const [row] = await db
    .insert(t.certificates)
    .values({
      schoolId: session.schoolId,
      studentId,
      type,
      serialNumber: await nextSerial(session.schoolId, type),
      body,
      issuedById: session.id,
    })
    .returning();
  return row;
}

export const listCertificates = (schoolId: string, studentId: string) =>
  db
    .select()
    .from(t.certificates)
    .where(and(eq(t.certificates.schoolId, schoolId), eq(t.certificates.studentId, studentId)));
