import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Client/server boundary guard.
 *
 * `next build` catches this class of bug by failing to bundle; these tests catch
 * it in the suite so it is found in seconds rather than at deploy time. The bug
 * being guarded against is real and already happened once here: a client
 * component imported a module that transitively pulled in `pg`, and the build
 * died on "Can't resolve 'net'".
 */

const SRC = path.resolve('src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
}

const files = walk(SRC);
/** Next route files only live under src/app; a component merely *named* page.tsx is not one. */
const APP = path.join(SRC, 'app');
const appFiles = files.filter((f) => f.startsWith(APP));
const read = (f: string) => readFileSync(f, 'utf8');
const isClient = (f: string) => /^\s*['"]use client['"]/.test(read(f));

/** Resolves a `@/…` import to a real file on disk. */
function resolveImport(spec: string): string | null {
  if (!spec.startsWith('@/')) return null;
  const base = path.join(SRC, spec.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // keep looking
    }
  }
  return null;
}

const importsOf = (file: string) =>
  [...read(file).matchAll(/from\s+['"](@\/[^'"]+)['"]/g)].map((m) => m[1]);

/** Every module a client component pulls in, transitively. */
function closure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const current = queue.pop()!;
    for (const spec of importsOf(current)) {
      const resolved = resolveImport(spec);
      if (resolved && !seen.has(resolved)) {
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }
  return seen;
}

const SERVER_ONLY = ['@/db', '@/db/schema', '@/lib/db'];
const SERVER_ONLY_PACKAGES = [/from\s+['"]pg['"]/, /from\s+['"]bcryptjs['"]/, /from\s+['"]node:/];

describe('client components stay client-safe', () => {
  const clientFiles = files.filter(isClient);

  it('finds the client components', () => {
    expect(clientFiles.length).toBeGreaterThan(15);
  });

  it('never reach the database layer, directly or transitively', () => {
    const offenders: string[] = [];
    for (const file of clientFiles) {
      const reachable = [file, ...closure(file)];
      for (const dep of reachable) {
        const specs = importsOf(dep);
        if (specs.some((s) => SERVER_ONLY.includes(s))) {
          offenders.push(`${path.relative(SRC, file)} → ${path.relative(SRC, dep)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never pull in a node-only package', () => {
    const offenders: string[] = [];
    for (const file of clientFiles) {
      for (const dep of [file, ...closure(file)]) {
        const source = read(dep);
        if (SERVER_ONLY_PACKAGES.some((re) => re.test(source))) {
          offenders.push(`${path.relative(SRC, file)} → ${path.relative(SRC, dep)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('route handlers and pages are wired correctly', () => {
  const routes = appFiles.filter((f) => f.endsWith('route.ts'));
  const pages = appFiles.filter((f) => f.endsWith('page.tsx'));

  it('every API route exports at least one HTTP method', () => {
    const bad = routes.filter((f) => !/export\s+(const|async\s+function|function)\s+(GET|POST|PATCH|PUT|DELETE)/.test(read(f)));
    expect(bad.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('every page exports a default component', () => {
    const bad = pages.filter((f) => !/export\s+default/.test(read(f)));
    expect(bad.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('every page that reads data opts out of static rendering', () => {
    // A page hitting the tenant database must never be prerendered at build time.
    const bad = pages.filter((f) => {
      const source = read(f);
      const touchesDb = /from '@\/db'|requireSchoolPage|requirePagePermission|requirePageSession/.test(source);
      return touchesDb && !/dynamic\s*=\s*'force-dynamic'/.test(source);
    });
    expect(bad.map((f) => path.relative(SRC, f))).toEqual([]);
  });
});

describe('every mutating endpoint is guarded', () => {
  it('no write handler skips authorisation', () => {
    const routes = appFiles.filter((f) => f.endsWith('route.ts'));
    const unguarded: string[] = [];

    for (const file of routes) {
      const source = read(file);
      const mutates = /export\s+const\s+(POST|PATCH|PUT|DELETE)/.test(source);
      if (!mutates) continue;

      // Public endpoints are explicitly allowed and individually reviewed.
      const rel = path.relative(SRC, file);
      const publicByDesign = ['app/api/auth', 'app/api/public'].some((p) => rel.startsWith(p));
      if (publicByDesign) continue;

      if (!/require(SchoolContext|Permission|Session)\(/.test(source)) unguarded.push(rel);
    }
    expect(unguarded).toEqual([]);
  });

  it('records an audit entry on sensitive writes', () => {
    // Money, marks and identity changes must be traceable.
    const sensitive = ['fees/collect', 'fees/generate', 'marks', 'results', 'students', 'teachers', 'users'];
    const missing = appFiles
      .filter((f) => f.endsWith('route.ts') && sensitive.some((s) => f.includes(s)))
      .filter((f) => /export\s+const\s+(POST|PATCH|DELETE)/.test(read(f)))
      .filter((f) => !/recordAudit\(/.test(read(f)))
      .map((f) => path.relative(SRC, f));
    expect(missing).toEqual([]);
  });
});
