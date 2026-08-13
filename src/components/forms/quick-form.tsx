'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

export type FieldSpec = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'time' | 'select' | 'textarea' | 'checkbox' | 'tel';
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number | boolean;
  colSpan?: 1 | 2;
  min?: number;
  max?: number;
  maxLength?: number;
};

/**
 * One modal form used across the admin modules. Keeps every create/edit dialog
 * consistent — same validation surfacing, same loading and error states.
 */
export function QuickForm({
  title,
  description,
  endpoint,
  method = 'POST',
  fields,
  triggerLabel,
  submitLabel = 'Save',
  successMessage,
  size = 'md',
  variant = 'primary',
  disabled,
  disabledHint,
  onDone,
}: {
  title: string;
  description?: string;
  endpoint: string;
  method?: 'POST' | 'PATCH' | 'PUT';
  fields: FieldSpec[];
  triggerLabel: string;
  submitLabel?: string;
  successMessage?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'outline' | 'secondary';
  disabled?: boolean;
  disabledHint?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setBanner(null);
    setErrors({});
    const form = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = form.get(f.name);
      if (f.type === 'checkbox') payload[f.name] = raw === 'on';
      else if (f.type === 'number') payload[f.name] = raw === '' || raw === null ? undefined : Number(raw);
      else payload[f.name] = raw === '' ? undefined : raw;
    }
    try {
      await api[method === 'POST' ? 'post' : method === 'PATCH' ? 'patch' : 'put'](endpoint, payload);
      toast.success(successMessage ?? 'Saved');
      setOpen(false);
      onDone?.();
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.details ?? {});
        setBanner(err.message);
      } else setBanner('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)} disabled={disabled} title={disabled ? disabledHint : undefined}>
        <Plus className="h-4 w-4" /> {triggerLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        size={size}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="quick-form" loading={loading}>
              {submitLabel}
            </Button>
          </>
        }
      >
        <form id="quick-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
          {banner && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">
              {banner}
            </div>
          )}
          {fields.map((f) => (
            <Field
              key={f.name}
              label={f.type === 'checkbox' ? undefined : f.label}
              required={f.required}
              error={errors[f.name]}
              hint={f.hint}
              className={f.colSpan === 2 || f.type === 'textarea' ? 'sm:col-span-2' : undefined}
            >
              {f.type === 'select' ? (
                <Select name={f.name} defaultValue={f.defaultValue as string} required={f.required}>
                  {!f.required && <option value="">— none —</option>}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.type === 'textarea' ? (
                <Textarea name={f.name} placeholder={f.placeholder} required={f.required} defaultValue={f.defaultValue as string} />
              ) : f.type === 'checkbox' ? (
                <Checkbox name={f.name} label={f.label} defaultChecked={Boolean(f.defaultValue)} />
              ) : (
                <Input
                  name={f.name}
                  type={f.type ?? 'text'}
                  placeholder={f.placeholder}
                  required={f.required}
                  defaultValue={f.defaultValue as string}
                  min={f.min}
                  max={f.max}
                  maxLength={f.maxLength}
                />
              )}
            </Field>
          ))}
        </form>
      </Modal>
    </>
  );
}
