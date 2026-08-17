'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { formatCurrency } from '@/lib/utils';

export function PayButton({ feeId, title, balance }: { feeId: string; title: string; balance: number }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ receiptNumber: string }>('/api/parent/pay', { studentFeeId: feeId });
      toast.success(`Payment successful — ${res.receiptNumber}`, 'Your receipt is available below.');
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'That payment could not be completed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <CreditCard className="h-3.5 w-3.5" /> Pay
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Pay school fees"
        description={title}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={pay} loading={loading}>
              Pay {formatCurrency(balance)}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-600">Amount due</p>
            <p className="text-2xl font-semibold text-slate-900">{formatCurrency(balance)}</p>
          </div>
          <p className="text-xs text-slate-500">
            You will be taken to the school&apos;s payment provider. A receipt is generated automatically once the
            payment succeeds.
          </p>
        </div>
      </Modal>
    </>
  );
}
