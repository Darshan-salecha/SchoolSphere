'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api, ApiRequestError } from '@/lib/client';
import { ROLE_DEFINITIONS, type RoleKeyString } from '@/lib/rbac/roles';
import { cn } from '@/lib/utils';

type Group = Record<string, { key: string; label: string }[]>;

export function UserPermissions({
  userId,
  userName,
  status,
  roles,
  overrides,
  groups,
}: {
  userId: string;
  userName: string;
  status: string;
  roles: string[];
  overrides: { permissionKey: string; granted: boolean }[];
  groups: Group;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const roleDefaults = new Set<string>(roles.flatMap((r) => ROLE_DEFINITIONS[r as RoleKeyString]?.permissions ?? []));
  const overrideMap = new Map(overrides.map((o) => [o.permissionKey, o.granted]));

  const effective = (key: string) => (overrideMap.has(key) ? overrideMap.get(key)! : roleDefaults.has(key));

  async function toggle(key: string) {
    setBusy(key);
    const current = effective(key);
    const isDefault = roleDefaults.has(key);
    // Removing the override restores the role default; otherwise store the opposite.
    const granted = !current === isDefault ? null : !current;
    try {
      await api.patch('/api/school/users', { userId, permissionKey: key, granted });
      toast.success('Permission updated');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(next: 'ACTIVE' | 'SUSPENDED') {
    try {
      await api.post('/api/school/users', { userId, status: next });
      toast.success(next === 'SUSPENDED' ? 'User suspended' : 'User reactivated');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <ShieldCheck className="h-3.5 w-3.5" /> Manage
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Permissions — ${userName}`}
        description="Green means allowed. Amber means it differs from the role default."
        size="lg"
        footer={
          <>
            {status === 'ACTIVE' ? (
              <Button variant="danger" onClick={() => setStatus('SUSPENDED')}>
                Suspend user
              </Button>
            ) : (
              <Button onClick={() => setStatus('ACTIVE')}>Reactivate user</Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {Object.entries(groups).map(([module, items]) => (
            <div key={module}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{module}</p>
              <div className="space-y-1.5">
                {items.map((item) => {
                  const allowed = effective(item.key);
                  const overridden = overrideMap.has(item.key);
                  return (
                    <button
                      key={item.key}
                      onClick={() => toggle(item.key)}
                      disabled={busy === item.key}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        allowed ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white',
                        busy === item.key && 'opacity-60',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-slate-800">{item.label}</span>
                        <code className="text-[11px] text-slate-400">{item.key}</code>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {overridden && <Badge tone="amber">override</Badge>}
                        <Badge tone={allowed ? 'green' : 'slate'}>{allowed ? 'allowed' : 'denied'}</Badge>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
