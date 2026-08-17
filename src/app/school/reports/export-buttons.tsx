'use client';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BASE = [
  { dataset: 'students', label: 'Students' },
  { dataset: 'attendance', label: 'Attendance' },
  { dataset: 'results', label: 'Results' },
];

/** CSV downloads. Excel and Sheets both open these natively. */
export function ExportButtons({ canFees, canTransport }: { canFees: boolean; canTransport: boolean }) {
  const datasets = [
    ...BASE,
    ...(canFees ? [{ dataset: 'fees', label: 'Fees' }] : []),
    ...(canTransport ? [{ dataset: 'transport', label: 'Transport' }] : []),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {datasets.map((d) => (
        <a
          key={d.dataset}
          href={`/api/school/export?dataset=${d.dataset}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> {d.label}
        </a>
      ))}
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" /> Print
      </Button>
    </div>
  );
}
