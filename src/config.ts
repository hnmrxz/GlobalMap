/**
 * 全站唯一读取 import.meta.env 的地方（架构规则 4）。
 * 所有配置都有默认值：缺省即"零 Key 可用"。
 */

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: string | undefined, fallback: string): string {
  return v && v.trim() ? v.trim() : fallback;
}

const env = import.meta.env as Record<string, string | undefined>;

export const config = {
  /** STAC 检索服务（零 Key）。可换成 CDSE STAC v1 等其它同构服务。 */
  stacBase: str(env.VITE_STAC_BASE, 'https://earth-search.aws.element84.com/v1'),
  /** 采集集合：Collection-1 L2A，COG 格式，覆盖 2015 至今 */
  stacCollection: str(env.VITE_STAC_COLLECTION, 'sentinel-2-c1-l2a'),
  /** COG 渲染服务（零 Key，公共演示实例）。自建实例只需改这一行 */
  titilerBase: str(env.VITE_TITILER_BASE, 'https://titiler.xyz'),
  /** 底图 id：eox-cloudless-2025 | eox-cloudless-2024 | osm | none */
  basemap: str(env.VITE_BASEMAP, 'eox-cloudless-2025'),
  /** 地名搜索（Nominatim，须遵守 1 req/s 政策） */
  geocoder: str(env.VITE_GEOCODER, 'https://nominatim.openstreetmap.org'),

  /** 默认时间窗（天） */
  defaultDays: num(env.VITE_DEFAULT_DATETIME_DAYS, 90),
  /** 默认云量上限（%） */
  defaultCloud: num(env.VITE_DEFAULT_CLOUD, 20),
  /** 检索范围上限（度）。超过则不检索，提示放大 */
  maxBboxDeg: num(env.VITE_MAX_BBOX_DEG, 1.5),
  /** 单次出图最大边（像素） */
  renderMaxPx: num(env.VITE_RENDER_MAX_PX, 1024),
  /** 单次检索取回条数上限（服务端上限 100） */
  searchLimit: num(env.VITE_SEARCH_LIMIT, 100),

  /** 单个 HTTP 请求超时（毫秒） */
  httpTimeout: 8000,
  /** 出图请求超时（毫秒），超时即降级 */
  renderTimeout: 12000,
  /** 地图停稳后多久开始检索/重绘（毫秒） */
  moveDebounce: 400,
  /** 缩放档位变化后的重绘去抖（毫秒） */
  zoomDebounce: 250,
  /** 默认视图：北京 */
  home: { z: 11, lat: 39.9042, lng: 116.4074 },
  /** 缓存 */
  queryCacheTtlMs: 10 * 60 * 1000,
  queryCacheMax: 8,
  imageCacheBytes: 80 * 1024 * 1024,
} as const;

export type Config = typeof config;
