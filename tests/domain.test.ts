import { describe, expect, it } from 'vitest';
import {
  bboxArea,
  bboxFrom3857,
  bboxKey,
  bboxTo3857,
  clampBbox,
  intersectBbox,
  roundBbox,
  to3857,
  from3857,
} from '../src/domain/bbox';
import { addDaysISO, beijingDayKey, presetRange, uniqueDays } from '../src/domain/dates';
import { pickScene, sortScenes } from '../src/domain/scene';
import { planForZoom } from '../src/domain/zoomTier';
import { buildHash, parseHash } from '../src/app/urlState';
import type { Scene } from '../src/domain/types';

function scene(id: string, iso: string, cloud: number, thick = cloud): Scene {
  return {
    id,
    datetime: iso,
    platform: 'sentinel-2a',
    cloudCover: cloud,
    thickCloud: thick,
    bbox: [116.3, 39.9, 116.5, 40.0],
    footprint: null,
    assets: {},
    stacHref: '',
  };
}

describe('bbox', () => {
  it('clamps and orders', () => {
    expect(clampBbox([200, -95, -200, 95])).toEqual([-180, -85.05112878, 180, 85.05112878]);
    expect(clampBbox([116.5, 40, 116.3, 39.9])).toEqual([116.3, 39.9, 116.5, 40]);
  });

  it('rounds to a stable key', () => {
    const a = roundBbox([116.3049, 39.8991, 116.4952, 40.0024]);
    const b = roundBbox([116.3001, 39.9002, 116.4999, 40.0001]);
    expect(bboxKey(a)).toBe(bboxKey(b));
  });

  it('computes area', () => {
    expect(bboxArea([0, 0, 2, 3])).toBe(6);
  });

  it('intersects or returns null', () => {
    expect(intersectBbox([0, 0, 2, 2], [1, 1, 3, 3])).toEqual([1, 1, 2, 2]);
    expect(intersectBbox([0, 0, 1, 1], [2, 2, 3, 3])).toBeNull();
  });

  it('round-trips mercator', () => {
    const [x, y] = to3857(116.4074, 39.9042);
    const [lat, lng] = from3857(x, y);
    expect(lat).toBeCloseTo(39.9042, 5);
    expect(lng).toBeCloseTo(116.4074, 5);
  });

  it('keeps merc bbox orientation', () => {
    const m = bboxTo3857([116.3, 39.9, 116.5, 40.0]);
    expect(m[0]).toBeLessThan(m[2]);
    expect(m[1]).toBeLessThan(m[3]);
    const back = bboxFrom3857(m);
    expect(back[1]).toBeCloseTo(39.9, 4);
    expect(back[3]).toBeCloseTo(40.0, 4);
  });
});

describe('dates', () => {
  it('adds days across month boundary', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('builds preset ranges inclusively', () => {
    const r = presetRange(7, new Date('2026-11-06T10:00:00+08:00'));
    expect(r.to).toBe('2026-11-06');
    expect(r.from).toBe('2026-10-31');
  });

  it('maps UTC to Beijing day', () => {
    expect(beijingDayKey('2026-11-02T03:16:45.266000Z')).toBe('2026-11-02');
    // 17:30 UTC = 次日 01:30 北京
    expect(beijingDayKey('2026-11-02T17:30:00Z')).toBe('2026-11-03');
  });

  it('dedupes days newest first', () => {
    const scenes = [
      scene('a', '2026-11-02T03:00:00Z', 1),
      scene('b', '2026-10-25T03:00:00Z', 1),
      scene('c', '2026-10-25T05:00:00Z', 2),
    ];
    expect(uniqueDays(scenes)).toEqual(['2026-11-02', '2026-10-25']);
  });
});

describe('scene picking', () => {
  const scenes = [
    scene('new-cloudy', '2026-11-02T03:00:00Z', 80),
    scene('older-clear', '2026-10-25T03:00:00Z', 3),
    scene('oldest-clear', '2026-10-11T03:00:00Z', 5),
  ];

  it('sorts newest first', () => {
    expect(sortScenes(scenes).map((s) => s.id)).toEqual(['new-cloudy', 'older-clear', 'oldest-clear']);
  });

  it('prefers the newest scene within cloud limit', () => {
    expect(pickScene(scenes, 10).scene?.id).toBe('older-clear');
    expect(pickScene(scenes, 10).reason).toBe('latest');
  });

  it('falls back to the clearest scene', () => {
    const dark = [scene('a', '2026-11-02T03:00:00Z', 90), scene('b', '2026-11-01T03:00:00Z', 60)];
    const r = pickScene(dark, 10);
    expect(r.scene?.id).toBe('b');
    expect(r.reason).toBe('best');
  });

  it('returns none for empty input', () => {
    expect(pickScene([], 10)).toEqual({ scene: null, reason: 'none' });
  });

  it('prefers a scene covering the viewport centre', () => {
    const partial: Scene = { ...scene('edge-only', '2026-11-05T03:00:00Z', 1), bbox: [116.0, 39.0, 116.5, 39.6] };
    const covering: Scene = { ...scene('covering', '2026-10-30T03:00:00Z', 2), bbox: [116.0, 39.5, 117.2, 40.4] };
    const focus = [116.2, 39.7, 116.6, 40.1] as [number, number, number, number];
    const r = pickScene([partial, covering], 20, focus);
    expect(r.scene?.id).toBe('covering');
    // 不带 focus 时仍是"最新优先"
    expect(pickScene([partial, covering], 20).scene?.id).toBe('edge-only');
  });
});

describe('render tiers', () => {
  it('uses thumbnails at low zoom and 10m crops when zoomed', () => {
    expect(planForZoom(8).tier).toBe('thumb');
    expect(planForZoom(11).tier).toBe('crop');
    expect(planForZoom(13).tier).toBe('crop');
    expect(planForZoom(16).tier).toBe('fine');
    expect(planForZoom(13).maxSize).toBeLessThanOrEqual(1024);
    expect(planForZoom(16).maxSize).toBeGreaterThanOrEqual(1536);
  });
});

describe('url state', () => {
  it('round-trips', () => {
    const hash = buildHash({
      view: { z: 12, lat: 39.9042, lng: 116.4074 },
      from: '2026-08-01',
      to: '2026-11-06',
      cloud: 20,
      platform: '2a',
      scene: 'S2A_T50TMK_20261102T030954_L2A',
    });
    const parsed = parseHash(hash);
    expect(parsed.z).toBe(12);
    expect(parsed.from).toBe('2026-08-01');
    expect(parsed.platform).toBe('2a');
    expect(parsed.scene).toBe('S2A_T50TMK_20261102T030954_L2A');
  });

  it('is forgiving with garbage', () => {
    expect(parseHash('#foo')).toEqual({});
    expect(parseHash('#99/999/999?d=bad&c=abc&p=xx')).toMatchObject({ z: 18, lat: 85, lng: 180 });
    expect(parseHash('').cloud).toBeUndefined();
  });

  it('ignores reversed ranges by swapping', () => {
    const p = parseHash('#11/39/116?d=2026-11-06..2026-08-01');
    expect(p.from).toBe('2026-08-01');
    expect(p.to).toBe('2026-11-06');
  });
});
