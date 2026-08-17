'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FileUp, FileText, Award, Download } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field, Input, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { formatDate } from '@/lib/utils';

const CATEGORIES = [
  'BIRTH_CERTIFICATE',
  'ID_PROOF',
  'TRANSFER_CERTIFICATE',
  'PREVIOUS_MARKSHEET',
  'MEDICAL',
  'PHOTO',
  'OTHER',
];

const CERTIFICATES = [
  { value: 'BONAFIDE', label: 'Bonafide certificate' },
  { value: 'TRANSFER', label: 'Transfer certificate' },
  { value: 'CHARACTER', label: 'Character certificate' },
  { value: 'ACHIEVEMENT', label: 'Achievement certificate' },
  { value: 'PARTICIPATION', label: 'Participation certificate' },
];

type Doc = { id: string; title: string; category: string; mimeType: string | null; createdAt: Date };
type Cert = { id: string; type: string; serialNumber: string; body: string; issuedAt: Date };

export function StudentFiles({
  studentId,
  documents,
  certificates,
  canManage,
}: {
  studentId: string;
  documents: Doc[];
  certificates: Cert[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.set('studentId', studentId);
    try {
      const res = await fetch('/api/school/documents', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Upload failed');
      toast.success('Document uploaded');
      setUploadOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That upload did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function issue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/api/school/certificates', {
        studentId,
        type: form.get('type'),
        note: form.get('note') || undefined,
      });
      toast.success('Certificate issued');
      setCertOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Documents"
          description="Private — only staff and this child's guardians can open them"
          action={canManage ? <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}><FileUp className="h-4 w-4" /> Upload</Button> : undefined}
        />
        <CardBody className="space-y-2">
          {documents.length === 0 && <p className="text-sm text-slate-500">No documents on file.</p>}
          {documents.map((d) => (
            <a
              key={d.id}
              href={`/api/files/${d.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{d.title}</span>
                <span className="block text-xs text-slate-500">
                  {d.category.replaceAll('_', ' ').toLowerCase()} · {formatDate(d.createdAt)}
                </span>
              </span>
              <Download className="h-4 w-4 shrink-0 text-slate-400" />
            </a>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Certificates"
          description="Issued wording is frozen at the moment of issue"
          action={canManage ? <Button size="sm" variant="outline" onClick={() => setCertOpen(true)}><Award className="h-4 w-4" /> Issue</Button> : undefined}
        />
        <CardBody className="space-y-2">
          {certificates.length === 0 && <p className="text-sm text-slate-500">No certificates issued.</p>}
          {certificates.map((c) => (
            <div key={c.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium capitalize text-slate-900">{c.type.toLowerCase()}</span>
                <Badge tone="slate">{c.serialNumber}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-slate-600">{c.body}</p>
              <p className="mt-1 text-xs text-slate-400">{formatDate(c.issuedAt)}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload a document"
        description="PDF, JPEG, PNG or WebP up to 8 MB."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button type="submit" form="doc-form" loading={busy}>Upload</Button>
          </>
        }
      >
        <form id="doc-form" onSubmit={upload} className="space-y-4">
          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <Field label="Title" required>
            <Input name="title" required placeholder="Birth certificate" />
          </Field>
          <Field label="Category" required>
            <Select name="category" defaultValue="OTHER">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.replaceAll('_', ' ').toLowerCase()}</option>
              ))}
            </Select>
          </Field>
          <Field label="File" required>
            <Input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required />
          </Field>
        </form>
      </Modal>

      <Modal
        open={certOpen}
        onClose={() => setCertOpen(false)}
        title="Issue a certificate"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCertOpen(false)}>Cancel</Button>
            <Button type="submit" form="cert-form" loading={busy}>Issue</Button>
          </>
        }
      >
        <form id="cert-form" onSubmit={issue} className="space-y-4">
          {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <Field label="Certificate type" required>
            <Select name="type" defaultValue="BONAFIDE">
              {CERTIFICATES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="For (optional)" hint="Used by achievement and participation certificates">
            <Input name="note" placeholder="the inter-school science exhibition" />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
