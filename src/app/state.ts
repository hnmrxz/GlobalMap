import { config } from '../config';
import { presetRange } from '../domain/dates';
import type { Banner, Bbox, LoadStatus, PlatformFilter, Scene } from '../domain/types';
import type { RenderTier } from '../domain/zoomTier';

export type SheetState = 'peek' | 'half' | 'full';
export type RenderStatus = 'idle' | 'loading' | 'ok' | 'degraded' | 'error';

export interface RenderState {
  status: RenderStatus;
  /** 可直接赋给 <img> 的地址（可能是 blob: URL） */
  src: string | null;
  /** 叠加层经纬度角点 [[south, west], [north, east]] */
  bounds: [[number, number], [number, number]] | null;
  note: string;
  tier: RenderTier | null;
}

export interface QueryState {
  status: LoadStatus;
  error: string;
  updatedAt: number;
  fromCache: boolean;
  truncated: boolean;
}

export interface AppState {
  bbox: Bbox | null;
  from: string;
  to: string;
  cloud: number;
  platform: PlatformFilter;
  basemap: string;
  scenes: Scene[];
  matched: number;
  selectedId: string | null;
  query: QueryState;
  render: RenderState;
  sheet: SheetState;
  detailOpen: boolean;
  drawing: boolean;
  banner: Banner | null;
}

export function createInitialState(): AppState {
  const range = presetRange(config.defaultDays);
  return {
    bbox: null,
    from: range.from,
    to: range.to,
    cloud: config.defaultCloud,
    platform: 'all',
    basemap: config.basemap,
    scenes: [],
    matched: 0,
    selectedId: null,
    query: { status: 'idle', error: '', updatedAt: 0, fromCache: false, truncated: false },
    render: { status: 'idle', src: null, bounds: null, note: '', tier: null },
    sheet: 'peek',
    detailOpen: false,
    drawing: false,
    banner: null,
  };
}
