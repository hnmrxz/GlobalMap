/**
 * 渲染 URL 构造：把「场景 + 视口」翻译成 titiler 的一次 /cog/bbox 请求。
 *
 * 为什么是 /cog/bbox 而不是 /cog/tiles：
 * 实测公共实例并发 9 张瓦片需 10.3 s，地图交互不可用；
 * 单次 bbox 请求延迟可预测（1–5 s），请求数恒定 —— 见 docs/07-adr.md ADR-002。
 *
 * 坐标系：bbox 用 EPSG:4326（实测该实例的 dst_crs=EPSG:3857 会 500），
 * 叠加层用同一个 bbox 的经纬度角点，视口级范围内墨卡托非线性误差远小于 1 像素。
 */
import { config } from '../../config';
import type { Bbox, Scene } from '../../domain/types';

export interface CropPlan {
  url: string;
  /** 实际请求用的（已取整的）bbox，叠加层必须用它算角点 */
  bbox: Bbox;
}

export function assetFor(scene: Scene): string | null {
  return scene.assets.visual ?? scene.assets.preview ?? null;
}

export function thumbSrc(scene: Scene): string | null {
  return scene.assets.thumbnail ?? null;
}

function base(): string {
  return config.titilerBase.replace(/\/+$/, '');
}

function bandQuery(): URLSearchParams {
  const qs = new URLSearchParams();
  qs.append('bidx', '1');
  qs.append('bidx', '2');
  qs.append('bidx', '3');
  return qs;
}

export function planCrop(assetUrl: string, bbox: Bbox, maxSize: number): CropPlan {
  const rounded: Bbox = [
    Math.min(bbox[0], bbox[2]),
    Math.min(bbox[1], bbox[3]),
    Math.max(bbox[0], bbox[2]),
    Math.max(bbox[1], bbox[3]),
  ];
  const coords = rounded.map((v) => v.toFixed(4)).join(',');
  const qs = bandQuery();
  qs.set('url', assetUrl);
  qs.set('max_size', String(Math.max(256, Math.round(maxSize))));
  return { url: `${base()}/cog/bbox/${coords}.jpg?${qs.toString()}`, bbox: rounded };
}

/**
 * 可选模式：标准 XYZ 瓦片模板（默认关闭）。
 * 必须用字符串拼接构造，`new URL()` 会把模板里的 {} 百分号编码。
 */
export function tileUrlTemplate(assetUrl: string): string {
  const qs = bandQuery();
  qs.set('url', assetUrl);
  return `${base()}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.jpg?${qs.toString()}`;
}
