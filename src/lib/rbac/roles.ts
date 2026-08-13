import { ALL_PERMISSIONS, type PermissionKey } from './permissions';

export type RoleKeyString =
  | 'PLATFORM_SUPER_ADMIN'
  | 'PLATFORM_SUPPORT'
  | 'SCHOOL_ADMIN'
  | 'PRINCIPAL'
  | 'TEACHER'
  | 'STAFF'
  | 'PARENT'
  | 'STUDENT'
  | 'DRIVER'
  | 'CONDUCTOR';

const TEACHER_PERMISSIONS: PermissionKey[] = [
  'students.view',
  'parents.view',
  'attendance.view',
  'attendance.mark',
  'timetable.view',
  'homework.view',
  'homework.manage',
  'assignments.view',
  'assignments.manage',
  'exams.view',
  'exams.marks.enter',
  'results.view',
  'announcements.view',
  'announcements.create',
  'events.view',
  'leave.request',
  'reports.view',
  'documents.view',
];

const SCHOOL_ADMIN_PERMISSIONS: PermissionKey[] = ALL_PERMISSIONS.filter(
  (p) => !p.startsWith('platform.') && !p.startsWith('portal.'),
);

const PRINCIPAL_PERMISSIONS: PermissionKey[] = SCHOOL_ADMIN_PERMISSIONS.filter(
  (p) => p !== 'school.users.manage' && p !== 'students.delete',
);

export const ROLE_DEFINITIONS: Record<
  RoleKeyString,
  { name: string; description: string; isPlatform: boolean; permissions: PermissionKey[] }
> = {
  PLATFORM_SUPER_ADMIN: {
    name: 'Platform Super Admin',
    description: 'Full control of the SchoolSphere platform and every tenant lifecycle action.',
    isPlatform: true,
    permissions: ALL_PERMISSIONS.filter((p) => !p.startsWith('portal.')),
  },
  PLATFORM_SUPPORT: {
    name: 'Platform Support',
    description: 'Read-only platform access plus support ticket handling.',
    isPlatform: true,
    permissions: ['platform.schools.view', 'platform.analytics.view', 'platform.support.manage', 'platform.audit.view'],
  },
  SCHOOL_ADMIN: {
    name: 'School Admin',
    description: 'Complete operational control of a single school.',
    isPlatform: false,
    permissions: SCHOOL_ADMIN_PERMISSIONS,
  },
  PRINCIPAL: {
    name: 'Principal',
    description: 'School-wide oversight, approvals and executive analytics.',
    isPlatform: false,
    permissions: PRINCIPAL_PERMISSIONS,
  },
  TEACHER: {
    name: 'Teacher',
    description: 'Teaches assigned subjects and sections.',
    isPlatform: false,
    permissions: TEACHER_PERMISSIONS,
  },
  STAFF: {
    name: 'Staff',
    description: 'Non-teaching staff with narrow, role-specific access.',
    isPlatform: false,
    permissions: ['students.view', 'attendance.view', 'announcements.view', 'events.view', 'leave.request', 'documents.view'],
  },
  PARENT: {
    name: 'Parent',
    description: 'Guardian of one or more enrolled students.',
    isPlatform: false,
    permissions: ['portal.parent', 'leave.request'],
  },
  STUDENT: {
    name: 'Student',
    description: 'Enrolled student, when student login is enabled.',
    isPlatform: false,
    permissions: ['portal.student'],
  },
  DRIVER: {
    name: 'Bus Driver',
    description: 'Operates an assigned bus and route.',
    isPlatform: false,
    permissions: ['portal.driver', 'transport.trip.operate'],
  },
  CONDUCTOR: {
    name: 'Bus Conductor',
    description: 'Attends an assigned route and marks boarding/drop.',
    isPlatform: false,
    permissions: ['portal.driver', 'transport.trip.operate'],
  },
};

export const ROLE_KEYS = Object.keys(ROLE_DEFINITIONS) as RoleKeyString[];
