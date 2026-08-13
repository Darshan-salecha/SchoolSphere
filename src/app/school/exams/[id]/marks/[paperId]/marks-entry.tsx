'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Checkbox } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { gradeFor } from '@/lib/utils';

type Student = { studentId: string; firstName: string; lastName: string; rollNumber: number | null };
type Entry = { marks: string; absent: boolean };

export function MarksEntry({
  paperId,
  maxMarks,
  passingMarks,
  students,
  existing,
  locked,
  canEnter,
}: {
  paperId: string;
  maxMarks: number;
  passingMarks: number;
  students: Student[];
  existing: { studentId: string; marksObtained: number | null; isAbsent: boolean }[];
  locked: boolean;
  canEnter: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const initial = useMemo(() => {
    const map: Record<string, Entry> = {};
    for (const s of students) map[s.studentId] = { marks: '', absent: false };
    for (const m of existing) {
      map[m.studentId] = { marks: m.marksObtained == null ? '' : String(m.marksObtained), absent: m.isAbsent };
    }
    return map;
  }, [students, existing]);

  const [entries, setEntries] = useState<Record<string, Entry>>(initial);
  const [saving, setSaving] = useState(false);

  const readOnly = locked || !canEnter;
  const entered = Object.values(entries).filter((e) => e.absent || e.marks !== '').length;
  const invalid = Object.values(entries).some(
    (e) => !e.absent && e.marks !== '' && (Number(e.marks) < 0 || Number(e.marks) > maxMarks || Number.isNaN(Number(e.marks))),
  );

  async function save() {
    setSaving(true);
    try {
      const res = await api.post<{ saved: number }>('/api/school/marks', {
        examSubjectId: paperId,
        entries: students
          .filter((s) => entries[s.studentId].absent || entries[s.studentId].marks !== '')
          .map((s) => ({
            studentId: s.studentId,
            marksObtained: entries[s.studentId].absent ? null : Number(entries[s.studentId].marks),
            isAbsent: entries[s.studentId].absent,
          })),
      });
      toast.success(`Marks saved for ${res.saved} students`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!students.length) {
    return (
      <div className="card">
        <EmptyState title="No students in this class" description="Enrol students before entering marks." />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Marks entry"
        description={`${entered} of ${students.length} entered`}
        action={
          !readOnly && (
            <Button onClick={save} loading={saving} disabled={invalid}>
              <Save className="h-4 w-4" /> Save marks
            </Button>
          )
        }
      />

      {locked && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800">
          Results for this exam are published, so marks are locked. An administrator can unpublish to reopen entry.
        </div>
      )}

      <ul className="divide-y divide-slate-100">
        {students.map((s) => {
          const entry = entries[s.studentId];
          const value = Number(entry.marks);
          const hasValue = !entry.absent && entry.marks !== '' && !Number.isNaN(value);
          const outOfRange = hasValue && (value < 0 || value > maxMarks);
          return (
            <li key={s.studentId} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="w-8 shrink-0 text-sm text-slate-400">{s.rollNumber ?? '—'}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                {s.firstName} {s.lastName}
              </span>
              <div className="flex items-center gap-3">
                <div className="w-28">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={maxMarks}
                    disabled={readOnly || entry.absent}
                    value={entry.marks}
                    placeholder={`/ ${maxMarks}`}
                    aria-label={`Marks for ${s.firstName}`}
                    aria-invalid={outOfRange}
                    onChange={(e) => setEntries((m) => ({ ...m, [s.studentId]: { ...m[s.studentId], marks: e.target.value } }))}
                    className={outOfRange ? 'border-rose-400' : undefined}
                  />
                </div>
                <Checkbox
                  label="Absent"
                  disabled={readOnly}
                  checked={entry.absent}
                  onChange={(e) => setEntries((m) => ({ ...m, [s.studentId]: { marks: '', absent: e.target.checked } }))}
                />
                <span className="w-20 text-right">
                  {entry.absent ? (
                    <Badge tone="slate">AB</Badge>
                  ) : hasValue && !outOfRange ? (
                    <Badge tone={value >= passingMarks ? 'green' : 'red'}>{gradeFor((value / maxMarks) * 100)}</Badge>
                  ) : outOfRange ? (
                    <span className="text-xs font-medium text-rose-600">0–{maxMarks}</span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
