/** 底图源定义。attribution 字符串是法规要求，必须原样展示，不得隐藏。 */

export interface BaseSource {
  id: string;
  label: string;
  /** Leaflet 模板：{z}/{x}/{y}；WMTS 的 TileRow 在前，用 mapTemplate 转换 */
  url: string;
  /** true 表示模板顺序为 {z}/{y}/{x}（EOX WMTS 的 GoogleMapsCompatible 矩阵） */
  yxOrder?: boolean;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
  /** 深色 UI 下的叠加色 */
  tint?: string;
}

export const EOX_ATTRIBUTION =
  '<a href="https://cloudless.eox.at" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX · Copernicus';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

export const COPERNICUS_ATTRIBUTION =
  'Sentinel-2 &copy; Copernicus · <a href="https://earth-search.aws.element84.com/v1" target="_blank" rel="noopener">Earth Search</a> · <a href="https://titiler.xyz" target="_blank" rel="noopener">titiler</a>';

export const BASEMAPS: BaseSource[] = [
  {
    id: 'eox-cloudless-2025',
    label: '卫星底图 2025',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
    yxOrder: true,
    attribution: EOX_ATTRIBUTION,
    maxZoom: 18,
    maxNativeZoom: 15,
  },
  {
    id: 'eox-cloudless-2024',
    label: '卫星底图 2024',
    url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg',
    yxOrder: true,
    attribution: EOX_ATTRIBUTION,
    maxZoom: 18,
    maxNativeZoom: 15,
  },
  {
    id: 'osm',
    label: '街道底图 OSM',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: OSM_ATTRIBUTION,
    maxZoom: 19,
    maxNativeZoom: 19,
  },
  {
    id: 'none',
    label: '无底图',
    url: '',
    attribution: '',
    maxZoom: 19,
    maxNativeZoom: 19,
  },
];

export function getBase(id: string): BaseSource {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0]!;
}
