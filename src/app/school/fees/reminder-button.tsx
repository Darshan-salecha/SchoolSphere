'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

const STAGES = [
  { value: 'BEFORE_DUE', label: 'Gentle reminder — before the due date' },
  { value: 'ON_DUE', label: 'Due today' },
  { value: 'OVERDUE', label: 'Overdue notice' },
  { value: 'ESCALATION', label: 'Final escalation' },
];

export function ReminderButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState('OVERDUE');
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    try {
      const res = await api.post<{ sent: number }>('/api/school/fees/reminders', { stage });
      toast.success(
        res.sent ? `${res.sent} reminder${res.sent === 1 ? '' : 's'} sent` : 'Nothing to send',
        res.sent ? 'Guardians with an outstanding balance were notified.' : 'Every family at this stage has already been reminded.',
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <BellRing className="h-4 w-4" /> Send reminders
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send fee reminders"
        description="Each family is reminded once per stage, so this is safe to run again."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={send} loading={loading}>
              Send now
            </Button>
          </>
        }
      >
        <Field label="Reminder stage">
          <Select value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>
    </>
  );
}
