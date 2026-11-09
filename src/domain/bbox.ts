/** 包围盒工具：纯数学，无 I/O，可 100% 单测。 */
import type { Bbox, MercBbox } from './types';

/** Web Mercator 极值纬度 */
export const MAX_LAT = 85.05112878;
const R = 6378137;
const RAD = Math.PI / 180;

export function clampLat(lat: number): number {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

/** 裁到全球范围，并保证顺序合法（min < max） */
export function clampBbox(b: Bbox): Bbox {
  const minLon = Math.max(-180, Math.min(180, Math.min(b[0], b[2])));
  const maxLon = Math.max(-180, Math.min(180, Math.max(b[0], b[2])));
  const minLat = clampLat(Math.min(b[1], b[3]));
  const maxLat = clampLat(Math.max(b[1], b[3]));
  return [minLon, minLat, maxLon, maxLat];
}

/** 按步长取整（缓存键用，避免 1 像素抖动击穿缓存） */
export function roundBbox(b: Bbox, step = 0.01): Bbox {
  const r = (v: number) => Math.round(v / step) * step;
  return clampBbox([r(b[0]), r(b[1]), r(b[2]), r(b[3])]);
}

export function bboxSpan(b: Bbox): [number, number] {
  return [Math.abs(b[2] - b[0]), Math.abs(b[3] - b[1])];
}

/** 面积（平方度），用于判断"范围过大" */
export function bboxArea(b: Bbox): number {
  const [dx, dy] = bboxSpan(b);
  return dx * dy;
}

export function bboxKey(b: Bbox): string {
  return b.map((v) => v.toFixed(2)).join(',');
}

/** 经纬度 → Web Mercator 米 */
export function to3857(lon: number, lat: number): [number, number] {
  const x = R * lon * RAD;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (clampLat(lat) * RAD) / 2));
  return [x, y];
}

/** Web Mercator 米 → 经纬度（返回 [lat, lng]，方便直接喂 Leaflet） */
export function from3857(x: number, y: number): [number, number] {
  const lng = (x / R) / RAD;
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / RAD;
  return [lat, lng];
}

export function bboxTo3857(b: Bbox): MercBbox {
  const [minX, minY] = to3857(b[0], b[1]);
  const [maxX, maxY] = to3857(b[2], b[3]);
  return [Math.min(minX, maxX), Math.min(minY, maxY), Math.max(minX, maxX), Math.max(minY, maxY)];
}

export function bboxFrom3857(m: MercBbox): Bbox {
  const [minX, minY, maxX, maxY] = m;
  const [lat1, lng1] = from3857(Math.min(minX, maxX), Math.min(minY, maxY));
  const [lat2, lng2] = from3857(Math.max(minX, maxX), Math.max(minY, maxY));
  return [Math.min(lng1, lng2), Math.min(lat1, lat2), Math.max(lng1, lng2), Math.max(lat1, lat2)];
}

/** 两个 bbox 的交集；无交集返回 null */
export function intersectBbox(a: Bbox, b: Bbox): Bbox | null {
  const minLon = Math.max(a[0], b[0]);
  const minLat = Math.max(a[1], b[1]);
  const maxLon = Math.min(a[2], b[2]);
  const maxLat = Math.min(a[3], b[3]);
  if (minLon >= maxLon || minLat >= maxLat) return null;
  return [minLon, minLat, maxLon, maxLat];
}

/** b 是否完全落在 a 内 */
export function bboxContains(a: Bbox, b: Bbox): boolean {
  return a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];
}

export function padBbox(b: Bbox, ratio: number): Bbox {
  const [dx, dy] = bboxSpan(b);
  return clampBbox([b[0] - dx * ratio, b[1] - dy * ratio, b[2] + dx * ratio, b[3] + dy * ratio]);
}

/** 从 Leaflet 的 bounds 形状对象构造 bbox（避免 domain 依赖 leaflet 类型） */
export function boundsToBbox(sw: { lat: number; lng: number }, ne: { lat: number; lng: number }): Bbox {
  return clampBbox([Math.min(sw.lng, ne.lng), Math.min(sw.lat, ne.lat), Math.max(sw.lng, ne.lng), Math.max(sw.lat, ne.lat)]);
}

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392804097 * Math.cos(clampLat(lat) * RAD)) / Math.pow(2, zoom);
}

/** 人类可读的范围描述，用于面板提示 */
export function describeBbox(b: Bbox): string {
  const [dx, dy] = bboxSpan(b);
  const kmX = dx * 111.32 * Math.cos(((b[1] + b[3]) / 2) * RAD);
  const kmY = dy * 110.57;
  return `${kmX.toFixed(0)} × ${kmY.toFixed(0)} km`;
}
