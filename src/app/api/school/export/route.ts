import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import * as t from '@/db/schema';
import { requireSchoolContext } from '@/lib/auth/session';
import { visibleStudentIds } from '@/lib/scope';
import { toCsv } from '@/lib/csv';
import { apiError, parseQuery } from '@/lib/api';
import { balanceOf } from '@/lib/services/fees';
import { badRequest } from '@/lib/errors';
import { recordAudit } from '@/lib/audit';

const schema = z.object({
  dataset: z.enum(['students', 'attendance', 'fees', 'results', 'transport']),
});

/**
 * CSV export.
 *
 * Every dataset goes through the same role scoping as its screen, so an export
 * can never become a way around a permission — a teacher exporting students
 * gets their own classes, not the school. Excel opens CSV natively, which is
 * why there is no xlsx dependency here.
 */
export async function GET(req: Request) {
  try {
    const session = await requireSchoolContext('reports.view');
    const { dataset } = parseQuery(req, schema);
    const allowed = await visibleStudentIds(session);
    const scope = allowed ? (allowed.length ? allowed : ['—']) : undefined;

    let rows: Record<string, unknown>[] = [];

    if (dataset === 'students') {
      const data = await db
        .select({
          admissionNumber: t.students.admissionNumber,
          firstName: t.students.firstName,
          lastName: t.students.lastName,
          gender: t.students.gender,
          dateOfBirth: t.students.dateOfBirth,
          className: t.classLevels.name,
          section: t.sections.name,
          rollNumber: t.enrollments.rollNumber,
          status: t.students.status,
        })
        .from(t.students)
        .leftJoin(t.enrollments, and(eq(t.enrollments.studentId, t.students.id), eq(t.enrollments.isCurrent, true)))
        .leftJoin(t.sections, eq(t.sections.id, t.enrollments.sectionId))
        .leftJoin(t.classLevels, eq(t.classLevels.id, t.sections.classId))
        .where(and(eq(t.students.schoolId, session.schoolId), isNull(t.students.deletedAt), scope ? inArray(t.students.id, scope) : undefined))
        .orderBy(asc(t.classLevels.level), asc(t.sections.name), asc(t.enrollments.rollNumber));
      rows = data;
    }

    if (dataset === 'attendance') {
      const data = await db
        .select({
          date: t.studentAttendance.date,
          admissionNumber: t.students.admissionNumber,
          student: t.students.firstName,
          lastName: t.students.lastName,
          className: t.classLevels.name,
          section: t.sections.name,
          status: t.studentAttendance.status,
        })
        .from(t.studentAttendance)
        .innerJoin(t.students, eq(t.students.id, t.studentAttendance.studentId))
        .innerJoin(t.sections, eq(t.sections.id, t.studentAttendance.sectionId))
        .innerJoin(t.classLevels, eq(t.classLevels.id, t.sections.classId))
        .where(and(eq(t.studentAttendance.schoolId, session.schoolId), scope ? inArray(t.studentAttendance.studentId, scope) : undefined))
        .orderBy(desc(t.studentAttendance.date))
        .limit(20_000);
      rows = data;
    }

    if (dataset === 'fees') {
      if (!session.permissions.includes('fees.view')) throw badRequest('You cannot export fee data.');
      const data = await db.query.studentFees.findMany({
        where: and(eq(t.studentFees.schoolId, session.schoolId), scope ? inArray(t.studentFees.studentId, scope) : undefined),
        with: { student: { columns: { admissionNumber: true, firstName: true, lastName: true } } },
        limit: 20_000,
      });
      rows = data.map((f) => ({
        admissionNumber: f.student.admissionNumber,
        student: `${f.student.firstName} ${f.student.lastName}`,
        title: f.title,
        amount: (f.amount / 100).toFixed(2),
        discount: (f.discount / 100).toFixed(2),
        paid: (f.paidAmount / 100).toFixed(2),
        balance: (balanceOf(f) / 100).toFixed(2),
        dueDate: f.dueDate,
        status: f.status,
      }));
    }

    if (dataset === 'results') {
      const data = await db.query.results.findMany({
        where: and(eq(t.results.schoolId, session.schoolId), scope ? inArray(t.results.studentId, scope) : undefined),
        with: {
          student: { columns: { admissionNumber: true, firstName: true, lastName: true } },
          exam: { columns: { name: true } },
          section: { with: { class: true } },
        },
        limit: 20_000,
      });
      rows = data.map((r) => ({
        exam: r.exam.name,
        admissionNumber: r.student.admissionNumber,
        student: `${r.student.firstName} ${r.student.lastName}`,
        className: `${r.section.class.name}-${r.section.name}`,
        total: r.totalMarks,
        max: r.maxMarks,
        percentage: r.percentage,
        grade: r.grade,
        rank: r.rank,
        published: r.isPublished ? 'yes' : 'no',
      }));
    }

    if (dataset === 'transport') {
      if (!session.permissions.includes('transport.view')) throw badRequest('You cannot export transport data.');
      const data = await db.query.studentTransport.findMany({
        where: and(eq(t.studentTransport.schoolId, session.schoolId), scope ? inArray(t.studentTransport.studentId, scope) : undefined),
        with: {
          student: { columns: { admissionNumber: true, firstName: true, lastName: true } },
          route: { with: { bus: true } },
          stop: true,
        },
        limit: 20_000,
      });
      rows = data.map((a) => ({
        admissionNumber: a.student.admissionNumber,
        student: `${a.student.firstName} ${a.student.lastName}`,
        route: a.route.name,
        bus: a.route.bus?.busNumber ?? '',
        stop: a.stop.name,
        pickupTime: a.stop.pickupTime ?? '',
        type: a.type,
      }));
    }

    await recordAudit({ session, action: 'data.exported', entity: dataset, after: { rows: rows.length } });

    const csv = toCsv(rows);
    const filename = `${dataset}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
