'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Every role in the permission matrix, so each interface is reachable. */
const ACCOUNTS: [string, string][] = [
  ['Platform Super Admin', 'admin@schoolsphere.io'],
  ['Platform Support', 'support@schoolsphere.io'],
  ['School Admin', 'admin@dpa.edu'],
  ['Principal', 'principal@dpa.edu'],
  ['Class Teacher (5-A)', 'meera.iyer@dpa.edu'],
  ['Subject Teacher', 'rohit.verma@dpa.edu'],
  ['Staff — Receptionist', 'neha.kulkarni@dpa.edu'],
  ['Staff — Accountant', 'sanjay.gupta@dpa.edu'],
  ['Staff — Librarian', 'latha.krishnan@dpa.edu'],
  ['Student', 'aarav.sharma@dpa.edu'],
  ['Bus driver — Route A', '9860000001'],
  ['Bus driver — Route B', '9860000002'],
  ['Bus conductor — Route A', '9870000011'],
  ['Second school admin', 'admin@sunrise.edu'],
  ['Second school teacher', 'priya.shah@sunrise.edu'],
  ['Suspended school admin', 'admin@stmarys.edu'],
];

export function DemoAccounts() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Demo accounts
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-slate-200 px-4 py-3 text-sm">
          <p className="mb-2 text-xs text-slate-500">
            Every demo account uses the password <code className="rounded bg-slate-100 px-1 py-0.5">Password123!</code>
          </p>
          <ul className="divide-y divide-slate-100">
            {ACCOUNTS.map(([role, email]) => (
              <li key={email} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-slate-600">{role}</span>
                <code className="truncate text-xs text-slate-900">{email}</code>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2 text-xs text-slate-500">
            <p>
              Bus crew sign in with the mobile number shown and land on the driver console at{' '}
              <span className="font-medium">/driver</span>. The conductor can mark children on and off, but only the
              driver may start or end a trip.
            </p>
            <p>
              Parents sign in at <span className="font-medium">/parent-login</span> — “Delhi Public Academy” with{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">9810000001</code> (two children), or{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5">9812000001</code> for a limited-access grandparent.
            </p>
            <p>
              <span className="font-medium">admin@stmarys.edu</span> belongs to a suspended school — it is here so you
              can confirm the lockout works.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
