/**
 * URL 即状态：可分享、可前进后退、刷新不丢。
 * 任何畸形输入一律静默回退默认值——绝不允许因 URL 解析失败而白屏。
 */
import type { PlatformFilter } from '../domain/types';

export interface HashState {
  z: number;
  lat: number;
  lng: number;
  from: string;
  to: string;
  cloud: number;
  platform: PlatformFilter;
  scene: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clampInt(v: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

function validDate(s: string | null | undefined): string | null {
  if (!s || !DATE_RE.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const y = Number(s.slice(0, 4));
  if (y < 2015 || y > 2100) return null;
  return s;
}

/** 解析 hash，返回"能解析出来的部分" */
export function parseHash(hash: string): Partial<HashState> {
  const out: Partial<HashState> = {};
  if (!hash) return out;
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart, queryPart] = raw.split('?');
  const seg = (pathPart ?? '').split('/').filter(Boolean);

  if (seg.length >= 3) {
    const z = Number(seg[0]);
    const lat = Number(seg[1]);
    const lng = Number(seg[2]);
    if (Number.isFinite(z)) out.z = clampInt(z, 3, 18, 11);
    if (Number.isFinite(lat)) out.lat = Math.min(85, Math.max(-85, lat));
    if (Number.isFinite(lng)) out.lng = Math.min(180, Math.max(-180, lng));
  }

  if (!queryPart) return out;
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(queryPart);
  } catch {
    return out;
  }

  const d = params.get('d');
  if (d && d.includes('..')) {
    const [a, b] = d.split('..');
    const from = validDate(a);
    const to = validDate(b);
    if (from && to && from <= to) {
      out.from = from;
      out.to = to;
    } else if (from && to) {
      out.from = to;
      out.to = from;
    }
  }

  if (params.has('c')) {
    const c = Number(params.get('c'));
    if (Number.isFinite(c)) out.cloud = clampInt(c, 0, 100, 20);
  }

  const p = params.get('p');
  if (p === 'all' || p === '2a') out.platform = p;

  const s = params.get('s');
  if (s && /^[A-Za-z0-9_.:-]{3,80}$/.test(s)) out.scene = s;

  return out;
}

export function buildHash(input: {
  view: { z: number; lat: number; lng: number };
  from: string;
  to: string;
  cloud: number;
  platform: PlatformFilter;
  scene: string | null;
}): string {
  const { view } = input;
  const params = new URLSearchParams();
  params.set('d', `${input.from}..${input.to}`);
  params.set('c', String(Math.round(input.cloud)));
  params.set('p', input.platform);
  if (input.scene) params.set('s', input.scene);
  return `#${view.z}/${view.lat.toFixed(4)}/${view.lng.toFixed(4)}?${params.toString()}`;
}
