'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Download, FileUp, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { STUDENT_IMPORT_TEMPLATE } from '@/lib/csv';

type RowResult = { line: number; admissionNumber: string; name: string; section: string; guardian: string; status: 'ready' | 'duplicate' | 'error'; message?: string };
type Summary = { total: number; ready: number; duplicates: number; errors: number };

export function ImportWizard({ sections }: { sections: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(false);

  function downloadTemplate() {
    const blob = new Blob([STUDENT_IMPORT_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schoolsphere-students-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    setResults(null);
    setSummary(null);
    setImported(false);
  }

  async function run(commit: boolean) {
    setLoading(true);
    try {
      const res = await api.post<{ summary: Summary; results: RowResult[]; imported?: number }>('/api/school/students/import', { csv, commit });
      setSummary(res.summary);
      setResults(res.results);
      if (commit) {
        setImported(true);
        toast.success(`Imported ${res.imported ?? 0} students`, 'Guardians were linked where a phone number was supplied.');
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="1. Prepare your file" description="Class and section names must match exactly." />
        <CardBody className="space-y-4">
          <Button variant="outline" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Download CSV template
          </Button>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">Sections available in the current academic year</p>
            <p className="mt-1">{sections.length ? sections.join(' · ') : 'No sections yet — create one first.'}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="2. Upload and preview" description="We validate every row before anything is written." />
        <CardBody className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center hover:border-brand-400 hover:bg-brand-50/40">
            <FileUp className="h-6 w-6 text-slate-400" />
            <span className="mt-2 text-sm font-medium text-slate-700">{fileName || 'Choose a CSV file'}</span>
            <span className="mt-1 text-xs text-slate-500">Only .csv files are accepted</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
          </label>
          <Button onClick={() => run(false)} disabled={!csv} loading={loading && !imported}>
            Validate file
          </Button>
        </CardBody>
      </Card>

      {summary && results && (
        <Card>
          <CardHeader
            title="3. Review and confirm"
            description={`${summary.ready} ready · ${summary.duplicates} duplicates · ${summary.errors} errors`}
            action={
              !imported ? (
                <Button onClick={() => run(true)} loading={loading} disabled={summary.ready === 0}>
                  Import {summary.ready} student{summary.ready === 1 ? '' : 's'}
                </Button>
              ) : (
                <Badge tone="green">Imported</Badge>
              )
            }
          />
          <Table>
            <THead>
              <TR>
                <TH>Line</TH>
                <TH>Admission no.</TH>
                <TH>Name</TH>
                <TH>Section</TH>
                <TH>Guardian</TH>
                <TH>Result</TH>
              </TR>
            </THead>
            <TBody>
              {results.map((r) => (
                <TR key={r.line}>
                  <TD className="text-slate-400">{r.line}</TD>
                  <TD><code className="text-xs">{r.admissionNumber || '—'}</code></TD>
                  <TD className="font-medium text-slate-900">{r.name || '—'}</TD>
                  <TD>{r.section}</TD>
                  <TD className="text-slate-500">{r.guardian || '—'}</TD>
                  <TD>
                    <span className="flex items-center gap-1.5">
                      {r.status === 'ready' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      {r.status === 'duplicate' && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                      {r.status === 'error' && <XCircle className="h-4 w-4 text-rose-600" />}
                      <span className="text-xs text-slate-600">{r.message ?? 'Ready to import'}</span>
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
