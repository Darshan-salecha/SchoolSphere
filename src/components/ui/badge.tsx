import { cn } from '@/lib/utils';

const tones = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  purple: 'bg-violet-50 text-violet-700 ring-violet-200',
} as const;

export type Tone = keyof typeof tones;

export function Badge({ children, tone = 'slate', className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'green',
  PRESENT: 'green',
  APPROVED: 'green',
  PAID: 'green',
  RESULTS_PUBLISHED: 'green',
  PENDING: 'amber',
  TRIAL: 'amber',
  LATE: 'amber',
  HALF_DAY: 'amber',
  PARTIAL: 'amber',
  DRAFT: 'slate',
  SCHEDULED: 'blue',
  ONGOING: 'blue',
  SUBMITTED: 'blue',
  EXCUSED: 'blue',
  COMPLETED: 'brand',
  GRADED: 'brand',
  ABSENT: 'red',
  SUSPENDED: 'red',
  OVERDUE: 'red',
  REJECTED: 'red',
  CANCELLED: 'red',
  PAST_DUE: 'red',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'slate'}>{status.replaceAll('_', ' ').toLowerCase()}</Badge>;
}
