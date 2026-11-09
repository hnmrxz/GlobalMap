/**
 * 渲染分级：缩放级别 → 用一个请求出多大的图。
 *
 * 设计依据（实测）：
 * 1. 公共 titiler 并发 9 张瓦片需 10.3 s → 主路径不用瓦片，一次交互一个 /cog/bbox 请求；
 * 2. `dst_crs` 在该公共实例上会 500（"cannot convert float NaN"）→ 一律用 EPSG:4326 bbox；
 * 3. 整景预览图在低缩放时反而不如"视口裁剪 + 10 m 真彩"清晰 → z≥10 全部走裁剪。
 */
import { config } from '../config';

export type RenderTier = 'thumb' | 'crop' | 'fine';

export interface TierPlan {
  tier: RenderTier;
  /** 0 表示不需要渲染请求 */
  maxSize: number;
  note: string;
}

export function planForZoom(zoom: number, maxPx: number = config.renderMaxPx): TierPlan {
  if (zoom <= 9) {
    return { tier: 'thumb', maxSize: 0, note: '' };
  }
  if (zoom <= 14) {
    return { tier: 'crop', maxSize: Math.min(1024, maxPx), note: '' };
  }
  return {
    tier: 'fine',
    maxSize: Math.min(2048, Math.max(maxPx, 1536)),
    note: zoom >= 17 ? '已接近 Sentinel-2 原始分辨率（10 米）上限' : '',
  };
}

/** 是否已超过原始分辨率（10 m/px），用于解释"为什么放大后变糊" */
export function beyondNativeResolution(zoom: number, lat: number): boolean {
  const mpp = (156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return mpp < 10;
}

export const TIER_LABEL: Record<RenderTier, string> = {
  thumb: '缩略图',
  crop: '细节 10 m',
  fine: '最细 10 m',
};
