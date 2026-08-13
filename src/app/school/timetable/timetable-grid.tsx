'use client';
import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { Card, CardBody } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { DAYS } from '@/lib/calendar';
import { cn } from '@/lib/utils';

type Period = { id: string; name: string; order: number; startTime: string; endTime: string; isBreak: boolean };
type Slot = {
  dayOfWeek: number;
  periodId: string;
  subjectId: string | null;
  subjectName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  room: string | null;
};
type Option = { value: string; label: string };

export function TimetableGrid({
  sections,
  sectionId,
  periods,
  slots,
  subjects,
  teachers,
  canManage,
}: {
  sections: { id: string; label: string }[];
  sectionId: string;
  periods: Period[];
  slots: Slot[];
  subjects: Option[];
  teachers: Option[];
  canManage: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [editing, setEditing] = useState<{ day: number; period: Period; slot?: Slot } | null>(null);
  const [loading, setLoading] = useState(false);

  const byKey = new Map(slots.map((s) => [`${s.dayOfWeek}:${s.periodId}`, s]));

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      await api.post('/api/school/timetable', {
        sectionId,
        periodId: editing.period.id,
        dayOfWeek: editing.day,
        subjectId: form.get('subjectId') || null,
        teacherId: form.get('teacherId') || null,
        room: form.get('room') || '',
      });
      toast.success('Timetable updated');
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card className="mb-4">
        <CardBody>
          <Field label="Class" className="sm:max-w-xs">
            <Select
              value={sectionId}
              onChange={(e) => router.push(`${pathname}?sectionId=${e.target.value}`)}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <div className="table-wrap">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-40 px-4 py-3 font-medium">Period</th>
              {DAYS.map((d) => (
                <th key={d.value} className="px-3 py-3 font-medium">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {periods.map((p) => (
              <tr key={p.id} className={p.isBreak ? 'bg-slate-50/60' : undefined}>
                <td className="px-4 py-2 align-top">
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.startTime}–{p.endTime}
                  </p>
                </td>
                {DAYS.map((d) => {
                  const slot = byKey.get(`${d.value}:${p.id}`);
                  if (p.isBreak) {
                    return (
                      <td key={d.value} className="px-3 py-2 text-center text-xs italic text-slate-400">
                        {p.name}
                      </td>
                    );
                  }
                  return (
                    <td key={d.value} className="px-2 py-2 align-top">
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => canManage && setEditing({ day: d.value, period: p, slot })}
                        className={cn(
                          'w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
                          slot?.subjectName
                            ? 'border-brand-200 bg-brand-50/60 hover:bg-brand-100/60'
                            : 'border-dashed border-slate-200 text-slate-400 hover:bg-slate-50',
                          !canManage && 'cursor-default',
                        )}
                      >
                        {slot?.subjectName ? (
                          <>
                            <span className="block truncate text-xs font-semibold text-slate-900">{slot.subjectName}</span>
                            <span className="block truncate text-[11px] text-slate-500">{slot.teacherName ?? 'No teacher'}</span>
                            {slot.room && <span className="block text-[11px] text-slate-400">Room {slot.room}</span>}
                          </>
                        ) : (
                          <span className="text-xs">{canManage ? '+ Add' : '—'}</span>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `${DAYS.find((d) => d.value === editing.day)?.label} · ${editing.period.name}` : ''}
        description="Leave the subject empty to clear this slot."
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="slot-form" loading={loading}>
              Save slot
            </Button>
          </>
        }
      >
        <form id="slot-form" onSubmit={save} className="space-y-4">
          <Field label="Subject">
            <Select name="subjectId" defaultValue={editing?.slot?.subjectId ?? ''}>
              <option value="">— free period —</option>
              {subjects.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teacher" hint="Clashes with another class are rejected.">
            <Select name="teacherId" defaultValue={editing?.slot?.teacherId ?? ''}>
              <option value="">— unassigned —</option>
              {teachers.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Room">
            <Input name="room" defaultValue={editing?.slot?.room ?? ''} placeholder="501" />
          </Field>
        </form>
      </Modal>
    </>
  );
}
