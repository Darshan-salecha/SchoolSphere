import { requireSchoolPage } from '@/lib/page-guards';
import { parentContext, currentSection } from '@/lib/parent-context';
import { listPeriods, sectionTimetable, DAYS } from '@/lib/services/timetable';
import { PageHeader } from '@/components/ui/page';
import { EmptyState } from '@/components/ui/states';
import { ChildSwitcher } from '@/components/child-switcher';

export const dynamic = 'force-dynamic';

export default async function ParentTimetablePage() {
  const session = await requireSchoolPage('portal.parent');
  const { children, selected } = await parentContext(session);
  if (!selected) return <EmptyState title="No children linked" description="Please contact the school office." />;

  const section = currentSection(selected);
  const [periods, slots] = await Promise.all([
    listPeriods(session.schoolId),
    section ? sectionTimetable(session.schoolId, section.sectionId) : Promise.resolve([]),
  ]);
  const byKey = new Map(slots.map((s) => [`${s.dayOfWeek}:${s.periodId}`, s]));

  return (
    <>
      <PageHeader
        title="Timetable"
        description={section ? `${section.section.class.name} — ${section.section.name} weekly schedule.` : undefined}
      />
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

      {periods.length === 0 || slots.length === 0 ? (
        <div className="card">
          <EmptyState title="No timetable published" description="The school has not published a timetable for this class yet." />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-32 px-4 py-3 font-medium">Period</th>
                {DAYS.map((d) => (
                  <th key={d.value} className="px-3 py-3 font-medium">
                    {d.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {periods.map((p) => (
                <tr key={p.id} className={p.isBreak ? 'bg-slate-50/60' : undefined}>
                  <td className="px-4 py-2">
                    <p className="font-medium text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.startTime}–{p.endTime}
                    </p>
                  </td>
                  {DAYS.map((d) => {
                    const slot = byKey.get(`${d.value}:${p.id}`);
                    return (
                      <td key={d.value} className="px-3 py-2">
                        {p.isBreak ? (
                          <span className="text-xs italic text-slate-400">{p.name}</span>
                        ) : slot?.subject ? (
                          <>
                            <span className="block text-xs font-semibold text-slate-900">{slot.subject.name}</span>
                            <span className="block text-[11px] text-slate-500">{slot.teacher?.user.name ?? ''}</span>
                          </>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
