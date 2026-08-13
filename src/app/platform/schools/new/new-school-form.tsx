'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

type Plan = { code: string; name: string; maxStudents: number };
type Errors = Record<string, string[]>;

const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'IGCSE'];
const TYPES = ['Pre-primary', 'Primary', 'Secondary', 'Senior Secondary', 'K-12'];

export function NewSchoolForm({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const toast = useToast();
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors({});
    setBanner(null);
    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const res = await api.post<{ id: string }>('/api/platform/schools', payload);
      toast.success('School created', 'The admin can sign in with the credentials you set.');
      router.push(`/platform/schools/${res.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setErrors(err.details ?? {});
        setBanner(err.message);
      } else {
        setBanner('Something went wrong. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {banner && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {banner}
        </div>
      )}

      <Card>
        <CardHeader title="School details" description="This information appears on report cards, receipts and the parent portal." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="School name" required error={errors.name} className="sm:col-span-2">
            <Input name="name" required placeholder="Delhi Public Academy" />
          </Field>
          <Field label="Registration number" error={errors.registrationNumber}>
            <Input name="registrationNumber" placeholder="DL/EDU/2009/4471" />
          </Field>
          <Field label="Official email" required error={errors.email}>
            <Input name="email" type="email" required placeholder="office@school.edu" />
          </Field>
          <Field label="Phone" error={errors.phone}>
            <Input name="phone" placeholder="01145670000" />
          </Field>
          <Field label="Website" error={errors.website}>
            <Input name="website" placeholder="https://school.edu" />
          </Field>
          <Field label="Address" error={errors.addressLine} className="sm:col-span-2">
            <Input name="addressLine" placeholder="12 Rajpath Marg, Sector 14" />
          </Field>
          <Field label="City" error={errors.city}>
            <Input name="city" placeholder="New Delhi" />
          </Field>
          <Field label="State" error={errors.state}>
            <Input name="state" placeholder="Delhi" />
          </Field>
          <Field label="Postal code" error={errors.postalCode}>
            <Input name="postalCode" placeholder="110001" />
          </Field>
          <Field label="Country" error={errors.country}>
            <Input name="country" defaultValue="India" />
          </Field>
          <Field label="Principal name" error={errors.principalName}>
            <Input name="principalName" placeholder="Dr. Sunita Rao" />
          </Field>
          <Field label="School type" error={errors.schoolType}>
            <Select name="schoolType" defaultValue="K-12">
              {TYPES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Board" error={errors.board}>
            <Select name="board" defaultValue="CBSE">
              {BOARDS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="Medium of instruction" error={errors.medium}>
            <Select name="medium" defaultValue="English">
              <option>English</option>
              <option>Hindi</option>
              <option>Bilingual</option>
            </Select>
          </Field>
          <Field label="Timezone" error={errors.timezone}>
            <Select name="timezone" defaultValue="Asia/Kolkata">
              {['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'UTC'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Subscription" description="Starts a 30-day trial. You can change the plan at any time." />
        <CardBody>
          <Field label="Plan" error={errors.planCode} className="sm:max-w-sm">
            <Select name="planCode" defaultValue={plans[1]?.code ?? plans[0]?.code}>
              {plans.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.name} — up to {p.maxStudents.toLocaleString('en-IN')} students
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="First school admin" description="This person completes the setup wizard and invites everyone else." />
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <Field label="Full name" required error={errors.adminName}>
            <Input name="adminName" required placeholder="Ananya Desai" />
          </Field>
          <Field label="Email" required error={errors.adminEmail}>
            <Input name="adminEmail" type="email" required placeholder="admin@school.edu" />
          </Field>
          <Field label="Temporary password" required error={errors.adminPassword} hint="At least 8 characters">
            <Input name="adminPassword" type="password" required minLength={8} />
          </Field>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={loading}>
          Create school
        </Button>
      </div>
    </form>
  );
}
