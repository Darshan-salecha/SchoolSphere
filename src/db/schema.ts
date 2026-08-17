/**
 * SchoolSphere database schema.
 *
 * Tenancy rule: every tenant-owned table carries `schoolId` with an index, and
 * every unique constraint that could collide across tenants is scoped by it.
 * Isolation is enforced in src/lib/tenant.ts and re-checked in each API guard.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ========================================================================== */
/* ENUMS                                                                       */
/* ========================================================================== */

export const schoolStatusEnum = pgEnum('school_status', ['PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED']);
export const roleKeyEnum = pgEnum('role_key', [
  'PLATFORM_SUPER_ADMIN', 'PLATFORM_SUPPORT', 'SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER',
  'STAFF', 'PARENT', 'STUDENT', 'DRIVER', 'CONDUCTOR',
]);
export const userStatusEnum = pgEnum('user_status', ['INVITED', 'ACTIVE', 'SUSPENDED']);
export const genderEnum = pgEnum('gender', ['MALE', 'FEMALE', 'OTHER']);
export const studentStatusEnum = pgEnum('student_status', ['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN']);
export const employmentStatusEnum = pgEnum('employment_status', ['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED']);
export const guardianRelationEnum = pgEnum('guardian_relation', ['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']);
export const guardianAccessEnum = pgEnum('guardian_access', ['FULL', 'LIMITED']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED']);
export const examStatusEnum = pgEnum('exam_status', ['DRAFT', 'SCHEDULED', 'ONGOING', 'COMPLETED', 'RESULTS_PUBLISHED']);
export const submissionStatusEnum = pgEnum('submission_status', ['PENDING', 'SUBMITTED', 'LATE', 'GRADED']);
// Homework is tracked, not graded: the teacher acknowledges the work or sends it back.
export const homeworkReviewEnum = pgEnum('homework_review_status', ['PENDING', 'ACKNOWLEDGED', 'NEEDS_REWORK']);
export const announcementTypeEnum = pgEnum('announcement_type', ['GENERAL', 'EMERGENCY', 'ACADEMIC', 'EXAM', 'HOLIDAY', 'FEE', 'TRANSPORT', 'EVENT']);
export const leaveStatusEnum = pgEnum('leave_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']);
export const feeStatusEnum = pgEnum('fee_status', ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED']);
export const tripStatusEnum = pgEnum('trip_status', ['NOT_STARTED', 'STARTED', 'ON_ROUTE', 'COMPLETED', 'CANCELLED']);

/* ========================================================================== */
/* PLATFORM & TENANCY                                                          */
/* ========================================================================== */

export const plans = pgTable('plans', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  priceMonthly: integer('price_monthly').notNull().default(0), // minor units
  currency: varchar('currency', { length: 3 }).notNull().default('INR'),
  maxStudents: integer('max_students').notNull().default(500),
  maxTeachers: integer('max_teachers').notNull().default(50),
  features: text('features').array().notNull().default(sql`ARRAY[]::text[]`),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const schools = pgTable(
  'schools',
  {
    id: id(),
    code: varchar('code', { length: 20 }).notNull().unique(), // SCHOOL-0001
    slug: varchar('slug', { length: 60 }).notNull().unique(),
    name: varchar('name', { length: 160 }).notNull(),
    registrationNumber: varchar('registration_number', { length: 60 }),
    logoUrl: text('logo_url'),
    addressLine: varchar('address_line', { length: 200 }),
    city: varchar('city', { length: 80 }),
    state: varchar('state', { length: 80 }),
    country: varchar('country', { length: 80 }).notNull().default('India'),
    postalCode: varchar('postal_code', { length: 20 }),
    phone: varchar('phone', { length: 20 }),
    email: varchar('email', { length: 160 }),
    website: varchar('website', { length: 160 }),
    principalName: varchar('principal_name', { length: 120 }),
    schoolType: varchar('school_type', { length: 60 }),
    board: varchar('board', { length: 60 }),
    medium: varchar('medium', { length: 60 }),
    timezone: varchar('timezone', { length: 60 }).notNull().default('Asia/Kolkata'),
    locale: varchar('locale', { length: 8 }).notNull().default('en'),
    status: schoolStatusEnum('status').notNull().default('PENDING'),
    setupCompleted: boolean('setup_completed').notNull().default(false),
    setupStep: integer('setup_step').notNull().default(0),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('schools_status_idx').on(t.status)],
);

export const schoolSettings = pgTable('school_settings', {
  id: id(),
  schoolId: text('school_id').notNull().unique().references(() => schools.id, { onDelete: 'cascade' }),
  primaryColor: varchar('primary_color', { length: 9 }).notNull().default('#4f46e5'),
  accentColor: varchar('accent_color', { length: 9 }).notNull().default('#0ea5e9'),
  studentLoginEnabled: boolean('student_login_enabled').notNull().default(false),
  parentOtpEnabled: boolean('parent_otp_enabled').notNull().default(true),
  attendanceEditWindowHours: integer('attendance_edit_window_hours').notNull().default(24),
  notifyParentOnAbsence: boolean('notify_parent_on_absence').notNull().default(true),
  lowAttendanceThreshold: integer('low_attendance_threshold').notNull().default(75),
  resultsRequireApproval: boolean('results_require_approval').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    schoolId: text('school_id').notNull().unique().references(() => schools.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull().references(() => plans.id),
    status: subscriptionStatusEnum('status').notNull().default('TRIAL'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull().defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('subscriptions_status_idx').on(t.status)],
);

/* ========================================================================== */
/* IDENTITY & RBAC                                                             */
/* ========================================================================== */

export const users = pgTable(
  'users',
  {
    id: id(),
    schoolId: text('school_id').references(() => schools.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 160 }),
    phone: varchar('phone', { length: 20 }),
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    locale: varchar('locale', { length: 8 }).notNull().default('en'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('users_email_unique').on(t.email),
    index('users_school_idx').on(t.schoolId, t.status),
    index('users_phone_idx').on(t.schoolId, t.phone),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: roleKeyEnum('role').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/** Per-user grant/revoke on top of the role defaults. */
export const userPermissions = pgTable(
  'user_permissions',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    permissionKey: varchar('permission_key', { length: 60 }).notNull(),
    granted: boolean('granted').notNull().default(true),
  },
  (t) => [uniqueIndex('user_permissions_unique').on(t.userId, t.permissionKey)],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: id(),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenId: text('token_id').notNull().unique(),
    userAgent: varchar('user_agent', { length: 250 }),
    ip: varchar('ip', { length: 60 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('auth_sessions_user_idx').on(t.userId)],
);

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    phone: varchar('phone', { length: 20 }).notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: varchar('purpose', { length: 40 }).notNull().default('PARENT_LOGIN'),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('otp_codes_lookup_idx').on(t.schoolId, t.phone)],
);

/* ========================================================================== */
/* ACADEMIC STRUCTURE                                                          */
/* ========================================================================== */

export const academicYears = pgTable(
  'academic_years',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 20 }).notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('academic_years_unique').on(t.schoolId, t.name),
    index('academic_years_current_idx').on(t.schoolId, t.isCurrent),
  ],
);

export const classLevels = pgTable(
  'class_levels',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    level: integer('level').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('class_levels_unique').on(t.schoolId, t.name), index('class_levels_order_idx').on(t.schoolId, t.level)],
);

export const teachers = pgTable(
  'teachers',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 40 }).notNull(),
    qualification: varchar('qualification', { length: 120 }),
    designation: varchar('designation', { length: 80 }),
    joiningDate: date('joining_date'),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    address: varchar('address', { length: 200 }),
    status: employmentStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('teachers_employee_unique').on(t.schoolId, t.employeeId), index('teachers_status_idx').on(t.schoolId, t.status)],
);

export const sections = pgTable(
  'sections',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    classId: text('class_id').notNull().references(() => classLevels.id, { onDelete: 'cascade' }),
    academicYearId: text('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 8 }).notNull(),
    capacity: integer('capacity').notNull().default(40),
    roomNumber: varchar('room_number', { length: 20 }),
    classTeacherId: text('class_teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sections_unique').on(t.schoolId, t.classId, t.academicYearId, t.name),
    index('sections_year_idx').on(t.schoolId, t.academicYearId),
  ],
);

export const subjects = pgTable(
  'subjects',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    code: varchar('code', { length: 16 }).notNull(),
    classId: text('class_id').references(() => classLevels.id, { onDelete: 'set null' }),
    isElective: boolean('is_elective').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('subjects_code_unique').on(t.schoolId, t.code), index('subjects_class_idx').on(t.schoolId, t.classId)],
);

export const teacherSubjects = pgTable(
  'teacher_subjects',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    teacherId: text('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
  },
  (t) => [uniqueIndex('teacher_subjects_unique').on(t.teacherId, t.subjectId), index('teacher_subjects_school_idx').on(t.schoolId)],
);

/** A teacher is authorised for a (section, subject) pair; class teachers get the whole section. */
export const teacherAssignments = pgTable(
  'teacher_class_assignments',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    teacherId: text('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    isClassTeacher: boolean('is_class_teacher').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('teacher_assignments_unique').on(t.teacherId, t.sectionId, t.subjectId),
    index('teacher_assignments_section_idx').on(t.schoolId, t.sectionId),
  ],
);

export const staff = pgTable(
  'staff',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    employeeId: varchar('employee_id', { length: 40 }).notNull(),
    department: varchar('department', { length: 80 }),
    designation: varchar('designation', { length: 80 }),
    joiningDate: date('joining_date'),
    status: employmentStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('staff_employee_unique').on(t.schoolId, t.employeeId)],
);

export const students = pgTable(
  'students',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    admissionNumber: varchar('admission_number', { length: 40 }).notNull(),
    firstName: varchar('first_name', { length: 60 }).notNull(),
    lastName: varchar('last_name', { length: 60 }).notNull(),
    photoUrl: text('photo_url'),
    dateOfBirth: date('date_of_birth'),
    gender: genderEnum('gender'),
    bloodGroup: varchar('blood_group', { length: 8 }),
    nationality: varchar('nationality', { length: 60 }),
    addressLine: varchar('address_line', { length: 200 }),
    city: varchar('city', { length: 80 }),
    admissionDate: date('admission_date'),
    previousSchool: varchar('previous_school', { length: 160 }),
    emergencyContactName: varchar('emergency_contact_name', { length: 120 }),
    emergencyContactPhone: varchar('emergency_contact_phone', { length: 20 }),
    medicalNotes: text('medical_notes'),
    status: studentStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('students_admission_unique').on(t.schoolId, t.admissionNumber),
    index('students_status_idx').on(t.schoolId, t.status),
    index('students_name_idx').on(t.schoolId, t.lastName),
  ],
);

export const enrollments = pgTable(
  'student_enrollments',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    academicYearId: text('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    rollNumber: integer('roll_number'),
    isCurrent: boolean('is_current').notNull().default(true),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
    exitedAt: timestamp('exited_at', { withTimezone: true }),
    exitReason: varchar('exit_reason', { length: 120 }),
  },
  (t) => [
    uniqueIndex('enrollments_unique').on(t.studentId, t.academicYearId),
    index('enrollments_section_idx').on(t.schoolId, t.sectionId, t.isCurrent),
  ],
);

export const parents = pgTable(
  'parents',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    phone: varchar('phone', { length: 20 }).notNull(),
    email: varchar('email', { length: 160 }),
    occupation: varchar('occupation', { length: 80 }),
    addressLine: varchar('address_line', { length: 200 }),
    altPhone: varchar('alt_phone', { length: 20 }),
    notifyByPush: boolean('notify_by_push').notNull().default(true),
    notifyBySms: boolean('notify_by_sms').notNull().default(true),
    notifyByEmail: boolean('notify_by_email').notNull().default(false),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('parents_phone_unique').on(t.schoolId, t.phone), index('parents_school_idx').on(t.schoolId)],
);

export const studentParents = pgTable(
  'student_parents',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').notNull().references(() => parents.id, { onDelete: 'cascade' }),
    relation: guardianRelationEnum('relation').notNull().default('GUARDIAN'),
    access: guardianAccessEnum('access').notNull().default('FULL'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('student_parents_unique').on(t.studentId, t.parentId),
    index('student_parents_parent_idx').on(t.schoolId, t.parentId),
  ],
);

/* ========================================================================== */
/* ATTENDANCE                                                                  */
/* ========================================================================== */

export const studentAttendance = pgTable(
  'student_attendance',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    remarks: varchar('remarks', { length: 200 }),
    markedById: text('marked_by_id').references(() => teachers.id, { onDelete: 'set null' }),
    markedAt: timestamp('marked_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('student_attendance_unique').on(t.studentId, t.date),
    index('student_attendance_section_idx').on(t.schoolId, t.sectionId, t.date),
    index('student_attendance_day_idx').on(t.schoolId, t.date, t.status),
  ],
);

export const staffAttendance = pgTable(
  'staff_attendance',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    remarks: varchar('remarks', { length: 200 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('staff_attendance_unique').on(t.userId, t.date), index('staff_attendance_day_idx').on(t.schoolId, t.date)],
);

/* ========================================================================== */
/* TIMETABLE                                                                   */
/* ========================================================================== */

export const periods = pgTable(
  'period_definitions',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 40 }).notNull(),
    order: integer('order').notNull(),
    startTime: varchar('start_time', { length: 5 }).notNull(),
    endTime: varchar('end_time', { length: 5 }).notNull(),
    isBreak: boolean('is_break').notNull().default(false),
  },
  (t) => [uniqueIndex('periods_unique').on(t.schoolId, t.order)],
);

export const timetableSlots = pgTable(
  'timetable_slots',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    periodId: text('period_id').notNull().references(() => periods.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(),
    subjectId: text('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    teacherId: text('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    room: varchar('room', { length: 20 }),
  },
  (t) => [
    uniqueIndex('timetable_slot_unique').on(t.sectionId, t.dayOfWeek, t.periodId),
    index('timetable_teacher_idx').on(t.schoolId, t.teacherId, t.dayOfWeek),
  ],
);

/* ========================================================================== */
/* EXAMS & RESULTS                                                             */
/* ========================================================================== */

export const exams = pgTable(
  'exams',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    academicYearId: text('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    type: varchar('type', { length: 40 }).notNull().default('UNIT_TEST'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    weightage: integer('weightage').notNull().default(100),
    status: examStatusEnum('status').notNull().default('DRAFT'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('exams_unique').on(t.schoolId, t.academicYearId, t.name), index('exams_status_idx').on(t.schoolId, t.status)],
);

export const examSubjects = pgTable(
  'exam_subjects',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    examDate: date('exam_date'),
    startTime: varchar('start_time', { length: 5 }),
    maxMarks: integer('max_marks').notNull().default(100),
    passingMarks: integer('passing_marks').notNull().default(35),
  },
  (t) => [
    uniqueIndex('exam_subjects_unique').on(t.examId, t.sectionId, t.subjectId),
    index('exam_subjects_exam_idx').on(t.schoolId, t.examId),
  ],
);

export const marks = pgTable(
  'marks',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
    examSubjectId: text('exam_subject_id').notNull().references(() => examSubjects.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    marksObtained: doublePrecision('marks_obtained'),
    isAbsent: boolean('is_absent').notNull().default(false),
    grade: varchar('grade', { length: 4 }),
    remarks: varchar('remarks', { length: 200 }),
    enteredById: text('entered_by_id').references(() => teachers.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('marks_unique').on(t.examSubjectId, t.studentId),
    index('marks_exam_idx').on(t.schoolId, t.examId, t.studentId),
  ],
);

export const results = pgTable(
  'results',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    examId: text('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    totalMarks: doublePrecision('total_marks').notNull().default(0),
    maxMarks: doublePrecision('max_marks').notNull().default(0),
    percentage: doublePrecision('percentage').notNull().default(0),
    grade: varchar('grade', { length: 4 }),
    rank: integer('rank'),
    teacherRemark: varchar('teacher_remark', { length: 300 }),
    principalRemark: varchar('principal_remark', { length: 300 }),
    isPublished: boolean('is_published').notNull().default(false),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('results_unique').on(t.examId, t.studentId),
    index('results_published_idx').on(t.schoolId, t.examId, t.isPublished),
  ],
);

/* ========================================================================== */
/* HOMEWORK & ASSIGNMENTS                                                      */
/* ========================================================================== */

export const homework = pgTable(
  'homework',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: text('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description').notNull(),
    assignedOn: date('assigned_on').notNull(),
    dueDate: date('due_date').notNull(),
    attachments: jsonb('attachments'),
    allowSubmission: boolean('allow_submission').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('homework_section_idx').on(t.schoolId, t.sectionId, t.dueDate)],
);

export const homeworkSubmissions = pgTable(
  'homework_submissions',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    homeworkId: text('homework_id').notNull().references(() => homework.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    status: submissionStatusEnum('status').notNull().default('PENDING'),
    note: text('note'),
    link: varchar('link', { length: 500 }),
    attachments: jsonb('attachments'),
    marks: doublePrecision('marks'),
    feedback: varchar('feedback', { length: 500 }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    // Teacher acknowledgement — the tracking half of the record.
    reviewStatus: homeworkReviewEnum('review_status').notNull().default('PENDING'),
    reviewedById: text('reviewed_by_id').references(() => teachers.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('homework_submissions_unique').on(t.homeworkId, t.studentId),
    index('homework_submissions_school_idx').on(t.schoolId),
    index('homework_submissions_student_idx').on(t.schoolId, t.studentId),
  ],
);

export const assignments = pgTable(
  'assignments',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
    subjectId: text('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: text('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description').notNull(),
    maxMarks: integer('max_marks').notNull().default(20),
    dueDate: date('due_date').notNull(),
    allowLate: boolean('allow_late').notNull().default(true),
    attachments: jsonb('attachments'),
    createdAt: createdAt(),
  },
  (t) => [index('assignments_section_idx').on(t.schoolId, t.sectionId, t.dueDate)],
);

export const assignmentSubmissions = pgTable(
  'assignment_submissions',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    assignmentId: text('assignment_id').notNull().references(() => assignments.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    status: submissionStatusEnum('status').notNull().default('PENDING'),
    note: text('note'),
    attachments: jsonb('attachments'),
    marks: doublePrecision('marks'),
    feedback: varchar('feedback', { length: 500 }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('assignment_submissions_unique').on(t.assignmentId, t.studentId),
    index('assignment_submissions_school_idx').on(t.schoolId),
  ],
);

/* ========================================================================== */
/* COMMUNICATION                                                               */
/* ========================================================================== */

export const announcements = pgTable(
  'announcements',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    type: announcementTypeEnum('type').notNull().default('GENERAL'),
    audience: text('audience').array().notNull().default(sql`ARRAY[]::text[]`),
    sectionIds: text('section_ids').array().notNull().default(sql`ARRAY[]::text[]`),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    isPinned: boolean('is_pinned').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('announcements_published_idx').on(t.schoolId, t.publishedAt)],
);

export const events = pgTable(
  'events',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 40 }).notNull().default('GENERAL'),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true }),
    location: varchar('location', { length: 160 }),
    audience: text('audience').array().notNull().default(sql`ARRAY[]::text[]`),
    requiresRsvp: boolean('requires_rsvp').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('events_start_idx').on(t.schoolId, t.startAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).notNull(),
    title: varchar('title', { length: 160 }).notNull(),
    body: text('body').notNull(),
    link: varchar('link', { length: 200 }),
    priority: varchar('priority', { length: 20 }).notNull().default('NORMAL'),
    readAt: timestamp('read_at', { withTimezone: true }),
    channels: text('channels').array().notNull().default(sql`ARRAY['IN_APP']::text[]`),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.schoolId, t.userId, t.readAt)],
);

/* ========================================================================== */
/* DOCUMENTS, LEAVE, AUDIT                                                     */
/* ========================================================================== */

export const documents = pgTable(
  'documents',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').references(() => students.id, { onDelete: 'cascade' }),
    ownerType: varchar('owner_type', { length: 20 }).notNull().default('STUDENT'),
    ownerId: text('owner_id'),
    title: varchar('title', { length: 160 }).notNull(),
    category: varchar('category', { length: 40 }).notNull().default('OTHER'),
    fileKey: text('file_key').notNull(),
    mimeType: varchar('mime_type', { length: 100 }),
    sizeBytes: integer('size_bytes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    uploadedById: text('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('documents_student_idx').on(t.schoolId, t.studentId)],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    requestType: varchar('request_type', { length: 20 }).notNull().default('STUDENT'),
    studentId: text('student_id').references(() => students.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references(() => parents.id, { onDelete: 'set null' }),
    requestedById: text('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
    reason: text('reason').notNull(),
    status: leaveStatusEnum('status').notNull().default('PENDING'),
    decidedById: text('decided_by_id').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: varchar('decision_note', { length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [index('leave_requests_status_idx').on(t.schoolId, t.status)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    schoolId: text('school_id').references(() => schools.id, { onDelete: 'set null' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 120 }),
    action: varchar('action', { length: 60 }).notNull(),
    entity: varchar('entity', { length: 60 }).notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: varchar('ip', { length: 60 }),
    userAgent: varchar('user_agent', { length: 250 }),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_school_idx').on(t.schoolId, t.createdAt), index('audit_logs_entity_idx').on(t.entity, t.entityId)],
);

/* ========================================================================== */
/* FINANCE (phase 5) & TRANSPORT (phase 6) — schema ready ahead of the UI       */
/* ========================================================================== */

export const feeCategories = pgTable(
  'fee_categories',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    code: varchar('code', { length: 30 }).notNull(),
    isRecurring: boolean('is_recurring').notNull().default(true),
  },
  (t) => [uniqueIndex('fee_categories_unique').on(t.schoolId, t.code)],
);

export const feeStructures = pgTable(
  'fee_structures',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    academicYearId: text('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    classId: text('class_id').references(() => classLevels.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    frequency: varchar('frequency', { length: 20 }).notNull().default('ANNUAL'),
    createdAt: createdAt(),
  },
  (t) => [index('fee_structures_year_idx').on(t.schoolId, t.academicYearId)],
);

export const feeStructureItems = pgTable('fee_structure_items', {
  id: id(),
  feeStructureId: text('fee_structure_id').notNull().references(() => feeStructures.id, { onDelete: 'cascade' }),
  categoryId: text('category_id').notNull().references(() => feeCategories.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  dueDate: date('due_date'),
});

export const studentFees = pgTable(
  'student_fees',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicYearId: text('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    feeStructureId: text('fee_structure_id').references(() => feeStructures.id, { onDelete: 'set null' }),
    title: varchar('title', { length: 120 }).notNull(),
    amount: integer('amount').notNull(),
    discount: integer('discount').notNull().default(0),
    lateFee: integer('late_fee').notNull().default(0),
    paidAmount: integer('paid_amount').notNull().default(0),
    dueDate: date('due_date').notNull(),
    status: feeStatusEnum('status').notNull().default('PENDING'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('student_fees_idx').on(t.schoolId, t.studentId, t.status)],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentFeeId: text('student_fee_id').notNull().references(() => studentFees.id, { onDelete: 'restrict' }),
    receiptNumber: varchar('receipt_number', { length: 40 }).notNull().unique(),
    amount: integer('amount').notNull(),
    method: varchar('method', { length: 20 }).notNull().default('ONLINE'),
    provider: varchar('provider', { length: 40 }),
    providerRef: varchar('provider_ref', { length: 120 }),
    status: varchar('status', { length: 20 }).notNull().default('SUCCESS'),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    recordedById: text('recorded_by_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('payments_school_idx').on(t.schoolId, t.paidAt)],
);

export const buses = pgTable(
  'buses',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    busNumber: varchar('bus_number', { length: 20 }).notNull(),
    registrationNumber: varchar('registration_number', { length: 30 }),
    capacity: integer('capacity').notNull().default(40),
    model: varchar('model', { length: 60 }),
    insuranceExpiry: date('insurance_expiry'),
    fitnessExpiry: date('fitness_expiry'),
    pollutionExpiry: date('pollution_expiry'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('buses_unique').on(t.schoolId, t.busNumber)],
);

export const drivers = pgTable(
  'drivers',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
    licenseNumber: varchar('license_number', { length: 40 }).notNull(),
    licenseExpiry: date('license_expiry'),
    phone: varchar('phone', { length: 20 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('DRIVER'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('drivers_license_unique').on(t.schoolId, t.licenseNumber)],
);

export const routes = pgTable(
  'transport_routes',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    busId: text('bus_id').references(() => buses.id, { onDelete: 'set null' }),
    driverId: text('driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    // A second crew member who attends the children. They may mark boarding on
    // the trip but never start or end it — that stays with the driver.
    conductorId: text('conductor_id').references(() => drivers.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [uniqueIndex('routes_unique').on(t.schoolId, t.name), index('routes_conductor_idx').on(t.schoolId, t.conductorId)],
);

export const routeStops = pgTable(
  'route_stops',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    order: integer('order').notNull(),
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    pickupTime: varchar('pickup_time', { length: 5 }),
    dropTime: varchar('drop_time', { length: 5 }),
  },
  (t) => [uniqueIndex('route_stops_unique').on(t.routeId, t.order), index('route_stops_school_idx').on(t.schoolId)],
);

export const studentTransport = pgTable(
  'student_transport_assignments',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
    stopId: text('stop_id').notNull().references(() => routeStops.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull().default('REGULAR'),
    validFrom: date('valid_from').notNull(),
    validTo: date('valid_to'),
  },
  (t) => [index('student_transport_idx').on(t.schoolId, t.studentId)],
);

export const trips = pgTable(
  'trips',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    routeId: text('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
    busId: text('bus_id').references(() => buses.id, { onDelete: 'set null' }),
    driverId: text('driver_id').references(() => drivers.id, { onDelete: 'set null' }),
    direction: varchar('direction', { length: 10 }).notNull().default('PICKUP'),
    status: tripStatusEnum('status').notNull().default('NOT_STARTED'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    date: date('date').notNull(),
    // Current fix. Denormalised onto the trip so a parent opening the map gets
    // the bus position in one read instead of scanning the breadcrumb table.
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    accuracyM: doublePrecision('accuracy_m'),
    heading: doublePrecision('heading'),
    speedMps: doublePrecision('speed_mps'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    index('trips_day_idx').on(t.schoolId, t.date, t.status),
    index('trips_active_idx').on(t.schoolId, t.isActive),
  ],
);

export const gpsLocations = pgTable(
  'gps_locations',
  {
    id: id(),
    tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    speed: doublePrecision('speed'),
    heading: doublePrecision('heading'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('gps_trip_idx').on(t.tripId, t.recordedAt)],
);

export const busEvents = pgTable(
  'bus_events',
  {
    id: id(),
    tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    studentId: text('student_id').references(() => students.id, { onDelete: 'cascade' }),
    stopId: text('stop_id').references(() => routeStops.id, { onDelete: 'set null' }),
    type: varchar('type', { length: 20 }).notNull(),
    note: varchar('note', { length: 200 }),
    createdAt: createdAt(),
  },
  (t) => [index('bus_events_trip_idx').on(t.tripId, t.createdAt)],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    subject: varchar('subject', { length: 160 }).notNull(),
    category: varchar('category', { length: 40 }).notNull().default('TECHNICAL'),
    body: text('body').notNull(),
    status: varchar('status', { length: 20 }).notNull().default('OPEN'),
    priority: varchar('priority', { length: 20 }).notNull().default('NORMAL'),
    createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('support_tickets_status_idx').on(t.schoolId, t.status)],
);

/* ========================================================================== */
/* RELATIONS (drizzle query API)                                               */
/* ========================================================================== */

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  settings: one(schoolSettings, { fields: [schools.id], references: [schoolSettings.schoolId] }),
  subscription: one(subscriptions, { fields: [schools.id], references: [subscriptions.schoolId] }),
  users: many(users),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  school: one(schools, { fields: [subscriptions.schoolId], references: [schools.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  school: one(schools, { fields: [users.schoolId], references: [schools.id] }),
  roles: many(userRoles),
  extraPermissions: many(userPermissions),
  teacher: one(teachers, { fields: [users.id], references: [teachers.userId] }),
  parent: one(parents, { fields: [users.id], references: [parents.userId] }),
  staff: one(staff, { fields: [users.id], references: [staff.userId] }),
  driver: one(drivers, { fields: [users.id], references: [drivers.userId] }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, { fields: [userRoles.userId], references: [users.id] }),
}));

export const userPermissionsRelations = relations(userPermissions, ({ one }) => ({
  user: one(users, { fields: [userPermissions.userId], references: [users.id] }),
}));

export const academicYearsRelations = relations(academicYears, ({ one, many }) => ({
  school: one(schools, { fields: [academicYears.schoolId], references: [schools.id] }),
  sections: many(sections),
}));

export const classLevelsRelations = relations(classLevels, ({ one, many }) => ({
  school: one(schools, { fields: [classLevels.schoolId], references: [schools.id] }),
  sections: many(sections),
  subjects: many(subjects),
}));

export const sectionsRelations = relations(sections, ({ one, many }) => ({
  school: one(schools, { fields: [sections.schoolId], references: [schools.id] }),
  class: one(classLevels, { fields: [sections.classId], references: [classLevels.id] }),
  academicYear: one(academicYears, { fields: [sections.academicYearId], references: [academicYears.id] }),
  classTeacher: one(teachers, { fields: [sections.classTeacherId], references: [teachers.id] }),
  enrollments: many(enrollments),
  assignments: many(teacherAssignments),
}));

export const subjectsRelations = relations(subjects, ({ one, many }) => ({
  school: one(schools, { fields: [subjects.schoolId], references: [schools.id] }),
  class: one(classLevels, { fields: [subjects.classId], references: [classLevels.id] }),
  teacherSubjects: many(teacherSubjects),
}));

export const teachersRelations = relations(teachers, ({ one, many }) => ({
  school: one(schools, { fields: [teachers.schoolId], references: [schools.id] }),
  user: one(users, { fields: [teachers.userId], references: [users.id] }),
  subjects: many(teacherSubjects),
  assignments: many(teacherAssignments),
}));

export const teacherSubjectsRelations = relations(teacherSubjects, ({ one }) => ({
  teacher: one(teachers, { fields: [teacherSubjects.teacherId], references: [teachers.id] }),
  subject: one(subjects, { fields: [teacherSubjects.subjectId], references: [subjects.id] }),
}));

export const teacherAssignmentsRelations = relations(teacherAssignments, ({ one }) => ({
  teacher: one(teachers, { fields: [teacherAssignments.teacherId], references: [teachers.id] }),
  section: one(sections, { fields: [teacherAssignments.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [teacherAssignments.subjectId], references: [subjects.id] }),
}));

export const staffRelations = relations(staff, ({ one }) => ({
  school: one(schools, { fields: [staff.schoolId], references: [schools.id] }),
  user: one(users, { fields: [staff.userId], references: [users.id] }),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  school: one(schools, { fields: [students.schoolId], references: [schools.id] }),
  user: one(users, { fields: [students.userId], references: [users.id] }),
  enrollments: many(enrollments),
  guardians: many(studentParents),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  student: one(students, { fields: [enrollments.studentId], references: [students.id] }),
  section: one(sections, { fields: [enrollments.sectionId], references: [sections.id] }),
  academicYear: one(academicYears, { fields: [enrollments.academicYearId], references: [academicYears.id] }),
}));

export const parentsRelations = relations(parents, ({ one, many }) => ({
  school: one(schools, { fields: [parents.schoolId], references: [schools.id] }),
  user: one(users, { fields: [parents.userId], references: [users.id] }),
  children: many(studentParents),
}));

export const studentParentsRelations = relations(studentParents, ({ one }) => ({
  student: one(students, { fields: [studentParents.studentId], references: [students.id] }),
  parent: one(parents, { fields: [studentParents.parentId], references: [parents.id] }),
}));

export const studentAttendanceRelations = relations(studentAttendance, ({ one }) => ({
  student: one(students, { fields: [studentAttendance.studentId], references: [students.id] }),
  section: one(sections, { fields: [studentAttendance.sectionId], references: [sections.id] }),
}));

export const periodsRelations = relations(periods, ({ many }) => ({ slots: many(timetableSlots) }));

export const timetableSlotsRelations = relations(timetableSlots, ({ one }) => ({
  section: one(sections, { fields: [timetableSlots.sectionId], references: [sections.id] }),
  period: one(periods, { fields: [timetableSlots.periodId], references: [periods.id] }),
  subject: one(subjects, { fields: [timetableSlots.subjectId], references: [subjects.id] }),
  teacher: one(teachers, { fields: [timetableSlots.teacherId], references: [teachers.id] }),
}));

export const examsRelations = relations(exams, ({ one, many }) => ({
  academicYear: one(academicYears, { fields: [exams.academicYearId], references: [academicYears.id] }),
  subjects: many(examSubjects),
}));

export const examSubjectsRelations = relations(examSubjects, ({ one, many }) => ({
  exam: one(exams, { fields: [examSubjects.examId], references: [exams.id] }),
  section: one(sections, { fields: [examSubjects.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [examSubjects.subjectId], references: [subjects.id] }),
  marks: many(marks),
}));

export const marksRelations = relations(marks, ({ one }) => ({
  exam: one(exams, { fields: [marks.examId], references: [exams.id] }),
  examSubject: one(examSubjects, { fields: [marks.examSubjectId], references: [examSubjects.id] }),
  student: one(students, { fields: [marks.studentId], references: [students.id] }),
}));

export const resultsRelations = relations(results, ({ one }) => ({
  exam: one(exams, { fields: [results.examId], references: [exams.id] }),
  student: one(students, { fields: [results.studentId], references: [students.id] }),
  section: one(sections, { fields: [results.sectionId], references: [sections.id] }),
}));

export const homeworkRelations = relations(homework, ({ one, many }) => ({
  section: one(sections, { fields: [homework.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [homework.subjectId], references: [subjects.id] }),
  teacher: one(teachers, { fields: [homework.teacherId], references: [teachers.id] }),
  submissions: many(homeworkSubmissions),
}));

export const homeworkSubmissionsRelations = relations(homeworkSubmissions, ({ one }) => ({
  homework: one(homework, { fields: [homeworkSubmissions.homeworkId], references: [homework.id] }),
  student: one(students, { fields: [homeworkSubmissions.studentId], references: [students.id] }),
  reviewedBy: one(teachers, { fields: [homeworkSubmissions.reviewedById], references: [teachers.id] }),
}));

export const assignmentsRelations = relations(assignments, ({ one, many }) => ({
  section: one(sections, { fields: [assignments.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [assignments.subjectId], references: [subjects.id] }),
  teacher: one(teachers, { fields: [assignments.teacherId], references: [teachers.id] }),
  submissions: many(assignmentSubmissions),
}));

export const assignmentSubmissionsRelations = relations(assignmentSubmissions, ({ one }) => ({
  assignment: one(assignments, { fields: [assignmentSubmissions.assignmentId], references: [assignments.id] }),
  student: one(students, { fields: [assignmentSubmissions.studentId], references: [students.id] }),
}));

export const leaveRequestsRelations = relations(leaveRequests, ({ one }) => ({
  student: one(students, { fields: [leaveRequests.studentId], references: [students.id] }),
  parent: one(parents, { fields: [leaveRequests.parentId], references: [parents.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
  school: one(schools, { fields: [auditLogs.schoolId], references: [schools.id] }),
}));

export const announcementsRelations = relations(announcements, ({ one }) => ({
  school: one(schools, { fields: [announcements.schoolId], references: [schools.id] }),
}));

/* ========================================================================== */
/* INFERRED TYPES                                                              */
/* ========================================================================== */

export type School = typeof schools.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type User = typeof users.$inferSelect;
export type AcademicYear = typeof academicYears.$inferSelect;
export type ClassLevel = typeof classLevels.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Teacher = typeof teachers.$inferSelect;
export type Staff = typeof staff.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Enrollment = typeof enrollments.$inferSelect;
export type Parent = typeof parents.$inferSelect;
export type StudentParent = typeof studentParents.$inferSelect;
export type Attendance = typeof studentAttendance.$inferSelect;
export type Period = typeof periods.$inferSelect;
export type TimetableSlot = typeof timetableSlots.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type ExamSubject = typeof examSubjects.$inferSelect;
export type Mark = typeof marks.$inferSelect;
export type Result = typeof results.$inferSelect;
export type Homework = typeof homework.$inferSelect;
export type HomeworkSubmission = typeof homeworkSubmissions.$inferSelect;
export type HomeworkReviewStatus = (typeof homeworkReviewEnum.enumValues)[number];
export type Assignment = typeof assignments.$inferSelect;
export type Announcement = typeof announcements.$inferSelect;
export type SchoolEvent = typeof events.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type RoleKey = (typeof roleKeyEnum.enumValues)[number];
export type AttendanceStatus = (typeof attendanceStatusEnum.enumValues)[number];

export const routesRelations = relations(routes, ({ one, many }) => ({
  school: one(schools, { fields: [routes.schoolId], references: [schools.id] }),
  bus: one(buses, { fields: [routes.busId], references: [buses.id] }),
  driver: one(drivers, { fields: [routes.driverId], references: [drivers.id], relationName: 'routeDriver' }),
  conductor: one(drivers, { fields: [routes.conductorId], references: [drivers.id], relationName: 'routeConductor' }),
  stops: many(routeStops),
  assignments: many(studentTransport),
}));

export const routeStopsRelations = relations(routeStops, ({ one }) => ({
  route: one(routes, { fields: [routeStops.routeId], references: [routes.id] }),
}));

export const driversRelations = relations(drivers, ({ one, many }) => ({
  user: one(users, { fields: [drivers.userId], references: [users.id] }),
  routes: many(routes, { relationName: 'routeDriver' }),
  attendedRoutes: many(routes, { relationName: 'routeConductor' }),
}));

export const busesRelations = relations(buses, ({ many }) => ({ routes: many(routes) }));

export const studentFeesRelations = relations(studentFees, ({ one, many }) => ({
  student: one(students, { fields: [studentFees.studentId], references: [students.id] }),
  academicYear: one(academicYears, { fields: [studentFees.academicYearId], references: [academicYears.id] }),
  feeStructure: one(feeStructures, { fields: [studentFees.feeStructureId], references: [feeStructures.id] }),
  concessions: many(feeConcessions),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  studentFee: one(studentFees, { fields: [payments.studentFeeId], references: [studentFees.id] }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  school: one(schools, { fields: [supportTickets.schoolId], references: [schools.id] }),
}));

/* ==========================================================================
   PHASE 4-10 ADDITIONS
   ========================================================================== */

/* ------------------------------- FINANCE -------------------------------- */

export const concessionTypeEnum = pgEnum('concession_type', [
  'SCHOLARSHIP',
  'SIBLING',
  'STAFF_WARD',
  'MERIT',
  'NEED_BASED',
  'OTHER',
]);

/** A standing reduction on a student's fees. Amount-or-percent, never both. */
export const feeConcessions = pgTable(
  'fee_concessions',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    academicYearId: text('academic_year_id').notNull().references(() => academicYears.id, { onDelete: 'cascade' }),
    type: concessionTypeEnum('type').notNull().default('OTHER'),
    percent: integer('percent'),
    amount: integer('amount'),
    reason: varchar('reason', { length: 300 }),
    approvedById: text('approved_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('fee_concessions_idx').on(t.schoolId, t.studentId)],
);

/** Every reminder sent, so escalation can tell what has already gone out. */
export const feeReminders = pgTable(
  'fee_reminders',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentFeeId: text('student_fee_id').notNull().references(() => studentFees.id, { onDelete: 'cascade' }),
    stage: varchar('stage', { length: 20 }).notNull(), // BEFORE_DUE | ON_DUE | OVERDUE | ESCALATION
    channels: text('channels').array().notNull().default(sql`ARRAY['IN_APP']::text[]`),
    sentAt: createdAt(),
  },
  (t) => [uniqueIndex('fee_reminders_unique').on(t.studentFeeId, t.stage)],
);

/* ------------------------------ TRANSPORT ------------------------------- */

/**
 * Proximity notice ledger.
 *
 * The unique index is the deduplication: a bus circling the same block cannot
 * ping a family twice for the same stage of the same trip.
 */
export const tripNotices = pgTable(
  'trip_notices',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    tripId: text('trip_id').notNull().references(() => trips.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 12 }).notNull(), // NEARBY | ARRIVED
    distanceM: integer('distance_m').notNull(),
    etaSeconds: integer('eta_seconds').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('trip_notices_unique').on(t.tripId, t.studentId, t.kind)],
);

/* --------------------------- COMMUNICATION ------------------------------ */

/**
 * A conversation between a guardian and a member of staff, always about one
 * student. Threads are never open-ended: the student is what authorises both
 * participants to be in the room.
 */
export const messageThreads = pgTable(
  'message_threads',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').notNull().references(() => parents.id, { onDelete: 'cascade' }),
    staffUserId: text('staff_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    subject: varchar('subject', { length: 160 }).notNull(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('message_threads_parent_idx').on(t.schoolId, t.parentId, t.lastMessageAt),
    index('message_threads_staff_idx').on(t.schoolId, t.staffUserId, t.lastMessageAt),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull().references(() => messageThreads.id, { onDelete: 'cascade' }),
    senderUserId: text('sender_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('messages_thread_idx').on(t.threadId, t.createdAt)],
);

/* ----------------------------- CERTIFICATES ----------------------------- */

export const certificates = pgTable(
  'certificates',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).notNull(), // BONAFIDE | TRANSFER | CHARACTER | ACHIEVEMENT | PARTICIPATION
    serialNumber: varchar('serial_number', { length: 40 }).notNull(),
    body: text('body').notNull(),
    issuedById: text('issued_by_id').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: createdAt(),
  },
  (t) => [
    uniqueIndex('certificates_serial_unique').on(t.schoolId, t.serialNumber),
    index('certificates_student_idx').on(t.schoolId, t.studentId),
  ],
);

/* -------------------------- PLATFORM BILLING ---------------------------- */

export const platformInvoices = pgTable(
  'platform_invoices',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    number: varchar('number', { length: 40 }).notNull().unique(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    status: varchar('status', { length: 20 }).notNull().default('DUE'), // DUE | PAID | VOID
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('platform_invoices_idx').on(t.schoolId, t.status)],
);

/* ------------------------- ADDITIONAL RELATIONS ------------------------- */

export const tripsRelations = relations(trips, ({ one, many }) => ({
  school: one(schools, { fields: [trips.schoolId], references: [schools.id] }),
  route: one(routes, { fields: [trips.routeId], references: [routes.id] }),
  bus: one(buses, { fields: [trips.busId], references: [buses.id] }),
  driver: one(drivers, { fields: [trips.driverId], references: [drivers.id] }),
  locations: many(gpsLocations),
  events: many(busEvents),
}));

export const gpsLocationsRelations = relations(gpsLocations, ({ one }) => ({
  trip: one(trips, { fields: [gpsLocations.tripId], references: [trips.id] }),
}));

export const busEventsRelations = relations(busEvents, ({ one }) => ({
  trip: one(trips, { fields: [busEvents.tripId], references: [trips.id] }),
  student: one(students, { fields: [busEvents.studentId], references: [students.id] }),
  stop: one(routeStops, { fields: [busEvents.stopId], references: [routeStops.id] }),
}));

export const studentTransportRelations = relations(studentTransport, ({ one }) => ({
  student: one(students, { fields: [studentTransport.studentId], references: [students.id] }),
  route: one(routes, { fields: [studentTransport.routeId], references: [routes.id] }),
  stop: one(routeStops, { fields: [studentTransport.stopId], references: [routeStops.id] }),
}));

export const messageThreadsRelations = relations(messageThreads, ({ one, many }) => ({
  student: one(students, { fields: [messageThreads.studentId], references: [students.id] }),
  parent: one(parents, { fields: [messageThreads.parentId], references: [parents.id] }),
  staffUser: one(users, { fields: [messageThreads.staffUserId], references: [users.id] }),
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  thread: one(messageThreads, { fields: [messages.threadId], references: [messageThreads.id] }),
  sender: one(users, { fields: [messages.senderUserId], references: [users.id] }),
}));

export const feeConcessionsRelations = relations(feeConcessions, ({ one }) => ({
  student: one(students, { fields: [feeConcessions.studentId], references: [students.id] }),
}));

export const certificatesRelations = relations(certificates, ({ one }) => ({
  student: one(students, { fields: [certificates.studentId], references: [students.id] }),
}));

export const feeStructuresRelations = relations(feeStructures, ({ one, many }) => ({
  academicYear: one(academicYears, { fields: [feeStructures.academicYearId], references: [academicYears.id] }),
  class: one(classLevels, { fields: [feeStructures.classId], references: [classLevels.id] }),
  items: many(feeStructureItems),
}));

export const feeStructureItemsRelations = relations(feeStructureItems, ({ one }) => ({
  feeStructure: one(feeStructures, { fields: [feeStructureItems.feeStructureId], references: [feeStructures.id] }),
  category: one(feeCategories, { fields: [feeStructureItems.categoryId], references: [feeCategories.id] }),
}));

export type FeeConcession = typeof feeConcessions.$inferSelect;
export type MessageThread = typeof messageThreads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Certificate = typeof certificates.$inferSelect;
export type Trip = typeof trips.$inferSelect;

/* ------------------------------- LIBRARY -------------------------------- */

export const loanStatusEnum = pgEnum('loan_status', ['ISSUED', 'RETURNED', 'OVERDUE', 'LOST']);

export const libraryBooks = pgTable(
  'library_books',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    author: varchar('author', { length: 160 }),
    isbn: varchar('isbn', { length: 20 }),
    category: varchar('category', { length: 60 }),
    publisher: varchar('publisher', { length: 160 }),
    shelf: varchar('shelf', { length: 40 }),
    // Copies held, not copies available — availability is derived from open loans
    // so the two can never disagree.
    totalCopies: integer('total_copies').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index('library_books_title_idx').on(t.schoolId, t.title),
    uniqueIndex('library_books_isbn_unique').on(t.schoolId, t.isbn),
  ],
);

export const libraryLoans = pgTable(
  'library_loans',
  {
    id: id(),
    schoolId: text('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    bookId: text('book_id').notNull().references(() => libraryBooks.id, { onDelete: 'restrict' }),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    issuedById: text('issued_by_id').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    dueDate: date('due_date').notNull(),
    returnedAt: timestamp('returned_at', { withTimezone: true }),
    fineAmount: integer('fine_amount').notNull().default(0),
    status: loanStatusEnum('status').notNull().default('ISSUED'),
    note: varchar('note', { length: 200 }),
  },
  (t) => [
    index('library_loans_student_idx').on(t.schoolId, t.studentId, t.status),
    index('library_loans_book_idx').on(t.schoolId, t.bookId, t.status),
  ],
);

export const libraryBooksRelations = relations(libraryBooks, ({ many }) => ({ loans: many(libraryLoans) }));

export const libraryLoansRelations = relations(libraryLoans, ({ one }) => ({
  book: one(libraryBooks, { fields: [libraryLoans.bookId], references: [libraryBooks.id] }),
  student: one(students, { fields: [libraryLoans.studentId], references: [students.id] }),
}));

export type LibraryBook = typeof libraryBooks.$inferSelect;
export type LibraryLoan = typeof libraryLoans.$inferSelect;
