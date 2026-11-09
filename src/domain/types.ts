/** 跨层共享的领域类型：不依赖任何框架/网络/DOM。 */

/** WGS84 经纬度包围盒：[minLon, minLat, maxLon, maxLat] */
export type Bbox = [number, number, number, number];

/** 3857 米制包围盒：[minX, minY, maxX, maxY] */
export type MercBbox = [number, number, number, number];

/** Leaflet 的经纬度元组顺序：[lat, lng] */
export type LatLngTuple = [number, number];

export interface SceneAssets {
  /** 10 m 真彩 COG（3×uint8），用于细节裁剪 */
  visual?: string;
  /** 320 m 预览 COG，用于整景概览 */
  preview?: string;
  /** 缩略图 JPEG（约 45 KB），降级与列表用 */
  thumbnail?: string;
  /** B04 分析波段（uint16） */
  analytic?: string;
  /** 场景分类图层 */
  scl?: string;
}

export interface Scene {
  id: string;
  /** ISO 8601 UTC */
  datetime: string;
  /** sentinel-2a | sentinel-2b | sentinel-2c */
  platform: string;
  /** 整景平均云量（%） */
  cloudCover: number;
  /** 厚云占比（高+中概率云），比平均值更贴近"能否看见地面" */
  thickCloud: number;
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: Bbox;
  /** GeoJSON Polygon */
  footprint: GeoJSON.Polygon | null;
  assets: SceneAssets;
  /** 原始 STAC Item 链接 */
  stacHref: string;
}

export type PlatformFilter = 'all' | '2a';

export interface SearchQuery {
  bbox: Bbox;
  /** YYYY-MM-DD（北京时区） */
  from: string;
  /** YYYY-MM-DD */
  to: string;
  /** 云量上限 0-100 */
  cloud: number;
  platform: PlatformFilter;
}

/** 地图视图状态（Leaflet 语义：中心瓦片 + 缩放） */
export interface ViewState {
  z: number;
  x: number;
  y: number;
}

export type LoadStatus = 'idle' | 'loading' | 'ok' | 'empty' | 'error';

export interface Banner {
  kind: 'info' | 'warn' | 'error' | 'ok';
  msg: string;
  actionLabel?: string;
  action?: () => void;
}
