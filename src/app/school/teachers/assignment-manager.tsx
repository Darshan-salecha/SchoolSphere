'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Settings2, X } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Select } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

type Option = { value: string; label: string };

export function AssignmentManager({
  teacherId,
  teacherName,
  assignments,
  sections,
  subjects,
}: {
  teacherId: string;
  teacherName: string;
  assignments: { id: string; label: string; isClassTeacher: boolean }[];
  sections: Option[];
  subjects: Option[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sectionId, setSectionId] = useState(sections[0]?.value ?? '');
  const [subjectId, setSubjectId] = useState(subjects[0]?.value ?? '');
  const [isClassTeacher, setIsClassTeacher] = useState(false);

  async function add() {
    setLoading(true);
    try {
      await api.post('/api/school/teacher-assignments', {
        teacherId,
        sectionId,
        subjectId: isClassTeacher ? null : subjectId,
        isClassTeacher,
      });
      toast.success('Assignment added');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.del(`/api/school/teacher-assignments?id=${id}`);
      toast.success('Assignment removed');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Manage assignments for ${teacherName}`}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Assignments — ${teacherName}`}
        description="A teacher can only see and act on the sections assigned here."
        footer={<Button variant="outline" onClick={() => setOpen(false)}>Done</Button>}
      >
        <div className="space-y-5">
          <div>
            <p className="label">Current assignments</p>
            {assignments.length === 0 ? (
              <p className="text-sm text-slate-500">No assignments yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {assignments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm text-slate-700">
                      {a.label}
                      {a.isClassTeacher && <Badge tone="green">Class teacher</Badge>}
                    </span>
                    <button onClick={() => remove(a.id)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600" aria-label="Remove assignment">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4">
            <p className="label">Add an assignment</p>
            <Field label="Section">
              <Select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                {sections.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            {!isClassTeacher && (
              <Field label="Subject">
                <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                  {subjects.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Checkbox
              label="Make class teacher of this section (full section access)"
              checked={isClassTeacher}
              onChange={(e) => setIsClassTeacher(e.target.checked)}
            />
            <Button onClick={add} loading={loading} disabled={!sectionId}>
              Add assignment
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
