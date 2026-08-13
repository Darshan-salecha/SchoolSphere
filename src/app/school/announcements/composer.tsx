'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Megaphone, Eye } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

const TYPES = ['GENERAL', 'EMERGENCY', 'ACADEMIC', 'EXAM', 'HOLIDAY', 'FEE', 'TRANSPORT', 'EVENT'];
const AUDIENCES = [
  { value: 'PARENT', label: 'Parents' },
  { value: 'TEACHER', label: 'Teachers' },
  { value: 'STUDENT', label: 'Students' },
  { value: 'STAFF', label: 'Staff' },
];
const CHANNELS = [
  { value: 'IN_APP', label: 'In-app' },
  { value: 'PUSH', label: 'Push' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
];

export function AnnouncementComposer({ sections }: { sections: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('GENERAL');
  const [audience, setAudience] = useState<string[]>(['PARENT', 'TEACHER', 'STUDENT']);
  const [channels, setChannels] = useState<string[]>(['IN_APP']);
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [isPinned, setIsPinned] = useState(false);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  async function send() {
    setLoading(true);
    try {
      const res = await api.post<{ recipients: number }>('/api/school/announcements', {
        title,
        body,
        type,
        audience,
        channels,
        sectionIds,
        isPinned,
      });
      toast.success('Announcement published', `Delivered to ${res.recipients} recipient${res.recipients === 1 ? '' : 's'}.`);
      setOpen(false);
      setPreview(false);
      setTitle('');
      setBody('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Megaphone className="h-4 w-4" /> New announcement
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          setPreview(false);
        }}
        title={preview ? 'Preview announcement' : 'New announcement'}
        description={preview ? 'This is what recipients will see.' : 'Pick who should receive it and how.'}
        size="lg"
        footer={
          preview ? (
            <>
              <Button variant="outline" onClick={() => setPreview(false)}>
                Back to edit
              </Button>
              <Button onClick={send} loading={loading}>
                Publish now
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setPreview(true)} disabled={!title.trim() || !body.trim() || !audience.length}>
                <Eye className="h-4 w-4" /> Preview
              </Button>
            </>
          )
        }
      >
        {preview ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                <Badge tone={type === 'EMERGENCY' ? 'red' : 'slate'}>{type.toLowerCase()}</Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{body}</p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Audience</dt>
                <dd className="mt-1 capitalize text-slate-900">{audience.map((a) => a.toLowerCase()).join(', ')}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Classes</dt>
                <dd className="mt-1 text-slate-900">{sectionIds.length ? `${sectionIds.length} selected` : 'Whole school'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Channels</dt>
                <dd className="mt-1 text-slate-900">{channels.map((c) => c.replace('_', '-').toLowerCase()).join(', ')}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Title" required>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mid Term timetable published" />
            </Field>
            <Field label="Message" required>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Write the announcement…" />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                {TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>

            <div>
              <p className="label">Audience</p>
              <div className="flex flex-wrap gap-3">
                {AUDIENCES.map((a) => (
                  <Checkbox key={a.value} label={a.label} checked={audience.includes(a.value)} onChange={() => toggle(audience, setAudience, a.value)} />
                ))}
              </div>
            </div>

            <div>
              <p className="label">Channels</p>
              <div className="flex flex-wrap gap-3">
                {CHANNELS.map((c) => (
                  <Checkbox key={c.value} label={c.label} checked={channels.includes(c.value)} onChange={() => toggle(channels, setChannels, c.value)} />
                ))}
              </div>
            </div>

            {sections.length > 0 && (
              <div>
                <p className="label">Limit to specific classes</p>
                <p className="mb-2 text-xs text-slate-500">Leave all unchecked to send to the whole school.</p>
                <div className="flex max-h-32 flex-wrap gap-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
                  {sections.map((s) => (
                    <Checkbox key={s.id} label={s.label} checked={sectionIds.includes(s.id)} onChange={() => toggle(sectionIds, setSectionIds, s.id)} />
                  ))}
                </div>
              </div>
            )}

            <Checkbox label="Pin to the top of the notice board" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
          </div>
        )}
      </Modal>
    </>
  );
}
