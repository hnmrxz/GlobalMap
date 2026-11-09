/**
 * 检索适配器：AWS Earth Search STAC（零 Key，CORS `*`）。
 *
 * 实测注意：该服务不支持 `sortby`（返回 "No mapping found for [datetime]"），
 * 因此排序一律在客户端完成 —— 详见 docs/04-imagery-loading.md。
 */
import { config } from '../../config';
import { isoUtcRange } from '../../domain/dates';
import { dedupeScenes, sortScenes } from '../../domain/scene';
import type { Scene, SearchQuery } from '../../domain/types';
import { getJson, type RequestOptions } from '../http';
import { toScene, type StacItemLike } from './normalize';

interface ItemsResponse {
  features?: StacItemLike[];
  context?: { matched?: number; returned?: number };
  numberMatched?: number;
}

export interface SearchResult {
  scenes: Scene[];
  matched: number;
  truncated: boolean;
}

function baseUrl(): string {
  return config.stacBase.replace(/\/+$/, '');
}

export function buildItemsUrl(query: SearchQuery, limit: number = config.searchLimit): string {
  const url = new URL(`${baseUrl()}/collections/${encodeURIComponent(config.stacCollection)}/items`);
  url.searchParams.set('bbox', query.bbox.map((v) => v.toFixed(4)).join(','));
  url.searchParams.set('datetime', isoUtcRange(query.from, query.to));
  url.searchParams.set('limit', String(Math.min(100, Math.max(1, Math.round(limit)))));

  const q: Record<string, unknown> = {
    'eo:cloud_cover': { lt: Math.min(100, Math.max(0, Math.round(query.cloud))) },
  };
  if (query.platform === '2a') q['platform'] = { eq: 'sentinel-2a' };
  url.searchParams.set('query', JSON.stringify(q));

  return url.toString();
}

export async function searchScenes(query: SearchQuery, opts: RequestOptions = {}): Promise<SearchResult> {
  const url = buildItemsUrl(query);
  const data = await getJson<ItemsResponse>(url, {
    timeoutMs: config.httpTimeout,
    headers: { Accept: 'application/geo+json, application/json' },
    signal: opts.signal,
  });

  const raw = Array.isArray(data.features) ? data.features : [];
  const scenes: Scene[] = [];
  for (const item of raw) {
    const scene = toScene(item);
    if (scene) scenes.push(scene);
  }
  const unique = sortScenes(dedupeScenes(scenes));
  const matched = data.context?.matched ?? data.numberMatched ?? unique.length;

  return { scenes: unique, matched, truncated: matched > unique.length };
}
