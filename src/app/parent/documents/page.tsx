import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { listDocuments } from '@/lib/services/documents';
import { listCertificates } from '@/lib/services/certificates';
import { PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';
import { formatDate } from '@/lib/utils';
import { FileText, Download, Award } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function ParentDocumentsPage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);
  if (!selected) return <EmptyState title="No children linked" description="Please contact the school office." />;

  const [documents, certificates] = await Promise.all([
    listDocuments(session.schoolId, selected.id),
    listCertificates(session.schoolId, selected.id),
  ]);

  return (
    <>
      <PageHeader title="Documents" description={`Files and certificates on record for ${selected.firstName}.`} />
      <ChildSwitcher
        selectedId={selected.id}
        children={children.map((c) => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          photoUrl: c.photoUrl,
          label: currentSection(c) ? `${currentSection(c)!.section.class.name}-${currentSection(c)!.section.name}` : 'Not enrolled',
        }))}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Documents" />
          <CardBody className="space-y-2">
            {documents.length === 0 && <p className="text-sm text-slate-500">No documents on file.</p>}
            {documents.map((d) => (
              <a
                key={d.id}
                href={`/api/files/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-50"
              >
                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{d.title}</span>
                  <span className="block text-xs text-slate-500">
                    {d.category.replaceAll('_', ' ').toLowerCase()} · {formatDate(d.createdAt)}
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-slate-400" />
              </a>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Certificates" />
          <CardBody className="space-y-2">
            {certificates.length === 0 && (
              <EmptyState icon={Award} title="No certificates yet" description="Certificates issued by the school appear here." />
            )}
            {certificates.map((c) => (
              <div key={c.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium capitalize text-slate-900">{c.type.toLowerCase()}</span>
                  <Badge tone="slate">{c.serialNumber}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">{c.body}</p>
                <p className="mt-1 text-xs text-slate-400">Issued {formatDate(c.issuedAt)}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
