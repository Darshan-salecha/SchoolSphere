'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Receipt } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { formatCurrency } from '@/lib/utils';

const METHODS = ['CASH', 'UPI', 'ONLINE', 'BANK_TRANSFER', 'CHEQUE', 'CARD'];

export function CollectPayment({
  feeId,
  studentName,
  title,
  balance,
}: {
  feeId: string;
  studentName: string;
  title: string;
  balance: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState((balance / 100).toFixed(2));
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ receiptNumber: string }>('/api/school/fees/collect', {
        studentFeeId: feeId,
        amount: Number(amount),
        method,
        providerRef: reference,
      });
      toast.success(`Receipt ${res.receiptNumber}`, 'The guardians have been notified.');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Receipt className="h-3.5 w-3.5" /> Collect
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a payment"
        description={`${studentName} · ${title}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="collect-form" loading={loading}>
              Record payment
            </Button>
          </>
        }
      >
        <form id="collect-form" onSubmit={submit} className="space-y-4">
          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-600">Outstanding balance</span>
            <span className="ml-2 font-semibold text-slate-900">{formatCurrency(balance)}</span>
          </div>
          <Field label="Amount received" required hint="Part payments are allowed; more than the balance is not.">
            <Input
              type="number"
              step="0.01"
              min="0.01"
              max={(balance / 100).toFixed(2)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </Field>
          <Field label="Method" required>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace('_', ' ').toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reference" hint="Cheque number, UPI reference or transaction id">
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
          </Field>
        </form>
      </Modal>
    </>
  );
}
