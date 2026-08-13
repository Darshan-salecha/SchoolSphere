import { cookies } from 'next/headers';
import { childrenOf } from '@/lib/scope';
import type { SessionUser } from '@/lib/auth/session';

export const CHILD_COOKIE = 'ss_child';

export type Child = Awaited<ReturnType<typeof childrenOf>>[number];

/**
 * Resolves which child the parent is currently viewing. The selection is stored
 * in a cookie but always re-validated against the guardian links, so it can
 * never be pointed at someone else's child.
 */
export async function parentContext(session: SessionUser & { schoolId: string }) {
  const children = await childrenOf(session.parentId!, session.schoolId);
  const requested = (await cookies()).get(CHILD_COOKIE)?.value;
  const selected = children.find((c) => c.id === requested) ?? children[0];
  return { children, selected };
}

export function currentSection(child: Child | undefined) {
  return child?.enrollments?.find((e) => e.isCurrent) ?? child?.enrollments?.[0];
}
