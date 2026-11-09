/**
 * 检索结果快照缓存（localStorage）：平移回来秒出、刷新后直达上次结果。
 * 约束：只存精简后的 Scene[]，不存 STAC 原始 Item（体积会翻数倍）。
 */
import { config } from '../../config';
import type { Scene, SearchQuery } from '../../domain/types';
import { bboxKey } from '../../domain/bbox';

const NS = 'gm:v1:q';
const MAX_ENTRIES = config.queryCacheMax;
const TTL = config.queryCacheTtlMs;

interface Entry {
  t: number;
  scenes: Scene[];
  matched: number;
}

type Bucket = Record<string, Entry>;

export function queryKey(q: SearchQuery): string {
  return `${bboxKey(q.bbox)}|${q.from}|${q.to}|${Math.round(q.cloud)}|${q.platform}`;
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readBucket(): Bucket {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(NS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Bucket;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeBucket(b: Bucket): void {
  const s = storage();
  if (!s) return;
  const keys = Object.keys(b).sort((a, x) => (b[x]?.t ?? 0) - (b[a]?.t ?? 0));
  while (keys.length > MAX_ENTRIES) {
    const drop = keys.shift();
    if (drop) delete b[drop];
  }
  try {
    s.setItem(NS, JSON.stringify(b));
  } catch {
    // 配额满：清空这一层缓存，不影响主流程
    try {
      s.removeItem(NS);
    } catch {
      /* ignore */
    }
  }
}

export function readQuery(q: SearchQuery): { scenes: Scene[]; matched: number } | null {
  const key = queryKey(q);
  const bucket = readBucket();
  const hit = bucket[key];
  if (!hit) return null;
  if (Date.now() - hit.t > TTL) {
    delete bucket[key];
    writeBucket(bucket);
    return null;
  }
  if (!Array.isArray(hit.scenes)) return null;
  return { scenes: hit.scenes, matched: hit.matched ?? hit.scenes.length };
}

export function writeQuery(q: SearchQuery, scenes: Scene[], matched: number): void {
  const bucket = readBucket();
  bucket[queryKey(q)] = { t: Date.now(), scenes, matched };
  writeBucket(bucket);
}

export function clearQueryCache(): void {
  const s = storage();
  try {
    s?.removeItem(NS);
  } catch {
    /* ignore */
  }
}
