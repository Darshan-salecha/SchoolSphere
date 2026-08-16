import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import type { Db } from '@/db';
import * as t from '@/db/schema';
import { gradeFor } from '@/lib/utils';
import { DEMO_PASSWORD, FAMILIES, FEE_CATEGORIES, PERIOD_TEMPLATE, STAFF, STUDENTS, SUBJECT_SET, TEACHERS } from './seed-data';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
const pick = <T,>(arr: readonly T[], i: number) => arr[i % arr.length];

/** Deterministic pseudo-random so every seed run produces the same demo story. */
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

export async function seed(db: Db, opts: { log?: boolean } = {}) {
  const log = (m: string) => opts.log !== false && console.log(`  ${m}`);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const today = new Date();

  /* ---------------------------------- plans -------------------------------- */
  const planRows = await db
    .insert(t.plans)
    .values([
      { name: 'Starter', code: 'STARTER', priceMonthly: 499000, maxStudents: 500, maxTeachers: 40, features: ['attendance', 'exams', 'announcements'] },
      { name: 'Professional', code: 'PROFESSIONAL', priceMonthly: 1299000, maxStudents: 2000, maxTeachers: 150, features: ['attendance', 'exams', 'announcements', 'fees', 'transport', 'analytics'] },
      { name: 'Enterprise', code: 'ENTERPRISE', priceMonthly: 2999000, maxStudents: 10000, maxTeachers: 800, features: ['attendance', 'exams', 'announcements', 'fees', 'transport', 'analytics', 'api', 'branding', 'sms'] },
    ])
    .returning();
  const plan = (code: string) => planRows.find((p) => p.code === code)!;
  log(`plans: ${planRows.length}`);

  /* ----------------------------- platform admins --------------------------- */
  const [platformAdmin] = await db
    .insert(t.users)
    .values({ name: 'Platform Admin', email: 'admin@schoolsphere.io', phone: '9000000001', passwordHash })
    .returning();
  await db.insert(t.userRoles).values({ userId: platformAdmin.id, role: 'PLATFORM_SUPER_ADMIN' });

  const [supportUser] = await db
    .insert(t.users)
    .values({ name: 'Platform Support', email: 'support@schoolsphere.io', phone: '9000000002', passwordHash })
    .returning();
  await db.insert(t.userRoles).values({ userId: supportUser.id, role: 'PLATFORM_SUPPORT' });

  /* ------------------------------ primary school --------------------------- */
  const [school] = await db
    .insert(t.schools)
    .values({
      code: 'SCHOOL-0001',
      slug: 'delhi-public-academy',
      name: 'Delhi Public Academy',
      registrationNumber: 'DL/EDU/2009/4471',
      addressLine: '12 Rajpath Marg, Sector 14',
      city: 'New Delhi',
      state: 'Delhi',
      postalCode: '110001',
      phone: '01145670000',
      email: 'office@dpa.edu',
      website: 'https://dpa.edu',
      principalName: 'Dr. Sunita Rao',
      schoolType: 'K-12',
      board: 'CBSE',
      medium: 'English',
      status: 'ACTIVE',
      setupCompleted: true,
      setupStep: 13,
      lastActiveAt: today,
    })
    .returning();

  await db.insert(t.schoolSettings).values({ schoolId: school.id, studentLoginEnabled: true });
  await db.insert(t.subscriptions).values({
    schoolId: school.id,
    planId: plan('PROFESSIONAL').id,
    status: 'ACTIVE',
    currentPeriodEnd: addDays(today, 300),
  });
  log(`school: ${school.name}`);

  /* ----------------------------- academic years ---------------------------- */
  const years = await db
    .insert(t.academicYears)
    .values([
      { schoolId: school.id, name: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31', isCurrent: false, isArchived: true },
      { schoolId: school.id, name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true },
    ])
    .returning();
  const year = years.find((y) => y.isCurrent)!;

  /* --------------------------- classes and sections ------------------------ */
  const classRows = await db
    .insert(t.classLevels)
    .values([
      { schoolId: school.id, name: 'Class 1', level: 1 },
      { schoolId: school.id, name: 'Class 2', level: 2 },
      { schoolId: school.id, name: 'Class 5', level: 5 },
      { schoolId: school.id, name: 'Class 10', level: 10 },
    ])
    .returning();
  const classByName = new Map(classRows.map((c) => [c.name, c]));

  const subjectRows = await db
    .insert(t.subjects)
    .values(SUBJECT_SET.map((s) => ({ schoolId: school.id, name: s.name, code: s.code })))
    .returning();
  const subjectByCode = new Map(subjectRows.map((s) => [s.code, s]));

  /* --------------------------------- people -------------------------------- */
  const [adminUser] = await db
    .insert(t.users)
    .values({ schoolId: school.id, name: 'Ananya Desai', email: 'admin@dpa.edu', phone: '9840000001', passwordHash })
    .returning();
  await db.insert(t.userRoles).values({ userId: adminUser.id, role: 'SCHOOL_ADMIN' });

  const [principalUser] = await db
    .insert(t.users)
    .values({ schoolId: school.id, name: 'Dr. Sunita Rao', email: 'principal@dpa.edu', phone: '9840000002', passwordHash })
    .returning();
  await db.insert(t.userRoles).values({ userId: principalUser.id, role: 'PRINCIPAL' });

  const teacherRecords: { id: string; userId: string; subjectCode: string; name: string }[] = [];
  for (const spec of TEACHERS) {
    const [u] = await db
      .insert(t.users)
      .values({ schoolId: school.id, name: spec.name, email: spec.email, phone: spec.phone, passwordHash })
      .returning();
    await db.insert(t.userRoles).values({ userId: u.id, role: 'TEACHER' });
    const [teacher] = await db
      .insert(t.teachers)
      .values({
        schoolId: school.id,
        userId: u.id,
        employeeId: spec.employeeId,
        qualification: spec.qualification,
        designation: spec.designation,
        joiningDate: '2022-06-01',
        gender: spec.name.match(/^(Meera|Anjali|Kavita|Deepa|Ritu)/) ? 'FEMALE' : 'MALE',
      })
      .returning();
    await db.insert(t.teacherSubjects).values({
      schoolId: school.id,
      teacherId: teacher.id,
      subjectId: subjectByCode.get(spec.subject)!.id,
    });
    teacherRecords.push({ id: teacher.id, userId: u.id, subjectCode: spec.subject, name: spec.name });
  }
  log(`teachers: ${teacherRecords.length}`);

  for (const spec of STAFF) {
    const [u] = await db
      .insert(t.users)
      .values({ schoolId: school.id, name: spec.name, email: spec.email, phone: spec.phone, passwordHash })
      .returning();
    await db.insert(t.userRoles).values({ userId: u.id, role: 'STAFF' });
    await db.insert(t.staff).values({
      schoolId: school.id,
      userId: u.id,
      employeeId: spec.employeeId,
      designation: spec.designation,
      department: spec.department,
      joiningDate: '2023-04-01',
    });
  }

  /* -------------------------------- sections ------------------------------- */
  const SECTION_SPECS = [
    { key: '1-A', className: 'Class 1', name: 'A', classTeacher: 'Ritu Bansal', room: '101' },
    { key: '1-B', className: 'Class 1', name: 'B', classTeacher: 'Kavita Rao', room: '102' },
    { key: '2-A', className: 'Class 2', name: 'A', classTeacher: 'Anjali Nair', room: '201' },
    { key: '5-A', className: 'Class 5', name: 'A', classTeacher: 'Meera Iyer', room: '501' },
    { key: '10-A', className: 'Class 10', name: 'A', classTeacher: 'Vikram Singh', room: '1001' },
  ];

  const sectionByKey = new Map<string, typeof t.sections.$inferSelect>();
  for (const spec of SECTION_SPECS) {
    const classTeacher = teacherRecords.find((tr) => tr.name === spec.classTeacher)!;
    const [section] = await db
      .insert(t.sections)
      .values({
        schoolId: school.id,
        classId: classByName.get(spec.className)!.id,
        academicYearId: year.id,
        name: spec.name,
        roomNumber: spec.room,
        classTeacherId: classTeacher.id,
      })
      .returning();
    sectionByKey.set(spec.key, section);

    // Class teacher gets section-wide rights; every subject teacher gets their pair.
    await db.insert(t.teacherAssignments).values({
      schoolId: school.id,
      teacherId: classTeacher.id,
      sectionId: section.id,
      subjectId: null,
      isClassTeacher: true,
    });
    for (const [i, subject] of subjectRows.entries()) {
      const teacher = teacherRecords.filter((tr) => tr.subjectCode === subject.code)[0] ?? pick(teacherRecords, i);
      await db
        .insert(t.teacherAssignments)
        .values({ schoolId: school.id, teacherId: teacher.id, sectionId: section.id, subjectId: subject.id, isClassTeacher: false })
        .onConflictDoNothing();
    }
  }
  log(`sections: ${sectionByKey.size}`);

  /* --------------------------- students and parents ------------------------ */
  const parentByFamily = new Map<string, { id: string; userId: string }[]>();
  for (const family of FAMILIES) {
    const guardians: { id: string; userId: string }[] = [];
    for (const [idx, spec] of [
      { name: family.father, relation: 'FATHER' as const, phone: family.phone },
      { name: family.mother, relation: 'MOTHER' as const, phone: family.altPhone },
    ].entries()) {
      const [u] = await db
        .insert(t.users)
        .values({ schoolId: school.id, name: spec.name, phone: spec.phone, email: null })
        .returning();
      await db.insert(t.userRoles).values({ userId: u.id, role: 'PARENT' });
      const [parent] = await db
        .insert(t.parents)
        .values({
          schoolId: school.id,
          userId: u.id,
          phone: spec.phone,
          occupation: idx === 0 ? family.occupation : 'Homemaker',
          addressLine: `${10 + Number(family.key.slice(1))} Green Park Extension, New Delhi`,
        })
        .returning();
      guardians.push({ id: parent.id, userId: u.id });
    }
    parentByFamily.set(family.key, guardians);
  }

  const studentRecords: { id: string; sectionKey: string; name: string }[] = [];
  for (const [i, spec] of STUDENTS.entries()) {
    const section = sectionByKey.get(spec.section)!;
    const [student] = await db
      .insert(t.students)
      .values({
        schoolId: school.id,
        admissionNumber: `DPA-${String(1001 + i)}`,
        firstName: spec.first,
        lastName: spec.last,
        gender: spec.gender,
        dateOfBirth: iso(addDays(new Date('2014-01-01'), i * 37)),
        bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O-'], i),
        addressLine: `${20 + i} Green Park Extension`,
        city: 'New Delhi',
        admissionDate: '2026-04-05',
        emergencyContactName: FAMILIES.find((f) => f.key === spec.family)?.father ?? null,
        emergencyContactPhone: FAMILIES.find((f) => f.key === spec.family)?.phone ?? null,
      })
      .returning();

    await db.insert(t.enrollments).values({
      schoolId: school.id,
      studentId: student.id,
      sectionId: section.id,
      academicYearId: year.id,
      rollNumber: studentRecords.filter((s) => s.sectionKey === spec.section).length + 1,
    });

    const guardians = parentByFamily.get(spec.family)!;
    await db.insert(t.studentParents).values([
      { schoolId: school.id, studentId: student.id, parentId: guardians[0].id, relation: 'FATHER', access: 'FULL', isPrimary: true },
      { schoolId: school.id, studentId: student.id, parentId: guardians[1].id, relation: 'MOTHER', access: 'FULL' },
    ]);

    studentRecords.push({ id: student.id, sectionKey: spec.section, name: `${spec.first} ${spec.last}` });
  }
  log(`students: ${studentRecords.length}, guardians: ${parentByFamily.size * 2}`);

  // One student login, to demonstrate the optional student portal.
  const aarav = studentRecords[0];
  const [aaravUser] = await db
    .insert(t.users)
    .values({ schoolId: school.id, name: 'Aarav Sharma', email: 'aarav.sharma@dpa.edu', phone: '9850000001', passwordHash })
    .returning();
  await db.insert(t.userRoles).values({ userId: aaravUser.id, role: 'STUDENT' });
  await db.update(t.students).set({ userId: aaravUser.id }).where(sql`${t.students.id} = ${aarav.id}`);

  /* -------------------------------- timetable ------------------------------ */
  const periodRows = await db
    .insert(t.periods)
    .values(PERIOD_TEMPLATE.map((p) => ({ ...p, schoolId: school.id })))
    .returning();
  const teachingPeriods = periodRows.filter((p) => !p.isBreak).sort((a, b) => a.order - b.order);

  const slotValues: (typeof t.timetableSlots.$inferInsert)[] = [];
  for (const [sIdx, section] of [...sectionByKey.values()].entries()) {
    for (let day = 1; day <= 5; day++) {
      for (const [pIdx, period] of teachingPeriods.entries()) {
        const subject = subjectRows[(sIdx + day + pIdx) % subjectRows.length];
        const teacher =
          teacherRecords.filter((tr) => tr.subjectCode === subject.code)[sIdx % 2] ??
          teacherRecords.find((tr) => tr.subjectCode === subject.code)!;
        slotValues.push({
          schoolId: school.id,
          sectionId: section.id,
          periodId: period.id,
          dayOfWeek: day,
          subjectId: subject.id,
          teacherId: teacher.id,
          room: section.roomNumber,
        });
      }
    }
  }
  await db.insert(t.timetableSlots).values(slotValues);
  log(`timetable slots: ${slotValues.length}`);

  /* ------------------------------- attendance ------------------------------ */
  const random = rng(42);
  const attendanceValues: (typeof t.studentAttendance.$inferInsert)[] = [];
  for (let back = 30; back >= 0; back--) {
    const day = addDays(today, -back);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    for (const student of studentRecords) {
      const r = random();
      const status = r > 0.94 ? 'ABSENT' : r > 0.9 ? 'LATE' : r > 0.885 ? 'EXCUSED' : 'PRESENT';
      const section = sectionByKey.get(student.sectionKey)!;
      attendanceValues.push({
        schoolId: school.id,
        studentId: student.id,
        sectionId: section.id,
        date: iso(day),
        status,
        markedById: section.classTeacherId,
      });
    }
  }
  for (let i = 0; i < attendanceValues.length; i += 500) {
    await db.insert(t.studentAttendance).values(attendanceValues.slice(i, i + 500));
  }
  log(`attendance rows: ${attendanceValues.length}`);

  /* --------------------------------- exams --------------------------------- */
  const examRows = await db
    .insert(t.exams)
    .values([
      {
        schoolId: school.id,
        academicYearId: year.id,
        name: 'Unit Test 1',
        type: 'UNIT_TEST',
        startDate: iso(addDays(today, -25)),
        endDate: iso(addDays(today, -20)),
        weightage: 20,
        status: 'RESULTS_PUBLISHED',
      },
      {
        schoolId: school.id,
        academicYearId: year.id,
        name: 'Mid Term',
        type: 'MID_TERM',
        startDate: iso(addDays(today, 12)),
        endDate: iso(addDays(today, 20)),
        weightage: 40,
        status: 'SCHEDULED',
      },
    ])
    .returning();

  for (const exam of examRows) {
    const examSubjectValues: (typeof t.examSubjects.$inferInsert)[] = [];
    for (const section of sectionByKey.values()) {
      for (const [i, subject] of subjectRows.entries()) {
        examSubjectValues.push({
          schoolId: school.id,
          examId: exam.id,
          sectionId: section.id,
          subjectId: subject.id,
          examDate: iso(addDays(new Date(exam.startDate), i)),
          startTime: '09:00',
          maxMarks: 100,
          passingMarks: 35,
        });
      }
    }
    const inserted = await db.insert(t.examSubjects).values(examSubjectValues).returning();

    if (exam.status !== 'RESULTS_PUBLISHED') continue;

    // Marks + computed results for the completed exam.
    const markValues: (typeof t.marks.$inferInsert)[] = [];
    const totals = new Map<string, { total: number; max: number; sectionId: string }>();
    for (const es of inserted) {
      const section = [...sectionByKey.values()].find((s) => s.id === es.sectionId)!;
      const sectionKey = [...sectionByKey.entries()].find(([, v]) => v.id === section.id)![0];
      for (const student of studentRecords.filter((s) => s.sectionKey === sectionKey)) {
        const score = Math.round(45 + random() * 53);
        markValues.push({
          schoolId: school.id,
          examId: exam.id,
          examSubjectId: es.id,
          studentId: student.id,
          marksObtained: score,
          grade: gradeFor(score),
          enteredById: section.classTeacherId,
        });
        const agg = totals.get(student.id) ?? { total: 0, max: 0, sectionId: section.id };
        agg.total += score;
        agg.max += es.maxMarks;
        totals.set(student.id, agg);
      }
    }
    for (let i = 0; i < markValues.length; i += 500) {
      await db.insert(t.marks).values(markValues.slice(i, i + 500));
    }

    const bySection = new Map<string, { studentId: string; pct: number; total: number; max: number }[]>();
    for (const [studentId, agg] of totals) {
      const list = bySection.get(agg.sectionId) ?? [];
      list.push({ studentId, pct: (agg.total / agg.max) * 100, total: agg.total, max: agg.max });
      bySection.set(agg.sectionId, list);
    }
    const resultValues: (typeof t.results.$inferInsert)[] = [];
    for (const [sectionId, list] of bySection) {
      list.sort((a, b) => b.pct - a.pct);
      list.forEach((row, idx) => {
        resultValues.push({
          schoolId: school.id,
          examId: exam.id,
          studentId: row.studentId,
          sectionId,
          totalMarks: row.total,
          maxMarks: row.max,
          percentage: Math.round(row.pct * 10) / 10,
          grade: gradeFor(row.pct),
          rank: idx + 1,
          isPublished: true,
          publishedAt: addDays(today, -18),
          teacherRemark: row.pct > 80 ? 'Excellent, consistent work.' : row.pct > 60 ? 'Good progress this term.' : 'Needs more practice at home.',
        });
      });
    }
    await db.insert(t.results).values(resultValues);
    log(`marks: ${markValues.length}, results: ${resultValues.length}`);
  }

  /* -------------------------- homework & assignments ----------------------- */
  const homeworkValues: (typeof t.homework.$inferInsert)[] = [];
  const assignmentValues: (typeof t.assignments.$inferInsert)[] = [];
  for (const [key, section] of sectionByKey) {
    for (const [i, subject] of subjectRows.slice(0, 4).entries()) {
      const teacher = teacherRecords.find((tr) => tr.subjectCode === subject.code)!;
      homeworkValues.push({
        schoolId: school.id,
        sectionId: section.id,
        subjectId: subject.id,
        teacherId: teacher.id,
        title: `${subject.name}: worksheet ${i + 1}`,
        description: `Complete worksheet ${i + 1} covering this week's chapter. Show all working in your notebook.`,
        assignedOn: iso(addDays(today, -i - 1)),
        dueDate: iso(addDays(today, 3 - i)),
        allowSubmission: i % 2 === 0,
      });
      if (i < 2) {
        assignmentValues.push({
          schoolId: school.id,
          sectionId: section.id,
          subjectId: subject.id,
          teacherId: teacher.id,
          title: `${subject.name} project — ${key}`,
          description: `Prepare a short project on the current unit. Submit as a single PDF.`,
          maxMarks: 20,
          dueDate: iso(addDays(today, 7 + i)),
        });
      }
    }
  }
  const homeworkRows = await db.insert(t.homework).values(homeworkValues).returning();
  await db.insert(t.assignments).values(assignmentValues);

  // Homework tracking: most of the class ticks it off, the teacher has worked
  // through part of the pile, and one or two are sent back for a redo.
  const sectionKeyById = new Map([...sectionByKey].map(([key, section]) => [section.id, key]));
  const submissionValues: (typeof t.homeworkSubmissions.$inferInsert)[] = [];
  for (const [hIdx, hw] of homeworkRows.entries()) {
    const classmates = studentRecords.filter((s) => s.sectionKey === sectionKeyById.get(hw.sectionId));
    const overdue = hw.dueDate < iso(today);
    for (const [sIdx, student] of classmates.entries()) {
      // Roughly one in five has not done it yet — no row at all, which is the
      // real-world "nothing recorded" state the tracker has to handle.
      if ((sIdx + hIdx) % 5 === 0) continue;
      const late = overdue && (sIdx + hIdx) % 4 === 0;
      const reviewed = hIdx % 2 === 0 && sIdx % 3 !== 2;
      const rework = reviewed && (sIdx + hIdx) % 7 === 0;
      submissionValues.push({
        schoolId: school.id,
        homeworkId: hw.id,
        studentId: student.id,
        status: late ? 'LATE' : 'SUBMITTED',
        note: sIdx % 3 === 0 ? 'Completed in my notebook.' : null,
        submittedAt: addDays(today, late ? 1 : -1),
        reviewStatus: rework ? 'NEEDS_REWORK' : reviewed ? 'ACKNOWLEDGED' : 'PENDING',
        feedback: rework ? 'Please redo questions 3 and 4 and show your working.' : null,
        reviewedById: reviewed ? hw.teacherId : null,
        reviewedAt: reviewed ? addDays(today, 0) : null,
      });
    }
  }
  if (submissionValues.length) await db.insert(t.homeworkSubmissions).values(submissionValues);
  log(
    `homework: ${homeworkValues.length}, assignments: ${assignmentValues.length}, homework tracking: ${submissionValues.length}`,
  );

  /* --------------------------- announcements & events ---------------------- */
  await db.insert(t.announcements).values([
    {
      schoolId: school.id,
      title: 'Mid Term examination schedule published',
      body: 'The Mid Term timetable is now available under Exams. Please ensure students revise the covered syllabus.',
      type: 'EXAM',
      audience: ['PARENT', 'TEACHER', 'STUDENT'],
      isPinned: true,
      createdById: principalUser.id,
    },
    {
      schoolId: school.id,
      title: 'Annual Day rehearsals begin Monday',
      body: 'Rehearsals run from 2:00 pm to 4:00 pm. Participating students should carry a water bottle and comfortable shoes.',
      type: 'EVENT',
      audience: ['PARENT', 'STUDENT'],
      createdById: adminUser.id,
    },
    {
      schoolId: school.id,
      title: 'Independence Day holiday',
      body: 'The school will remain closed on 15 August. Regular classes resume the following working day.',
      type: 'HOLIDAY',
      audience: ['PARENT', 'TEACHER', 'STUDENT', 'STAFF'],
      createdById: adminUser.id,
    },
  ]);

  await db.insert(t.events).values([
    { schoolId: school.id, title: 'Parent Teacher Meeting', description: 'Term 1 PTM for all classes.', category: 'PTM', startAt: addDays(today, 9), endAt: addDays(today, 9), location: 'School auditorium', audience: ['PARENT', 'TEACHER'] },
    { schoolId: school.id, title: 'Annual Sports Day', description: 'Track and field events for all houses.', category: 'SPORTS', startAt: addDays(today, 24), location: 'Main ground', audience: ['PARENT', 'TEACHER', 'STUDENT'] },
    { schoolId: school.id, title: 'Science Exhibition', description: 'Class 5 and Class 10 project showcase.', category: 'ACADEMIC', startAt: addDays(today, 40), location: 'Science block', audience: ['PARENT', 'STUDENT'] },
  ]);

  /* ------------------------------ fees (phase 5) --------------------------- */
  const feeCats = await db
    .insert(t.feeCategories)
    .values(FEE_CATEGORIES.map((c) => ({ ...c, schoolId: school.id })))
    .returning();
  const [structure] = await db
    .insert(t.feeStructures)
    .values({ schoolId: school.id, academicYearId: year.id, name: 'Annual fee 2026-27', frequency: 'QUARTERLY' })
    .returning();
  await db.insert(t.feeStructureItems).values([
    { feeStructureId: structure.id, categoryId: feeCats[0].id, amount: 4500000, dueDate: iso(addDays(today, 10)) },
    { feeStructureId: structure.id, categoryId: feeCats[3].id, amount: 250000, dueDate: iso(addDays(today, 10)) },
    { feeStructureId: structure.id, categoryId: feeCats[4].id, amount: 300000, dueDate: iso(addDays(today, 10)) },
  ]);

  const feeValues = studentRecords.map((s, i) => ({
    schoolId: school.id,
    studentId: s.id,
    academicYearId: year.id,
    feeStructureId: structure.id,
    title: 'Term 1 fee 2026-27',
    amount: 5050000,
    paidAmount: i % 3 === 0 ? 0 : 5050000,
    dueDate: iso(addDays(today, i % 3 === 0 ? -5 : 10)),
    status: (i % 3 === 0 ? 'OVERDUE' : 'PAID') as 'OVERDUE' | 'PAID',
  }));
  const feeRows = await db.insert(t.studentFees).values(feeValues).returning();
  await db.insert(t.payments).values(
    feeRows
      .filter((f) => f.status === 'PAID')
      .map((f, i) => ({
        schoolId: school.id,
        studentFeeId: f.id,
        receiptNumber: `RCP-2627-${String(1000 + i)}`,
        amount: f.amount,
        method: i % 2 ? 'ONLINE' : 'BANK_TRANSFER',
        provider: 'mock',
        paidAt: addDays(today, -3),
      })),
  );

  /* --------------------------- transport (phase 6) ------------------------- */
  const busRows = await db
    .insert(t.buses)
    .values([
      { schoolId: school.id, busNumber: 'Bus 12', registrationNumber: 'DL1PC4412', capacity: 40, model: 'Tata Starbus', insuranceExpiry: iso(addDays(today, 120)), fitnessExpiry: iso(addDays(today, 200)) },
      { schoolId: school.id, busNumber: 'Bus 07', registrationNumber: 'DL1PC4407', capacity: 36, model: 'Ashok Leyland', insuranceExpiry: iso(addDays(today, 45)), fitnessExpiry: iso(addDays(today, 90)) },
      { schoolId: school.id, busNumber: 'Bus 03', registrationNumber: 'DL1PC4403', capacity: 30, model: 'Force Traveller', insuranceExpiry: iso(addDays(today, 15)), fitnessExpiry: iso(addDays(today, 260)) },
    ])
    .returning();

  const driverSpecs = [
    { name: 'Balbir Singh', phone: '9860000001', license: 'DL-0420110012345' },
    { name: 'Mohan Yadav', phone: '9860000002', license: 'DL-0420110012346' },
    { name: 'Iqbal Hussain', phone: '9860000003', license: 'DL-0420110012347' },
  ];
  const driverRows: (typeof t.drivers.$inferSelect)[] = [];
  for (const spec of driverSpecs) {
    const [u] = await db
      .insert(t.users)
      .values({ schoolId: school.id, name: spec.name, phone: spec.phone, passwordHash })
      .returning();
    await db.insert(t.userRoles).values({ userId: u.id, role: 'DRIVER' });
    const [driver] = await db
      .insert(t.drivers)
      .values({ schoolId: school.id, userId: u.id, licenseNumber: spec.license, phone: spec.phone, licenseExpiry: iso(addDays(today, 400)) })
      .returning();
    driverRows.push(driver);
  }

  const routeSpecs = [
    { name: 'Route A — Green Park', stops: ['Green Park Metro', 'Hauz Khas Market', 'Safdarjung Enclave', 'School gate'] },
    { name: 'Route B — Dwarka', stops: ['Dwarka Sector 12', 'Dwarka Sector 6', 'Janakpuri West', 'School gate'] },
    { name: 'Route C — Rohini', stops: ['Rohini Sector 3', 'Pitampura', 'Netaji Subhash Place', 'School gate'] },
  ];
  const stopRows: (typeof t.routeStops.$inferSelect)[] = [];
  for (const [i, spec] of routeSpecs.entries()) {
    const [route] = await db
      .insert(t.routes)
      .values({ schoolId: school.id, name: spec.name, busId: busRows[i].id, driverId: driverRows[i].id })
      .returning();
    for (const [j, stopName] of spec.stops.entries()) {
      const [stop] = await db
        .insert(t.routeStops)
        .values({
          schoolId: school.id,
          routeId: route.id,
          name: stopName,
          order: j + 1,
          latitude: 28.55 + i * 0.02 + j * 0.005,
          longitude: 77.2 + i * 0.02 + j * 0.005,
          pickupTime: `07:${String(10 + j * 8).padStart(2, '0')}`,
          dropTime: `14:${String(10 + j * 8).padStart(2, '0')}`,
        })
        .returning();
      stopRows.push(stop);
    }
    await db.insert(t.studentTransport).values(
      studentRecords.slice(i * 8, i * 8 + 8).map((s) => ({
        schoolId: school.id,
        studentId: s.id,
        routeId: route.id,
        stopId: stopRows.filter((st) => st.routeId === route.id)[1].id,
        validFrom: iso(addDays(today, -30)),
      })),
    );
  }
  log(`buses: ${busRows.length}, routes: ${routeSpecs.length}`);

  /* --------------------- second school (isolation fixture) ----------------- */
  const [school2] = await db
    .insert(t.schools)
    .values({
      code: 'SCHOOL-0002',
      slug: 'sunrise-international',
      name: 'Sunrise International School',
      addressLine: '44 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      phone: '02240001000',
      email: 'office@sunrise.edu',
      principalName: 'Mr. Farhan Qureshi',
      schoolType: 'Senior Secondary',
      board: 'ICSE',
      medium: 'English',
      status: 'ACTIVE',
      setupCompleted: true,
      setupStep: 13,
    })
    .returning();
  await db.insert(t.schoolSettings).values({ schoolId: school2.id });
  await db.insert(t.subscriptions).values({ schoolId: school2.id, planId: plan('STARTER').id, status: 'TRIAL', trialEndsAt: addDays(today, 14) });

  const [year2] = await db
    .insert(t.academicYears)
    .values({ schoolId: school2.id, name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true })
    .returning();
  const [class2] = await db.insert(t.classLevels).values({ schoolId: school2.id, name: 'Class 5', level: 5 }).returning();
  const subj2 = await db
    .insert(t.subjects)
    .values(SUBJECT_SET.slice(0, 3).map((s) => ({ schoolId: school2.id, name: s.name, code: s.code })))
    .returning();

  const [admin2] = await db
    .insert(t.users)
    .values({ schoolId: school2.id, name: 'Farhan Qureshi', email: 'admin@sunrise.edu', phone: '9870000001', passwordHash })
    .returning();
  await db.insert(t.userRoles).values({ userId: admin2.id, role: 'SCHOOL_ADMIN' });

  const [teacherUser2] = await db
    .insert(t.users)
    .values({ schoolId: school2.id, name: 'Priya Shah', email: 'priya.shah@sunrise.edu', phone: '9870000002', passwordHash })
    .returning();
  await db.insert(t.userRoles).values({ userId: teacherUser2.id, role: 'TEACHER' });
  const [teacher2] = await db
    .insert(t.teachers)
    .values({ schoolId: school2.id, userId: teacherUser2.id, employeeId: 'SIS-001', designation: 'Teacher' })
    .returning();

  const [section2] = await db
    .insert(t.sections)
    .values({ schoolId: school2.id, classId: class2.id, academicYearId: year2.id, name: 'A', classTeacherId: teacher2.id })
    .returning();
  await db.insert(t.teacherAssignments).values({ schoolId: school2.id, teacherId: teacher2.id, sectionId: section2.id, isClassTeacher: true });

  for (const [i, name] of [['Rehan', 'Qureshi'], ['Tara', 'Shetty'], ['Om', 'Kulkarni']].entries()) {
    const [s2] = await db
      .insert(t.students)
      .values({ schoolId: school2.id, admissionNumber: `SIS-${2001 + i}`, firstName: name[0], lastName: name[1], status: 'ACTIVE' })
      .returning();
    await db.insert(t.enrollments).values({ schoolId: school2.id, studentId: s2.id, sectionId: section2.id, academicYearId: year2.id, rollNumber: i + 1 });

    const [pu] = await db
      .insert(t.users)
      .values({ schoolId: school2.id, name: `${name[1]} Parent`, phone: `978100000${i + 1}` })
      .returning();
    await db.insert(t.userRoles).values({ userId: pu.id, role: 'PARENT' });
    const [p2] = await db.insert(t.parents).values({ schoolId: school2.id, userId: pu.id, phone: `978100000${i + 1}` }).returning();
    await db.insert(t.studentParents).values({ schoolId: school2.id, studentId: s2.id, parentId: p2.id, relation: 'FATHER', isPrimary: true });
  }
  await db.insert(t.announcements).values({
    schoolId: school2.id,
    title: 'Sunrise orientation week',
    body: 'Orientation sessions for new families run all week in the main hall.',
    type: 'GENERAL',
    audience: ['PARENT'],
    createdById: admin2.id,
  });
  log(`second school seeded (${subj2.length} subjects) for isolation checks`);

  /* ------------------------- suspended school fixture ---------------------- */
  const [school3] = await db
    .insert(t.schools)
    .values({
      code: 'SCHOOL-0003',
      slug: 'st-marys-convent',
      name: "St. Mary's Convent",
      city: 'Pune',
      state: 'Maharashtra',
      email: 'office@stmarys.edu',
      status: 'SUSPENDED',
    })
    .returning();
  await db.insert(t.schoolSettings).values({ schoolId: school3.id });
  await db.insert(t.subscriptions).values({ schoolId: school3.id, planId: plan('STARTER').id, status: 'PAST_DUE' });
  const [admin3] = await db
    .insert(t.users)
    .values({ schoolId: school3.id, name: 'Sister Agnes', email: 'admin@stmarys.edu', phone: '9880000001', passwordHash })
    .returning();
  await db.insert(t.userRoles).values({ userId: admin3.id, role: 'SCHOOL_ADMIN' });

  await db.insert(t.supportTickets).values([
    { schoolId: school.id, subject: 'Bulk import failing for Class 10', category: 'TECHNICAL', body: 'The CSV import reports a duplicate admission number for two rows.', status: 'OPEN', createdById: adminUser.id },
    { schoolId: school2.id, subject: 'Upgrade to Professional plan', category: 'BILLING', body: 'We would like to enable transport and fees before term starts.', status: 'IN_PROGRESS', createdById: admin2.id },
  ]);

  return {
    schoolId: school.id,
    school2Id: school2.id,
    school3Id: school3.id,
    adminUserId: adminUser.id,
    principalUserId: principalUser.id,
    platformAdminId: platformAdmin.id,
    classTeacherId: teacherRecords.find((tr) => tr.name === 'Meera Iyer')!.id,
    classTeacherUserId: teacherRecords.find((tr) => tr.name === 'Meera Iyer')!.userId,
    otherTeacherUserId: teacherRecords.find((tr) => tr.name === 'Vikram Singh')!.userId,
    section5A: sectionByKey.get('5-A')!.id,
    section10A: sectionByKey.get('10-A')!.id,
    school2SectionId: section2.id,
    school2AdminUserId: admin2.id,
    school3AdminUserId: admin3.id,
    studentUserId: aaravUser.id,
    studentId: aarav.id,
    parentUserId: parentByFamily.get('F1')![0].userId,
    parentId: parentByFamily.get('F1')![0].id,
    otherParentUserId: parentByFamily.get('F5')![0].userId,
    students: studentRecords,
    yearId: year.id,
    publishedExamId: examRows[0].id,
  };
}

/* --------------------------------- CLI ----------------------------------- */
if (process.argv[1]?.endsWith('seed.ts')) {
  (async () => {
    await import('dotenv/config');
    const { getDb } = await import('@/db');
    console.log('Seeding SchoolSphere demo data…');
    await seed(getDb());
    console.log(`\nDone. Every demo account signs in with the password: ${DEMO_PASSWORD}`);
    console.log('Parents sign in at /parent-login — try Delhi Public Academy with 9810000001.');
    process.exit(0);
  })().catch((err) => {
    console.error('\nSeed failed:', err instanceof Error ? err.message : err);
    console.error('Is Postgres running? Try: npm run db:up');
    process.exit(1);
  });
}
