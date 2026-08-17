import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Offline — SchoolSphere' };

/** Served by the service worker when a navigation fails. */
export default function OfflinePage() {
  return (
    <div className="grid min-h-screen place-items-center bg-slate-50 px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
          <WifiOff className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">You are offline</h1>
        <p className="mt-2 text-sm text-slate-500">
          SchoolSphere needs a connection to show live attendance, fees and bus positions. It will pick up again as soon
          as you are back online.
        </p>
      </div>
    </div>
  );
}
