import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <div className="text-center">
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">We couldn&apos;t find that page</h1>
        <p className="mt-2 text-sm text-slate-500">It may have moved, or you may not have access to it.</p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Back to my dashboard
        </Link>
      </div>
    </div>
  );
}
