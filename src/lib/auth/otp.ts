import bcrypt from 'bcryptjs';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { sendSms } from '@/lib/integrations/sms';
import { badRequest, tooMany } from '@/lib/errors';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_WINDOW_MS = 60 * 1000;
const MAX_PER_HOUR = 5;

export const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

export async function issueOtp(schoolId: string, phone: string, purpose = 'PARENT_LOGIN') {
  const hourAgo = new Date(Date.now() - 3600_000);
  const recent = await db.query.otpCodes.findMany({
    where: and(
      eq(t.otpCodes.schoolId, schoolId),
      eq(t.otpCodes.phone, phone),
      eq(t.otpCodes.purpose, purpose),
      gt(t.otpCodes.createdAt, hourAgo),
    ),
    orderBy: desc(t.otpCodes.createdAt),
  });

  if (recent.length >= MAX_PER_HOUR) throw tooMany('Too many codes requested. Please try again in an hour.');
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_WINDOW_MS) {
    throw tooMany('A code was just sent. Please wait a minute before requesting another.');
  }

  const code = generateOtp();
  await db.insert(t.otpCodes).values({
    schoolId,
    phone,
    purpose,
    codeHash: await bcrypt.hash(code, 8),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  await sendSms(phone, `${code} is your SchoolSphere verification code. It expires in 5 minutes.`);

  // Surfaced only in demo mode so the flow is testable without an SMS gateway.
  return process.env.DEMO_MODE === 'true' ? code : null;
}

export async function verifyOtp(schoolId: string, phone: string, code: string, purpose = 'PARENT_LOGIN') {
  const record = await db.query.otpCodes.findFirst({
    where: and(
      eq(t.otpCodes.schoolId, schoolId),
      eq(t.otpCodes.phone, phone),
      eq(t.otpCodes.purpose, purpose),
      isNull(t.otpCodes.consumedAt),
    ),
    orderBy: desc(t.otpCodes.createdAt),
  });

  if (!record) throw badRequest('No verification code found. Please request a new one.');
  if (record.expiresAt < new Date()) throw badRequest('That code has expired. Please request a new one.');
  if (record.attempts >= MAX_ATTEMPTS) throw tooMany('Too many incorrect attempts. Please request a new code.');

  if (!(await bcrypt.compare(code, record.codeHash))) {
    await db.update(t.otpCodes).set({ attempts: record.attempts + 1 }).where(eq(t.otpCodes.id, record.id));
    throw badRequest('That code is not correct.');
  }

  await db.update(t.otpCodes).set({ consumedAt: new Date() }).where(eq(t.otpCodes.id, record.id));
  return true;
}
