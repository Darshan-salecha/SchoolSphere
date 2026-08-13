'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Save } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';

type Settings = {
  attendanceEditWindowHours: number;
  lowAttendanceThreshold: number;
  notifyParentOnAbsence: boolean;
  studentLoginEnabled: boolean;
  parentOtpEnabled: boolean;
  resultsRequireApproval: boolean;
  primaryColor: string;
  accentColor: string;
};

export function SettingsForm({ settings, canManage }: { settings: Settings; canManage: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [values, setValues] = useState(settings);
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function save() {
    setLoading(true);
    try {
      await api.patch('/api/school/settings', values);
      toast.success('Settings saved');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Attendance" description="How the register behaves day to day." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Edit window (hours)" hint="How long teachers can correct a past register without an admin.">
            <Input
              type="number"
              min={0}
              max={720}
              disabled={!canManage}
              value={values.attendanceEditWindowHours}
              onChange={(e) => set('attendanceEditWindowHours', Number(e.target.value))}
            />
          </Field>
          <Field label="Low attendance threshold (%)" hint="Students below this are flagged on dashboards.">
            <Input
              type="number"
              min={0}
              max={100}
              disabled={!canManage}
              value={values.lowAttendanceThreshold}
              onChange={(e) => set('lowAttendanceThreshold', Number(e.target.value))}
            />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              label="Notify guardians automatically when a student is marked absent"
              disabled={!canManage}
              checked={values.notifyParentOnAbsence}
              onChange={(e) => set('notifyParentOnAbsence', e.target.checked)}
            />
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Access" description="Who can sign in, and how." />
        <CardBody className="space-y-3">
          <Checkbox
            label="Allow parents to sign in with mobile number and OTP"
            disabled={!canManage}
            checked={values.parentOtpEnabled}
            onChange={(e) => set('parentOtpEnabled', e.target.checked)}
          />
          <Checkbox
            label="Enable the student portal"
            disabled={!canManage}
            checked={values.studentLoginEnabled}
            onChange={(e) => set('studentLoginEnabled', e.target.checked)}
          />
          <Checkbox
            label="Require principal approval before results are published"
            disabled={!canManage}
            checked={values.resultsRequireApproval}
            onChange={(e) => set('resultsRequireApproval', e.target.checked)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Branding" description="Used on the portal, report cards and receipts." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary colour">
            <Input type="color" disabled={!canManage} value={values.primaryColor} onChange={(e) => set('primaryColor', e.target.value)} className="h-10 p-1" />
          </Field>
          <Field label="Accent colour">
            <Input type="color" disabled={!canManage} value={values.accentColor} onChange={(e) => set('accentColor', e.target.value)} className="h-10 p-1" />
          </Field>
        </CardBody>
      </Card>

      {canManage && (
        <div className="flex justify-end">
          <Button onClick={save} loading={loading}>
            <Save className="h-4 w-4" /> Save settings
          </Button>
        </div>
      )}
    </div>
  );
}
