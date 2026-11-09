/** 场景的排序与挑选规则（"最新 vs 最佳"是产品核心体验）。 */
import type { Bbox, Scene } from './types';
import { beijingDayKey } from './dates';

/** 按时间降序；同一天内厚云少的优先 */
export function sortScenes(list: Scene[]): Scene[] {
  return [...list].sort((a, b) => {
    const ta = Date.parse(a.datetime);
    const tb = Date.parse(b.datetime);
    if (Number.isFinite(ta) && Number.isFinite(tb) && tb !== ta) return tb - ta;
    if (a.thickCloud !== b.thickCloud) return a.thickCloud - b.thickCloud;
    return a.id.localeCompare(b.id);
  });
}

export function dedupeScenes(list: Scene[]): Scene[] {
  const seen = new Set<string>();
  const out: Scene[] = [];
  for (const s of list) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

export interface PickResult {
  scene: Scene | null;
  /** latest = 满足云量阈值的最新；best = 阈值内无解，退回最低云量 */
  reason: 'latest' | 'best' | 'none';
}

function containsCenter(scene: Scene, focus: Bbox): boolean {
  const lon = (focus[0] + focus[2]) / 2;
  const lat = (focus[1] + focus[3]) / 2;
  const [minLon, minLat, maxLon, maxLat] = scene.bbox;
  return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
}

/**
 * 自动选中策略：
 * 1. 优先"覆盖当前视口中心"的景——否则会出现"最新一景只有边缘一小条落在地图里"；
 * 2. 其中优先满足云量上限的最新一景；
 * 3. 若都不满足，退回云量最低的一景，让 UI 说明，避免"最新=全云"的挫败。
 */
export function pickScene(list: Scene[], cloudLimit: number, focus?: Bbox): PickResult {
  if (!list.length) return { scene: null, reason: 'none' };
  const covered = focus ? list.filter((s) => containsCenter(s, focus)) : [];
  const source = covered.length ? covered : list;
  const sorted = sortScenes(source);
  const ok = sorted.find((s) => s.cloudCover <= cloudLimit);
  if (ok) return { scene: ok, reason: 'latest' };
  let best = sorted[0] as Scene;
  for (const s of sorted) if (s.cloudCover < best.cloudCover) best = s;
  return { scene: best, reason: 'best' };
}

/** 某一天（北京时区）里云量最低的一景 */
export function sceneOnDay(list: Scene[], dayKey: string): Scene | null {
  let best: Scene | null = null;
  for (const s of list) {
    if (beijingDayKey(s.datetime) !== dayKey) continue;
    if (!best || s.cloudCover < best.cloudCover) best = s;
  }
  return best;
}

export function cloudText(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v < 0.05) return '0%';
  if (v < 10) return `${v.toFixed(1)}%`;
  return `${Math.round(v)}%`;
}

/** sentinel-2a → 2A */
export function platformTag(platform: string): string {
  const m = /sentinel-2([a-c])/i.exec(platform);
  return m && m[1] ? m[1].toUpperCase() : platform.replace(/^sentinel-/i, '').toUpperCase();
}

export function platformName(platform: string): string {
  const tag = platformTag(platform);
  return tag.length === 2 ? `Sentinel-2${tag}` : platform;
}
