import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireSchoolPage } from '@/lib/page-guards';
import { listSections } from '@/lib/school-data';
import { PageHeader } from '@/components/ui/page';
import { ImportWizard } from './import-wizard';

export const dynamic = 'force-dynamic';

export default async function ImportStudentsPage() {
  const session = await requireSchoolPage('students.create');
  const sections = await listSections(session.schoolId);

  return (
    <>
      <Link href="/school/students" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> All students
      </Link>
      <PageHeader
        title="Bulk import students"
        description="Upload a CSV, review the preview, then confirm. Nothing is saved until you confirm."
      />
      <ImportWizard sections={sections.map((s) => s.label)} />
    </>
  );
}
