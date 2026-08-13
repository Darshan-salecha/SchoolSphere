import { School } from 'lucide-react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-slate-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500">
            <School className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold">SchoolSphere</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">One platform for every school you run.</h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Admissions, attendance, timetables, exams, fees and transport — with strict tenant isolation, granular
            permissions and a parent portal families actually enjoy using.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4 text-sm">
            {[
              ['Isolated', 'per-school data'],
              ['Granular', 'role permissions'],
              ['Mobile', 'first by design'],
            ].map(([a, b]) => (
              <div key={a}>
                <dt className="font-semibold text-white">{a}</dt>
                <dd className="text-slate-400">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} SchoolSphere</p>
      </div>
      <div className="flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
