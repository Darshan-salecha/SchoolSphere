import { handler, ok, parseBody } from '@/lib/api';
import { requireSchoolContext } from '@/lib/auth/session';
import { feeCollectSchema } from '@/lib/validation/schemas';
import { collectPayment } from '@/lib/services/fees';
import { recordAudit } from '@/lib/audit';

export const POST = handler(async (req: Request) => {
  const session = await requireSchoolContext('fees.collect');
  const input = await parseBody(req, feeCollectSchema);

  const { payment, fee } = await collectPayment({
    session,
    studentFeeId: input.studentFeeId,
    amount: Math.round(input.amount * 100),
    method: input.method,
    providerRef: input.providerRef || null,
  });

  await recordAudit({
    session,
    action: 'fee.collected',
    entity: 'Payment',
    entityId: payment.id,
    after: { receipt: payment.receiptNumber, amount: payment.amount, method: payment.method, feeId: fee.id },
  });
  return ok({ receiptNumber: payment.receiptNumber, paidAmount: fee.paidAmount, status: fee.status });
});
