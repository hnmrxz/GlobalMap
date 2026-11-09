/**
 * 时间工具：STAC 一律 UTC，界面一律北京时间（二者同时显示，避免跨时区误读）。
 * 纯函数，可单测。
 */
import type { Scene } from './types';

const BJ_TZ = 'Asia/Shanghai';

/** 解析 STAC 时间戳。V8 对 6 位小数秒兼容不一，先归一化到 3 位。 */
export function parseIso(iso: string): Date {
  const normalized = iso.replace(/(\.\d{3})\d+/, '$1');
  return new Date(normalized);
}

/** 本地日期 → YYYY-MM-DD */
export function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(now: Date = new Date()): string {
  return toDateInput(now);
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${`${dt.getUTCMonth() + 1}`.padStart(2, '0')}-${`${dt.getUTCDate()}`.padStart(2, '0')}`;
}

/** 最近 N 天（含今天）的区间 */
export function presetRange(days: number, now: Date = new Date()): { from: string; to: string } {
  const to = todayISO(now);
  return { from: addDaysISO(to, -(days - 1)), to };
}

/** 生成 STAC 的 datetime 参数："2026-08-08T00:00:00Z/2026-11-06T23:59:59Z" */
export function isoUtcRange(from: string, to: string): string {
  return `${from}T00:00:00Z/${to}T23:59:59Z`;
}

function parts(iso: string, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const d = parseIso(iso);
  if (Number.isNaN(d.getTime())) return {};
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: BJ_TZ, hourCycle: 'h23', ...opts });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** "2026-11-02 11:16"（北京时间） */
export function formatBeijing(iso: string): string {
  const p = parts(iso, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  if (!p.year) return iso;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** "11:16" */
export function beijingClock(iso: string): string {
  const p = parts(iso, { hour: '2-digit', minute: '2-digit' });
  return p.hour ? `${p.hour}:${p.minute}` : '';
}

/** 北京时区的日期键 "2026-11-02"（用于时间轴分箱） */
export function beijingDayKey(iso: string): string {
  const p = parts(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return p.year ? `${p.year}-${p.month}-${p.day}` : iso.slice(0, 10);
}

/** "11-02" */
export function dayLabel(dayKey: string): string {
  return dayKey.slice(5);
}

/** 距今天数（负值表示未来） */
export function daysAgo(dayKey: string, now: Date = new Date()): number {
  const a = Date.parse(`${dayKey}T00:00:00Z`);
  const b = Date.parse(`${todayISO(now)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/** 相对时间描述："3 小时前"、"2 天前" */
export function relativeAge(iso: string, now: Date = new Date()): string {
  const t = parseIso(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now.getTime() - t);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return `${Math.floor(days / 30)} 个月前`;
}

/** 场景按"北京时区日期"去重，得到时间轴的刻度（降序） */
export function uniqueDays(scenes: Scene[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of scenes) {
    const k = beijingDayKey(s.datetime);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

/** 该日期下云量最低的一景 */
export function sceneOnDay(scenes: Scene[], dayKey: string): Scene | null {
  let best: Scene | null = null;
  for (const s of scenes) {
    if (beijingDayKey(s.datetime) !== dayKey) continue;
    if (!best || s.cloudCover < best.cloudCover) best = s;
  }
  return best;
}
