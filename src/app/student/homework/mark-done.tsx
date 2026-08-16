'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

/**
 * The student's own tick. Kept to one tap for the common case, with a note and a
 * link tucked behind the same dialog for anyone who wants to send something.
 */
export function MarkDone({
  homeworkId,
  done,
  locked,
  needsRework,
}: {
  homeworkId: string;
  done: boolean;
  locked: boolean;
  needsRework: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function submit() {
    setSaving(true);
    setErrors({});
    try {
      await api.post(`/api/school/homework/${homeworkId}/submit`, { note: note || undefined, link: link || undefined });
      toast.success(needsRework ? 'Sent back to your teacher' : 'Marked as done', 'Your teacher can see it now.');
      setOpen(false);
      setNote('');
      setLink('');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError && err.details) setErrors(err.details);
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function undo() {
    setSaving(true);
    try {
      await api.del(`/api/school/homework/${homeworkId}/submit`);
      toast.success('Unmarked', 'You can mark it done again any time.');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (done && !needsRework) {
    return locked ? null : (
      <Button size="sm" variant="ghost" loading={saving} onClick={undo}>
        <Undo2 className="h-3.5 w-3.5" /> Undo
      </Button>
    );
  }

  return (
    <>
      <Button size="sm" variant={needsRework ? 'primary' : 'outline'} onClick={() => setOpen(true)}>
        <Check className="h-3.5 w-3.5" /> {needsRework ? 'Redo and resend' : 'Mark as done'}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={needsRework ? 'Send it back to your teacher' : 'Mark this homework done'}
        description="Add a note or a link if you want to — both are optional."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button loading={saving} onClick={submit}>
              <Check className="h-4 w-4" /> Confirm
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Note for your teacher" error={errors.note}>
            <Textarea
              rows={3}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Finished all five questions in my notebook."
            />
          </Field>
          <Field label="Link" hint="A document or drive link, if your teacher asked for one." error={errors.link}>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
          </Field>
        </div>
      </Modal>
    </>
  );
}
