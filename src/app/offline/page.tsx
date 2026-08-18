import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Offline — SchoolSphere' };

/**
 * Served by the service worker when a navigation fails.
 *
 * "The navigation failed" is not the same as "this device has no signal" — a
 * server that is down, or a TLS certificate the browser will not accept, lands
 * here too. So the copy stays neutral and there is always a way back, rather
 * than telling someone to check a connection that was never the problem.
 */
export default function OfflinePage() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
          <WifiOff className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">Can&rsquo;t reach SchoolSphere</h1>
        <p className="mt-2 text-sm text-slate-500">
          Live attendance, fees and bus positions all need a connection to the school&rsquo;s server. This usually means
          the device is offline, but it can also mean the server is briefly unavailable.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Try again
        </a>
      </div>
    </div>
  );
}
