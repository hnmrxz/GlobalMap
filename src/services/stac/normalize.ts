/** STAC Item → Scene 的归一化。兼容 Earth Search 与 CDSE 的字段差异。 */
import type { Bbox, Scene } from '../../domain/types';

export interface StacAssetLike {
  href?: string;
  type?: string;
  title?: string;
}

export interface StacItemLike {
  id: string;
  bbox?: number[];
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown>;
  assets?: Record<string, StacAssetLike>;
  links?: { rel?: string; href?: string }[];
  collection?: string;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** 递归求坐标数组的经纬度范围 */
function walkCoords(coords: unknown, acc: Bbox): void {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    const lon = coords[0] as number;
    const lat = coords[1] as number;
    if (lon < acc[0]) acc[0] = lon;
    if (lat < acc[1]) acc[1] = lat;
    if (lon > acc[2]) acc[2] = lon;
    if (lat > acc[3]) acc[3] = lat;
    return;
  }
  for (const c of coords as unknown[]) walkCoords(c, acc);
}

function bboxOf(item: StacItemLike): Bbox | null {
  const b = item.bbox;
  if (Array.isArray(b) && b.length >= 4) {
    const [a, c, d, e] = b as number[];
    if ([a, c, d, e].every((v) => Number.isFinite(v))) {
      return [Math.min(a!, d!), Math.min(c!, e!), Math.max(a!, d!), Math.max(c!, e!)];
    }
  }
  if (item.geometry?.coordinates) {
    const acc: Bbox = [180, 90, -180, -90];
    walkCoords(item.geometry.coordinates, acc);
    if (acc[0] <= acc[2] && acc[1] <= acc[3]) return acc;
  }
  return null;
}

export function toScene(item: StacItemLike): Scene | null {
  if (!item?.id) return null;
  const p = item.properties ?? {};
  const datetime = typeof p['datetime'] === 'string' ? (p['datetime'] as string) : '';
  if (!datetime) return null;

  const bbox = bboxOf(item);
  if (!bbox) return null;

  const cloudCover = num(p['eo:cloud_cover'], 100);
  const high = num(p['s2:high_proba_clouds_percentage'], NaN as unknown as number);
  const medium = num(p['s2:medium_proba_clouds_percentage'], NaN as unknown as number);
  const thickRaw = (Number.isFinite(high) ? high : 0) + (Number.isFinite(medium) ? medium : 0);
  // 缺厚云字段时退回整景均值，保证排序可用
  const thickCloud = thickRaw > 0 || (Number.isFinite(high) && Number.isFinite(medium)) ? thickRaw : cloudCover;

  const a = item.assets ?? {};
  const selfLink = item.links?.find((l) => l.rel === 'self')?.href;

  return {
    id: item.id,
    datetime,
    platform: typeof p['platform'] === 'string' ? (p['platform'] as string) : 'sentinel-2',
    cloudCover,
    thickCloud,
    bbox,
    footprint:
      item.geometry?.type === 'Polygon'
        ? { type: 'Polygon', coordinates: item.geometry.coordinates as number[][][] }
        : null,
    assets: {
      visual: a['visual']?.href,
      preview: a['preview']?.href,
      thumbnail: a['thumbnail']?.href,
      analytic: a['red']?.href ?? a['B04']?.href,
      scl: a['scl']?.href ?? a['SCL']?.href,
    },
    stacHref: selfLink ?? '',
  };
}
