import { z } from 'zod';
import { cuid, dateSchema, emailSchema, phoneSchema } from './common';

/* ---------------------------------- auth --------------------------------- */
export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email'),
  password: z.string().min(1, 'Enter your password'),
});

export const otpRequestSchema = z.object({ schoolId: cuid, phone: phoneSchema });
export const otpVerifySchema = z.object({
  schoolId: cuid,
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

/* --------------------------------- school -------------------------------- */
export const schoolCreateSchema = z.object({
  name: z.string().trim().min(3, 'School name is required'),
  registrationNumber: z.string().trim().optional().or(z.literal('')),
  addressLine: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  state: z.string().trim().optional().or(z.literal('')),
  country: z.string().trim().default('India'),
  postalCode: z.string().trim().optional().or(z.literal('')),
  phone: z.string().trim().optional().or(z.literal('')),
  email: emailSchema,
  website: z.string().trim().optional().or(z.literal('')),
  principalName: z.string().trim().optional().or(z.literal('')),
  schoolType: z.string().trim().optional().or(z.literal('')),
  board: z.string().trim().optional().or(z.literal('')),
  medium: z.string().trim().optional().or(z.literal('')),
  timezone: z.string().default('Asia/Kolkata'),
  planCode: z.string().default('STARTER'),
  adminName: z.string().trim().min(2, 'Admin name is required'),
  adminEmail: emailSchema,
  adminPassword: z.string().min(8, 'Use at least 8 characters'),
});

export const schoolUpdateSchema = schoolCreateSchema
  .omit({ adminName: true, adminEmail: true, adminPassword: true, planCode: true })
  .partial();

export const schoolStatusSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED']),
  reason: z.string().trim().optional(),
});

export const schoolSettingsSchema = z.object({
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  studentLoginEnabled: z.boolean().optional(),
  parentOtpEnabled: z.boolean().optional(),
  attendanceEditWindowHours: z.coerce.number().int().min(0).max(720).optional(),
  notifyParentOnAbsence: z.boolean().optional(),
  lowAttendanceThreshold: z.coerce.number().int().min(0).max(100).optional(),
  resultsRequireApproval: z.boolean().optional(),
});

/* -------------------------------- academic ------------------------------- */
export const academicYearSchema = z
  .object({
    name: z.string().trim().min(4, 'e.g. 2026-27'),
    startDate: dateSchema,
    endDate: dateSchema,
    isCurrent: z.boolean().default(false),
  })
  .refine((v) => v.endDate > v.startDate, { message: 'End date must be after the start date', path: ['endDate'] });

export const classSchema = z.object({
  name: z.string().trim().min(1, 'Class name is required'),
  level: z.coerce.number().int().min(0).max(20),
});

export const sectionSchema = z.object({
  classId: cuid,
  academicYearId: cuid,
  name: z.string().trim().min(1, 'Section name is required').max(4),
  capacity: z.coerce.number().int().min(1).max(200).default(40),
  roomNumber: z.string().trim().optional().or(z.literal('')),
  classTeacherId: z.string().optional().nullable(),
});

export const subjectSchema = z.object({
  name: z.string().trim().min(2, 'Subject name is required'),
  code: z.string().trim().min(2, 'Subject code is required').max(16),
  classId: z.string().optional().nullable(),
  isElective: z.boolean().default(false),
});

/* --------------------------------- people -------------------------------- */
export const teacherSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: emailSchema,
  phone: phoneSchema,
  employeeId: z.string().trim().min(1, 'Employee ID is required'),
  qualification: z.string().trim().optional().or(z.literal('')),
  designation: z.string().trim().optional().or(z.literal('')),
  joiningDate: dateSchema.optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  password: z.string().min(8, 'Use at least 8 characters').optional(),
  subjectIds: z.array(cuid).default([]),
  isPrincipal: z.boolean().default(false),
});

export const staffSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  email: emailSchema,
  phone: phoneSchema,
  employeeId: z.string().trim().min(1, 'Employee ID is required'),
  designation: z.string().trim().min(2, 'Designation is required'),
  department: z.string().trim().optional().or(z.literal('')),
  password: z.string().min(8).optional(),
});

export const studentSchema = z.object({
  admissionNumber: z.string().trim().min(1, 'Admission number is required'),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  dateOfBirth: dateSchema.optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  bloodGroup: z.string().trim().optional().or(z.literal('')),
  addressLine: z.string().trim().optional().or(z.literal('')),
  city: z.string().trim().optional().or(z.literal('')),
  admissionDate: dateSchema.optional(),
  previousSchool: z.string().trim().optional().or(z.literal('')),
  emergencyContactName: z.string().trim().optional().or(z.literal('')),
  emergencyContactPhone: z.string().trim().optional().or(z.literal('')),
  sectionId: cuid,
  rollNumber: z.coerce.number().int().min(1).optional(),
});

export const studentUpdateSchema = studentSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN']).optional(),
});

export const parentLinkSchema = z.object({
  studentId: cuid,
  name: z.string().trim().min(2, 'Name is required'),
  phone: phoneSchema,
  email: z.string().trim().email().optional().or(z.literal('')),
  relation: z.enum(['FATHER', 'MOTHER', 'GUARDIAN', 'OTHER']).default('GUARDIAN'),
  access: z.enum(['FULL', 'LIMITED']).default('FULL'),
  occupation: z.string().trim().optional().or(z.literal('')),
  isPrimary: z.boolean().default(false),
});

export const teacherAssignmentSchema = z.object({
  teacherId: cuid,
  sectionId: cuid,
  subjectId: z.string().optional().nullable(),
  isClassTeacher: z.boolean().default(false),
});

/* ------------------------------- attendance ------------------------------ */
export const attendanceMarkSchema = z.object({
  sectionId: cuid,
  date: dateSchema,
  entries: z
    .array(
      z.object({
        studentId: cuid,
        status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'EXCUSED']),
        remarks: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'Mark at least one student'),
});

/* -------------------------------- timetable ------------------------------ */
export const periodSchema = z.object({
  name: z.string().trim().min(1),
  order: z.coerce.number().int().min(1).max(20),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  isBreak: z.boolean().default(false),
});

export const timetableSlotSchema = z.object({
  sectionId: cuid,
  periodId: cuid,
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  subjectId: z.string().nullable().optional(),
  teacherId: z.string().nullable().optional(),
  room: z.string().trim().optional().or(z.literal('')),
});

/* -------------------------------- homework ------------------------------- */
export const homeworkSchema = z.object({
  sectionId: cuid,
  subjectId: cuid,
  title: z.string().trim().min(3, 'Title is required'),
  description: z.string().trim().min(3, 'Description is required'),
  dueDate: dateSchema,
  allowSubmission: z.boolean().default(false),
});

/** A student marking their own homework done — note and link are both optional. */
export const homeworkSubmitSchema = z.object({
  note: z.string().trim().max(500, 'Keep the note under 500 characters').optional(),
  link: z.string().trim().max(500).url('Enter a valid link, starting with https://').optional().or(z.literal('')),
});

/** A teacher acknowledging one or more students on a single homework item. */
export const homeworkReviewSchema = z.object({
  entries: z
    .array(
      z.object({
        studentId: cuid,
        status: z.enum(['PENDING', 'ACKNOWLEDGED', 'NEEDS_REWORK']),
        feedback: z.string().trim().max(500, 'Keep feedback under 500 characters').optional(),
      }),
    )
    .min(1, 'Select at least one student')
    .max(200),
});

export const assignmentSchema = homeworkSchema.extend({
  maxMarks: z.coerce.number().int().min(1).max(500).default(20),
  allowLate: z.boolean().default(true),
});

export const submissionGradeSchema = z.object({
  marks: z.coerce.number().min(0).optional(),
  feedback: z.string().trim().max(500).optional(),
  status: z.enum(['PENDING', 'SUBMITTED', 'LATE', 'GRADED']).optional(),
});

/* ---------------------------------- exams -------------------------------- */
export const examSchema = z
  .object({
    academicYearId: cuid,
    name: z.string().trim().min(2, 'Exam name is required'),
    type: z.string().default('UNIT_TEST'),
    startDate: dateSchema,
    endDate: dateSchema,
    weightage: z.coerce.number().int().min(1).max(100).default(100),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'End date must be on or after the start date', path: ['endDate'] });

export const examSubjectSchema = z.object({
  sectionId: cuid,
  subjectId: cuid,
  examDate: dateSchema.optional(),
  startTime: z.string().optional().or(z.literal('')),
  maxMarks: z.coerce.number().int().min(1).max(500).default(100),
  passingMarks: z.coerce.number().int().min(0).max(500).default(35),
});

export const marksEntrySchema = z.object({
  examSubjectId: cuid,
  entries: z
    .array(
      z.object({
        studentId: cuid,
        marksObtained: z.coerce.number().min(0).nullable().optional(),
        isAbsent: z.boolean().default(false),
        remarks: z.string().trim().max(200).optional(),
      }),
    )
    .min(1),
});

/* ----------------------------- communication ----------------------------- */
export const announcementSchema = z.object({
  title: z.string().trim().min(3, 'Title is required'),
  body: z.string().trim().min(3, 'Message is required'),
  type: z.enum(['GENERAL', 'EMERGENCY', 'ACADEMIC', 'EXAM', 'HOLIDAY', 'FEE', 'TRANSPORT', 'EVENT']).default('GENERAL'),
  audience: z.array(z.string()).default(['PARENT', 'TEACHER', 'STUDENT']),
  sectionIds: z.array(z.string()).default([]),
  isPinned: z.boolean().default(false),
  channels: z.array(z.enum(['IN_APP', 'SMS', 'EMAIL', 'PUSH'])).default(['IN_APP']),
});

export const eventSchema = z.object({
  title: z.string().trim().min(3, 'Title is required'),
  description: z.string().trim().optional().or(z.literal('')),
  category: z.string().default('GENERAL'),
  startAt: dateSchema,
  endAt: dateSchema.optional(),
  location: z.string().trim().optional().or(z.literal('')),
  audience: z.array(z.string()).default(['PARENT', 'TEACHER', 'STUDENT']),
  requiresRsvp: z.boolean().default(false),
});

export const leaveRequestSchema = z
  .object({
    studentId: z.string().optional(),
    fromDate: dateSchema,
    toDate: dateSchema,
    reason: z.string().trim().min(3, 'Please give a reason'),
  })
  .refine((v) => v.toDate >= v.fromDate, { message: 'End date must be on or after the start date', path: ['toDate'] });

export const leaveDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  decisionNote: z.string().trim().max(300).optional(),
});
