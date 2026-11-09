/** 降级链的各级素材：缩略图、STAC JSON、COG 直链、Copernicus Browser 深链。 */
import type { Scene } from '../../domain/types';
import { parseIso } from '../../domain/dates';

export function thumbSrc(scene: Scene): string | null {
  return scene.assets.thumbnail ?? null;
}

export function stacJsonUrl(scene: Scene): string | null {
  return scene.stacHref || null;
}

export function cogUrl(scene: Scene, kind: 'visual' | 'analytic' = 'visual'): string | null {
  if (kind === 'analytic') return scene.assets.analytic ?? scene.assets.visual ?? null;
  return scene.assets.visual ?? null;
}

export function sceneCenter(scene: Scene): { lat: number; lon: number } {
  const [minLon, minLat, maxLon, maxLat] = scene.bbox;
  return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
}

/** Copernicus Browser 深链：带位置与当天时间窗，一步跳到官方看图 */
export function browserDeepLink(scene: Scene, zoom = 13): string {
  const { lat, lon } = sceneCenter(scene);
  const d = parseIso(scene.datetime);
  const valid = !Number.isNaN(d.getTime());
  const day = valid ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) : new Date();
  const from = new Date(day.getTime() - 12 * 3600 * 1000).toISOString();
  const to = new Date(day.getTime() + 36 * 3600 * 1000).toISOString();
  const params = new URLSearchParams({
    zoom: String(zoom),
    lat: lat.toFixed(4),
    lng: lon.toFixed(4),
    datasetId: 'S2_L2A_CDAS',
    fromTime: from,
    toTime: to,
  });
  return `https://browser.dataspace.copernicus.eu/?${params.toString()}`;
}

/** 人类可读体积 */
export function humanBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
