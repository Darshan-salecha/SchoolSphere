import type { PermissionKey } from '@/lib/rbac/permissions';

export type NavItem = { label: string; href: string; icon: string; permission?: PermissionKey; exact?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

export const PLATFORM_NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/platform', icon: 'LayoutDashboard', exact: true },
      { label: 'Schools', href: '/platform/schools', icon: 'Building2', permission: 'platform.schools.view' },
      { label: 'Plans', href: '/platform/plans', icon: 'CreditCard', permission: 'platform.plans.manage' },
      { label: 'Usage', href: '/platform/usage', icon: 'Gauge', permission: 'platform.analytics.view' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Support', href: '/platform/support', icon: 'LifeBuoy', permission: 'platform.support.manage' },
      { label: 'Audit logs', href: '/platform/audit', icon: 'ScrollText', permission: 'platform.audit.view' },
    ],
  },
];

export const SCHOOL_NAV: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/school', icon: 'LayoutDashboard', exact: true },
      { label: 'Setup', href: '/school/setup', icon: 'Wand2', permission: 'school.settings.manage' },
    ],
  },
  {
    title: 'People',
    items: [
      { label: 'Students', href: '/school/students', icon: 'GraduationCap', permission: 'students.view' },
      { label: 'Parents', href: '/school/parents', icon: 'Users', permission: 'parents.view' },
      { label: 'Teachers', href: '/school/teachers', icon: 'UserCog', permission: 'teachers.view' },
      { label: 'Staff', href: '/school/staff', icon: 'Briefcase', permission: 'staff.view' },
    ],
  },
  {
    title: 'Academics',
    items: [
      { label: 'Academic years', href: '/school/academic-years', icon: 'CalendarRange', permission: 'school.academicyears.manage' },
      { label: 'Classes', href: '/school/classes', icon: 'Layers', permission: 'school.classes.manage' },
      { label: 'Subjects', href: '/school/subjects', icon: 'BookOpen', permission: 'school.subjects.manage' },
      { label: 'Attendance', href: '/school/attendance', icon: 'ClipboardCheck', permission: 'attendance.view' },
      { label: 'Timetable', href: '/school/timetable', icon: 'CalendarClock', permission: 'timetable.view' },
      { label: 'Homework', href: '/school/homework', icon: 'NotebookPen', permission: 'homework.view' },
      { label: 'Assignments', href: '/school/assignments', icon: 'FileCheck2', permission: 'assignments.view' },
      { label: 'Exams', href: '/school/exams', icon: 'FileSpreadsheet', permission: 'exams.view' },
      { label: 'Results', href: '/school/results', icon: 'Trophy', permission: 'results.view' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Fees', href: '/school/fees', icon: 'Wallet', permission: 'fees.view' },
      { label: 'Transport', href: '/school/transport', icon: 'Bus', permission: 'transport.view' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Announcements', href: '/school/announcements', icon: 'Megaphone', permission: 'announcements.view' },
      { label: 'Events', href: '/school/events', icon: 'CalendarDays', permission: 'events.view' },
      { label: 'Messages', href: '/school/messages', icon: 'MessagesSquare' },
      { label: 'Leave requests', href: '/school/leave', icon: 'CalendarOff', permission: 'attendance.view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Reports', href: '/school/reports', icon: 'BarChart3', permission: 'reports.view' },
      { label: 'Users & roles', href: '/school/users', icon: 'ShieldCheck', permission: 'school.users.manage' },
      { label: 'Settings', href: '/school/settings', icon: 'Settings', permission: 'school.settings.view' },
      { label: 'Audit logs', href: '/school/audit', icon: 'ScrollText', permission: 'school.audit.view' },
    ],
  },
];

export const PARENT_NAV: NavGroup[] = [
  {
    title: 'My children',
    items: [
      { label: 'Dashboard', href: '/parent', icon: 'LayoutDashboard', exact: true },
      { label: 'Attendance', href: '/parent/attendance', icon: 'ClipboardCheck' },
      { label: 'Homework', href: '/parent/homework', icon: 'NotebookPen' },
      { label: 'Results', href: '/parent/results', icon: 'Trophy' },
      { label: 'Timetable', href: '/parent/timetable', icon: 'CalendarClock' },
      { label: 'Fees', href: '/parent/fees', icon: 'Wallet' },
      { label: 'School bus', href: '/parent/transport', icon: 'Bus' },
    ],
  },
  {
    title: 'School',
    items: [
      { label: 'Announcements', href: '/parent/announcements', icon: 'Megaphone' },
      { label: 'Events', href: '/parent/events', icon: 'CalendarDays' },
      { label: 'Messages', href: '/parent/messages', icon: 'MessagesSquare' },
      { label: 'Documents', href: '/parent/documents', icon: 'FolderOpen' },
      { label: 'Leave requests', href: '/parent/leave', icon: 'CalendarOff' },
    ],
  },
];

export const STUDENT_NAV: NavGroup[] = [
  {
    title: 'My school',
    items: [
      { label: 'Dashboard', href: '/student', icon: 'LayoutDashboard', exact: true },
      { label: 'Timetable', href: '/student/timetable', icon: 'CalendarClock' },
      { label: 'Homework', href: '/student/homework', icon: 'NotebookPen' },
      { label: 'Attendance', href: '/student/attendance', icon: 'ClipboardCheck' },
      { label: 'Results', href: '/student/results', icon: 'Trophy' },
      { label: 'Announcements', href: '/student/announcements', icon: 'Megaphone' },
    ],
  },
];
