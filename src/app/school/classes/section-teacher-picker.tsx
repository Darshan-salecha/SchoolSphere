'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

export function SectionTeacherPicker({
  sectionId,
  current,
  currentName,
  options,
}: {
  sectionId: string;
  current: string | null;
  currentName: string | null;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState(current ?? '');

  async function onChange(next: string) {
    setValue(next);
    setSaving(true);
    try {
      await api.patch('/api/school/sections', { id: sectionId, classTeacherId: next || null });
      toast.success('Class teacher updated');
      router.refresh();
    } catch (err) {
      setValue(current ?? '');
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!options.length) return <span className="text-sm text-slate-500">{currentName ?? '—'}</span>;

  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} disabled={saving} className="min-w-[180px] py-1.5 text-xs">
      <option value="">— unassigned —</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
