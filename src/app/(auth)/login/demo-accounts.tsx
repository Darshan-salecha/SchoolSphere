'use client';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCOUNTS = [
  ['Platform Super Admin', 'admin@schoolsphere.io'],
  ['School Admin', 'admin@dpa.edu'],
  ['Principal', 'principal@dpa.edu'],
  ['Class Teacher (5-A)', 'meera.iyer@dpa.edu'],
  ['Teacher', 'rohit.verma@dpa.edu'],
  ['Student', 'aarav.sharma@dpa.edu'],
  ['Second school admin', 'admin@sunrise.edu'],
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
          <p className="mt-3 text-xs text-slate-500">
            Parents sign in at <span className="font-medium">/parent-login</span> — try school “Delhi Public Academy”
            with mobile <code className="rounded bg-slate-100 px-1 py-0.5">9810000001</code>.
          </p>
        </div>
      )}
    </div>
  );
}
