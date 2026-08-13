'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Check, Clock, X, CircleSlash, Timer, Save } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { cn, percent } from '@/lib/utils';

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'EXCUSED';
type Student = { studentId: string; firstName: string; lastName: string; rollNumber: number | null; photoUrl: string | null };

const OPTIONS: { value: Status; label: string; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { value: 'PRESENT', label: 'Present', icon: Check, tone: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'ABSENT', label: 'Absent', icon: X, tone: 'bg-rose-600 text-white border-rose-600' },
  { value: 'LATE', label: 'Late', icon: Clock, tone: 'bg-amber-500 text-white border-amber-500' },
  { value: 'HALF_DAY', label: 'Half day', icon: Timer, tone: 'bg-sky-600 text-white border-sky-600' },
  { value: 'EXCUSED', label: 'Excused', icon: CircleSlash, tone: 'bg-violet-600 text-white border-violet-600' },
];

export function AttendanceBoard({
  sections,
  sectionId,
  date,
  students,
  existing,
  canMark,
  canEditPast,
  editWindowHours,
}: {
  sections: { id: string; label: string }[];
  sectionId: string;
  date: string;
  students: Student[];
  existing: { studentId: string; status: Status }[];
  canMark: boolean;
  canEditPast: boolean;
  editWindowHours: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const initial = useMemo(() => {
    const map: Record<string, Status> = {};
    for (const s of students) map[s.studentId] = 'PRESENT';
    for (const e of existing) map[e.studentId] = e.status;
    return map;
  }, [students, existing]);

  const [marks, setMarks] = useState<Record<string, Status>>(initial);
  const [saving, setSaving] = useState(false);

  const stale = date < today && !canEditPast && Date.now() - new Date(date).getTime() > editWindowHours * 3600_000;
  const readOnly = !canMark || stale;

  const counts = OPTIONS.map((o) => ({ ...o, count: Object.values(marks).filter((v) => v === o.value).length }));
  const presentish = counts.filter((c) => ['PRESENT', 'LATE', 'HALF_DAY'].includes(c.value)).reduce((a, b) => a + b.count, 0);

  function navigate(next: { sectionId?: string; date?: string }) {
    const q = new URLSearchParams({ sectionId: next.sectionId ?? sectionId, date: next.date ?? date });
    router.push(`${pathname}?${q.toString()}`);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await api.post<{ saved: number; notified: number }>('/api/school/attendance', {
        sectionId,
        date,
        entries: students.map((s) => ({ studentId: s.studentId, status: marks[s.studentId] ?? 'PRESENT' })),
      });
      toast.success(
        `Attendance saved for ${res.saved} students`,
        res.notified ? `${res.notified} guardian${res.notified === 1 ? '' : 's'} notified of an absence.` : undefined,
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Class">
            <Select value={sectionId} onChange={(e) => navigate({ sectionId: e.target.value })}>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" hint={date === today ? "Today's register" : 'Viewing a past day'}>
            <Input type="date" value={date} max={today} onChange={(e) => navigate({ date: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <div className="w-full rounded-lg bg-slate-50 px-4 py-2.5">
              <p className="text-xs text-slate-500">Attendance today</p>
              <p className="text-lg font-semibold text-slate-900">
                {percent(presentish, students.length)}%
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {presentish}/{students.length} present
                </span>
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      {stale && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          The {editWindowHours}-hour edit window for this date has closed. Ask a school administrator to make corrections.
        </div>
      )}

      <Card>
        <CardHeader
          title={`Register — ${sections.find((s) => s.id === sectionId)?.label ?? ''}`}
          description={`${students.length} students`}
          action={
            !readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.studentId, 'PRESENT' as Status])))}
                >
                  Mark all present
                </Button>
                <Button size="sm" onClick={save} loading={saving}>
                  <Save className="h-4 w-4" /> Save register
                </Button>
              </div>
            )
          }
        />

        {students.length === 0 ? (
          <EmptyState title="No students in this class" description="Enrol students into this section to start marking attendance." />
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
              {counts.map((c) => (
                <span key={c.value} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                  {c.label}: {c.count}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-slate-100">
              {students.map((s) => (
                <li key={s.studentId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="w-8 shrink-0 text-sm text-slate-400">{s.rollNumber ?? '—'}</span>
                  <Avatar name={`${s.firstName} ${s.lastName}`} src={s.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                    {s.firstName} {s.lastName}
                  </span>
                  <div className="flex flex-wrap gap-1" role="group" aria-label={`Attendance for ${s.firstName}`}>
                    {OPTIONS.map((o) => {
                      const active = (marks[s.studentId] ?? 'PRESENT') === o.value;
                      const Icon = o.icon;
                      return (
                        <button
                          key={o.value}
                          type="button"
                          disabled={readOnly}
                          aria-pressed={active}
                          onClick={() => setMarks((m) => ({ ...m, [s.studentId]: o.value }))}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60',
                            active ? o.tone : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">{o.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
