/**
 * 影像二进制缓存（IndexedDB）：二次访问与离线可用。
 * 所有操作都是"尽力而为"，任何异常都退化为"未命中"，绝不影响出图。
 */
import { config } from '../../config';

const DB_NAME = 'globlemap';
const DB_VERSION = 1;
const STORE = 'img';
const TTL = 7 * 24 * 3600 * 1000;

interface Row {
  url: string;
  blob: Blob;
  t: number;
  size: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: 'url' });
          os.createIndex('t', 't');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | null): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(STORE, mode);
          const req = fn(t.objectStore(STORE));
          if (!req) return resolve(null);
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function getCachedImage(url: string): Promise<Blob | null> {
  const row = await tx<Row>('readonly', (s) => s.get(url));
  if (!row || !row.blob) return null;
  if (Date.now() - row.t > TTL) return null;
  return row.blob;
}

export async function putCachedImage(url: string, blob: Blob): Promise<void> {
  await tx('readwrite', (s) => s.put({ url, blob, t: Date.now(), size: blob.size } satisfies Row));
  void prune();
}

async function prune(): Promise<void> {
  const all = await tx<Row[]>('readonly', (s) => s.getAll());
  if (!all || !Array.isArray(all)) return;
  let total = all.reduce((sum, r) => sum + (r?.size ?? 0), 0);
  if (total <= config.imageCacheBytes) return;
  const sorted = [...all].sort((a, b) => a.t - b.t);
  for (const row of sorted) {
    if (total <= config.imageCacheBytes * 0.8) break;
    await tx('readwrite', (s) => s.delete(row.url));
    total -= row.size ?? 0;
  }
}

export async function clearImageCache(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
}

export async function imageCacheStats(): Promise<{ count: number; bytes: number }> {
  const all = await tx<Row[]>('readonly', (s) => s.getAll());
  if (!all || !Array.isArray(all)) return { count: 0, bytes: 0 };
  return { count: all.filter(Boolean).length, bytes: all.reduce((n, r) => n + (r?.size ?? 0), 0) };
}
