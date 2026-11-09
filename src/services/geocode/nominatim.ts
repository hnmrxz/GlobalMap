/** 地名搜索：Nominatim（零 Key）。遵守其使用政策：≥2 字符、前端防抖、结果缓存、1 req/s。 */
import { config } from '../../config';
import type { Bbox } from '../../domain/types';
import { getJson, type RequestOptions } from '../http';

interface NominatimRow {
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: [string, string, string, string] | string[];
}

export interface Place {
  label: string;
  lat: number;
  lon: number;
  bbox: Bbox | null;
}

const cache = new Map<string, Place[]>();

export function buildSearchUrl(text: string, limit = 5): string {
  const base = config.geocoder.replace(/\/+$/, '');
  const qs = new URLSearchParams({
    format: 'jsonv2',
    limit: String(limit),
    'accept-language': 'zh-CN,zh,en',
    addressdetails: '0',
    q: text,
  });
  return `${base}/search?${qs.toString()}`;
}

export async function searchPlaces(text: string, opts: RequestOptions = {}): Promise<Place[]> {
  const q = text.trim();
  if (q.length < 2) return [];
  const cached = cache.get(q);
  if (cached) return cached;

  const rows = await getJson<NominatimRow[]>(buildSearchUrl(q), {
    timeoutMs: config.httpTimeout,
    signal: opts.signal,
  });

  const places: Place[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    let bbox: Bbox | null = null;
    const bb = row.boundingbox;
    if (Array.isArray(bb) && bb.length === 4) {
      const south = Number(bb[0]);
      const north = Number(bb[1]);
      const west = Number(bb[2]);
      const east = Number(bb[3]);
      if ([south, north, west, east].every((v) => Number.isFinite(v))) bbox = [west, south, east, north];
    }
    places.push({
      label: row.display_name ?? row.name ?? q,
      lat,
      lon,
      bbox,
    });
  }

  if (cache.size > 40) cache.clear();
  cache.set(q, places);
  return places;
}

/** 把 Nominatim 的长名称裁短，方便塞进下拉列表 */
export function shortLabel(label: string, max = 46): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}
