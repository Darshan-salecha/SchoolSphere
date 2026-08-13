import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

export type StorageProvider = {
  put(key: string, data: Buffer, contentType?: string): Promise<{ key: string }>;
  get(key: string): Promise<Buffer>;
  url(key: string): string;
};

const root = () => path.resolve(process.env.STORAGE_LOCAL_DIR ?? './.storage');

const localProvider: StorageProvider = {
  async put(key, data) {
    const dest = path.join(root(), key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, data);
    return { key };
  },
  get: (key) => readFile(path.join(root(), key)),
  // Files are served through an authorised route, never a public bucket URL.
  url: (key) => `/api/files/${encodeURIComponent(key)}`,
};

const providers: Record<string, StorageProvider> = { local: localProvider };
export const storage = () => providers[process.env.STORAGE_PROVIDER ?? 'local'] ?? localProvider;
