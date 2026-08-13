import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="table-wrap">
      <table className={cn('w-full min-w-[640px] border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">{children}</thead>;
}

export function TH({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('whitespace-nowrap px-4 py-3 font-medium', className)}>{children}</th>;
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function TR({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn('hover:bg-slate-50/70', className)}>{children}</tr>;
}

export function TD({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle text-slate-700', className)}>{children}</td>;
}

export function Pagination({
  page,
  totalPages,
  total,
  baseHref,
}: {
  page: number;
  totalPages: number;
  total: number;
  baseHref: string;
}) {
  if (total === 0) return null;
  const link = (p: number) => `${baseHref}${baseHref.includes('?') ? '&' : '?'}page=${p}`;
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm text-slate-600">
      <span>
        Page {page} of {totalPages} · {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex gap-2">
        <Link
          href={link(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={cn(
            'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50',
            page <= 1 && 'pointer-events-none opacity-50',
          )}
        >
          Previous
        </Link>
        <Link
          href={link(Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={cn(
            'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50',
            page >= totalPages && 'pointer-events-none opacity-50',
          )}
        >
          Next
        </Link>
      </div>
    </nav>
  );
}
