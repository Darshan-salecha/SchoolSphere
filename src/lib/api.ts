import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { AppError } from '@/lib/errors';

export function apiError(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.message, code: err.code, details: err.details }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Please check the highlighted fields.',
        code: 'VALIDATION_ERROR',
        details: err.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }
  if (typeof err === 'object' && err && 'code' in err && (err as { code: string }).code === 'P2002') {
    return NextResponse.json({ error: 'That record already exists.', code: 'CONFLICT' }, { status: 409 });
  }
  console.error('[api] unhandled error', err);
  return NextResponse.json({ error: 'Something went wrong. Please try again.', code: 'INTERNAL' }, { status: 500 });
}

/** Wraps a route handler so no technical error ever reaches the user. */
export function handler<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      return apiError(err);
    }
  };
}

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<output<S>> {
  const json = await req.json().catch(() => ({}));
  return schema.parse(json) as output<S>;
}

export function parseQuery<S extends ZodTypeAny>(req: Request, schema: S): output<S> {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries())) as output<S>;
}

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
export const created = <T>(data: T) => NextResponse.json(data, { status: 201 });

/**
 * Redirect to a path on this same site.
 *
 * Deliberately emits a *relative* Location header. `NextResponse.redirect`
 * requires an absolute URL, and behind a reverse proxy the only origin the
 * server knows is its own bind address — so it would send the browser to
 * http://0.0.0.0:3000/… instead of the public domain. A relative Location is
 * resolved by the browser against the address bar, which is correct in every
 * environment: localhost, the cloud domain, or any future host.
 */
export const seeOther = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

export type Paginated<T> = { data: T[]; page: number; pageSize: number; total: number; totalPages: number };

export function paginated<T>(data: T[], total: number, page: number, pageSize: number): Paginated<T> {
  return { data, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
