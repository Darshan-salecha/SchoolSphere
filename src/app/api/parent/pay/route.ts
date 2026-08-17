import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { assertParentOwnsStudent } from '@/lib/scope';
import { balanceOf, collectPayment } from '@/lib/services/fees';
import { paymentProvider } from '@/lib/integrations/payments';
import { recordAudit } from '@/lib/audit';
import { badRequest, forbidden } from '@/lib/errors';

const schema = z.object({ studentFeeId: z.string(), amount: z.coerce.number().min(0.01).optional() });

/**
 * Parent-initiated payment.
 *
 * Goes through the payment provider abstraction: the mock driver captures
 * immediately so the whole flow — pay, receipt, notification — works locally,
 * and a real gateway drops in without touching this handler. The amount is
 * re-derived from the fee row rather than trusted from the request.
 */
export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('portal.parent');
  const { studentFeeId, amount } = await parseBody(req, schema);

  const fee = await db.query.studentFees.findFirst({
    where: and(eq(t.studentFees.id, studentFeeId), eq(t.studentFees.schoolId, session.schoolId)),
  });
  if (!fee) throw forbidden('That fee is not available on your account.');

  // The guardian link is the authorisation — a fee id alone is never enough.
  await assertParentOwnsStudent(session, fee.studentId);

  const outstanding = balanceOf(fee);
  if (outstanding <= 0) throw badRequest('That fee is already settled.');

  const payable = amount ? Math.round(amount * 100) : outstanding;
  if (payable > outstanding) throw badRequest('That is more than the outstanding balance.');

  const provider = paymentProvider();
  const intent = await provider.createIntent({
    amount: payable,
    currency: 'INR',
    reference: `${fee.id}:${Date.now()}`,
  });
  const capture = await provider.capture(intent.id);
  if (capture.status !== 'SUCCESS') throw badRequest('That payment could not be completed. Please try again.');

  const { payment } = await collectPayment({
    session,
    studentFeeId: fee.id,
    amount: payable,
    method: 'ONLINE',
    provider: intent.provider,
    providerRef: capture.providerRef,
  });

  await recordAudit({
    session,
    action: 'fee.paid_online',
    entity: 'Payment',
    entityId: payment.id,
    after: { receipt: payment.receiptNumber, amount: payment.amount },
  });
  return ok({ receiptNumber: payment.receiptNumber, paymentId: payment.id });
});
