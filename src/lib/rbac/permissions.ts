// Canonical permission catalogue. Everything server-side authorises against these
// keys — never against role names sprinkled through the UI.

export const PERMISSIONS = {
  // platform
  'platform.schools.view': ['Platform', 'View schools'],
  'platform.schools.manage': ['Platform', 'Create / edit / suspend schools'],
  'platform.plans.manage': ['Platform', 'Manage plans & subscriptions'],
  'platform.analytics.view': ['Platform', 'View platform analytics'],
  'platform.support.manage': ['Platform', 'Manage support tickets'],
  'platform.audit.view': ['Platform', 'View platform audit logs'],

  // school setup
  'school.settings.view': ['School', 'View school settings'],
  'school.settings.manage': ['School', 'Manage school settings & branding'],
  'school.academicyears.manage': ['School', 'Manage academic years'],
  'school.classes.manage': ['School', 'Manage classes & sections'],
  'school.subjects.manage': ['School', 'Manage subjects'],
  'school.users.manage': ['School', 'Manage users & permissions'],
  'school.audit.view': ['School', 'View audit logs'],

  // people
  'students.view': ['Students', 'View students'],
  'students.create': ['Students', 'Add students'],
  'students.edit': ['Students', 'Edit students'],
  'students.delete': ['Students', 'Remove students'],
  'parents.view': ['Parents', 'View parents'],
  'parents.manage': ['Parents', 'Add / link parents'],
  'teachers.view': ['Teachers', 'View teachers'],
  'teachers.manage': ['Teachers', 'Add / edit teachers'],
  'staff.view': ['Staff', 'View staff'],
  'staff.manage': ['Staff', 'Add / edit staff'],

  // academics
  'attendance.view': ['Attendance', 'View attendance'],
  'attendance.mark': ['Attendance', 'Mark attendance'],
  'attendance.edit': ['Attendance', 'Edit past attendance'],
  'timetable.view': ['Timetable', 'View timetable'],
  'timetable.manage': ['Timetable', 'Manage timetable'],
  'homework.view': ['Homework', 'View homework'],
  'homework.manage': ['Homework', 'Create / edit homework'],
  'assignments.view': ['Assignments', 'View assignments'],
  'assignments.manage': ['Assignments', 'Create / grade assignments'],
  'exams.view': ['Exams', 'View exams'],
  'exams.manage': ['Exams', 'Create / edit exams'],
  'exams.marks.enter': ['Exams', 'Enter marks'],
  'results.view': ['Results', 'View results'],
  'results.publish': ['Results', 'Publish results'],

  // finance
  'fees.view': ['Fees', 'View fees'],
  'fees.manage': ['Fees', 'Create fee structures'],
  'fees.collect': ['Fees', 'Collect payments'],

  // transport
  'transport.view': ['Transport', 'View transport'],
  'transport.manage': ['Transport', 'Manage buses, routes & drivers'],
  'transport.trip.operate': ['Transport', 'Start / end trips, mark boarding'],

  // communication
  'announcements.view': ['Communication', 'View announcements'],
  'announcements.create': ['Communication', 'Publish announcements'],
  'events.view': ['Communication', 'View events'],
  'events.manage': ['Communication', 'Manage events'],
  'leave.request': ['Leave', 'Submit leave requests'],
  'leave.approve': ['Leave', 'Approve leave requests'],

  // library
  'library.view': ['Library', 'View the catalogue and loans'],
  'library.manage': ['Library', 'Add books, issue and return'],

  // reporting
  'reports.view': ['Reports', 'View reports'],
  'documents.view': ['Documents', 'View documents'],
  'documents.manage': ['Documents', 'Upload / manage documents'],

  // self-service portals
  'portal.parent': ['Portal', 'Access the parent portal'],
  'portal.student': ['Portal', 'Access the student portal'],
  'portal.driver': ['Portal', 'Access the driver portal'],
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionKey[];

export function permissionMeta(key: PermissionKey) {
  const [module, label] = PERMISSIONS[key];
  return { key, module, label };
}
