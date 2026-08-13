import type { SessionUser } from './session';

/** Where each role lands after sign-in. */
export function landingPath(session: SessionUser) {
  if (session.isPlatform) return '/platform';
  if (session.parentId) return '/parent';
  if (session.driverId) return '/driver';
  if (session.studentId && !session.teacherId) return '/student';
  return '/school';
}

export const ROLE_LABELS: Record<string, string> = {
  PLATFORM_SUPER_ADMIN: 'Platform Super Admin',
  PLATFORM_SUPPORT: 'Platform Support',
  SCHOOL_ADMIN: 'School Admin',
  PRINCIPAL: 'Principal',
  TEACHER: 'Teacher',
  STAFF: 'Staff',
  PARENT: 'Parent',
  STUDENT: 'Student',
  DRIVER: 'Bus Driver',
  CONDUCTOR: 'Bus Conductor',
};

export const roleLabel = (session: SessionUser) =>
  session.roles.map((r) => ROLE_LABELS[r] ?? r).join(' · ') || 'Member';
