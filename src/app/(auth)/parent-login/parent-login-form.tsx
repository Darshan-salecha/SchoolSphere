'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { api, ApiRequestError } from '@/lib/client';

type School = { id: string; name: string; city: string | null };

export function ParentLoginForm({ schools }: { schools: School[] }) {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [schoolId, setSchoolId] = useState(schools[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ demoCode: string | null }>('/api/auth/otp/request', { schoolId, phone });
      setDemoCode(res.demoCode);
      setStep('code');
      setSeconds(60);
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ redirectTo: string }>('/api/auth/otp/verify', { schoolId, phone, code });
      router.push(res.redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (!schools.length) {
    return <p className="text-sm text-slate-500">No schools are available right now. Please contact your school office.</p>;
  }

  return (
    <form onSubmit={step === 'phone' ? requestCode : verify} className="space-y-4" noValidate>
      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Field label="Your child's school" required>
        <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={step === 'code'}>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.city ? ` — ${s.city}` : ''}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Registered mobile number" required hint="10 digits, as registered with the school">
        <Input
          inputMode="numeric"
          autoComplete="tel"
          maxLength={10}
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          disabled={step === 'code'}
          placeholder="9810000001"
          required
        />
      </Field>

      {step === 'code' && (
        <>
          <Field label="Verification code" required hint={`Sent to ${phone}. The code expires in 5 minutes.`}>
            <Input
              ref={codeRef}
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="text-center text-lg tracking-[0.4em]"
              required
            />
          </Field>
          {demoCode && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Demo mode — your code is <strong className="tracking-widest">{demoCode}</strong>
            </p>
          )}
        </>
      )}

      <Button type="submit" className="w-full" loading={loading}>
        {step === 'phone' ? 'Send verification code' : 'Verify and sign in'}
      </Button>

      {step === 'code' && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStep('phone');
              setCode('');
              setDemoCode(null);
            }}
            className="text-slate-500 hover:underline"
          >
            Change number
          </button>
          <button
            type="button"
            disabled={seconds > 0 || loading}
            onClick={() => requestCode()}
            className="font-medium text-brand-600 disabled:text-slate-400 disabled:no-underline hover:underline"
          >
            {seconds > 0 ? `Resend in ${seconds}s` : 'Resend code'}
          </button>
        </div>
      )}
    </form>
  );
}
