import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolPage } from '@/lib/page-guards';
import { ROLE_DEFINITIONS } from '@/lib/rbac/roles';
import { PERMISSIONS, type PermissionKey } from '@/lib/rbac/permissions';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { UserPermissions } from './user-permissions';
import { ROLE_LABELS } from '@/lib/auth/landing';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const session = await requireSchoolPage('school.users.manage');

  const users = await db.query.users.findMany({
    where: and(eq(t.users.schoolId, session.schoolId), isNull(t.users.deletedAt)),
    with: { roles: true, extraPermissions: true },
    orderBy: asc(t.users.name),
    limit: 300,
  });

  // Parents are managed from the students module, not here.
  const staffUsers = users.filter((u) => !u.roles.some((r) => r.role === 'PARENT'));

  const permissionGroups = Object.entries(PERMISSIONS)
    .filter(([key]) => !key.startsWith('platform.'))
    .reduce<Record<string, { key: PermissionKey; label: string }[]>>((acc, [key, [module, label]]) => {
      acc[module] = [...(acc[module] ?? []), { key: key as PermissionKey, label }];
      return acc;
    }, {});

  return (
    <>
      <PageHeader
        title="Users and roles"
        description="Roles set the defaults. Overrides let you grant or revoke a single permission for one person."
      />

      <Card className="mb-5">
        <CardHeader title="Roles in this school" description="Default permission sets" />
        <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(ROLE_DEFINITIONS)
            .filter(([, def]) => !def.isPlatform)
            .map(([key, def]) => (
              <div key={key} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{def.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{def.description}</p>
                <p className="mt-2 text-xs font-medium text-brand-600">{def.permissions.length} permissions</p>
              </div>
            ))}
        </CardBody>
      </Card>

      <Table>
        <THead>
          <TR>
            <TH>User</TH>
            <TH>Roles</TH>
            <TH>Overrides</TH>
            <TH>Status</TH>
            <TH className="text-right">Permissions</TH>
          </TR>
        </THead>
        <TBody>
          {staffUsers.map((u) => (
            <TR key={u.id}>
              <TD>
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{u.name}</p>
                    <p className="truncate text-xs text-slate-500">{u.email ?? u.phone ?? '—'}</p>
                  </div>
                </div>
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r.role} tone="brand">
                      {ROLE_LABELS[r.role] ?? r.role}
                    </Badge>
                  ))}
                </div>
              </TD>
              <TD>{u.extraPermissions.length ? <Badge tone="amber">{u.extraPermissions.length}</Badge> : <span className="text-xs text-slate-400">None</span>}</TD>
              <TD><StatusBadge status={u.status} /></TD>
              <TD className="text-right">
                {u.id === session.id ? (
                  <span className="text-xs text-slate-400">You</span>
                ) : (
                  <UserPermissions
                    userId={u.id}
                    userName={u.name}
                    status={u.status}
                    roles={u.roles.map((r) => r.role)}
                    overrides={u.extraPermissions.map((p) => ({ permissionKey: p.permissionKey, granted: p.granted }))}
                    groups={permissionGroups}
                  />
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
