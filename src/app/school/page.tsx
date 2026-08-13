import { requireSchoolPage } from '@/lib/page-guards';
import { hasSchoolWideAccess } from '@/lib/scope';
import { AdminDashboard } from './dashboards/admin-dashboard';
import { TeacherDashboard } from './dashboards/teacher-dashboard';

export const dynamic = 'force-dynamic';

/** One route, three experiences — driven by what the signed-in user may see. */
export default async function SchoolHome() {
  const session = await requireSchoolPage();
  return hasSchoolWideAccess(session) ? <AdminDashboard session={session} /> : <TeacherDashboard session={session} />;
}
