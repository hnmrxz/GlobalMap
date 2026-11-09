/**
 * 检索用例：视口 → bbox → STAC → 排序 → 自动选中。
 * 负责：去抖、缓存、取消、令牌防错序、错误态、自动选中策略。
 */
import { config } from '../config';
import { bboxArea, bboxSpan, roundBbox } from '../domain/bbox';
import { pickScene } from '../domain/scene';
import type { Bbox, Scene, SearchQuery } from '../domain/types';
import { readQuery, writeQuery } from '../services/cache/queryCache';
import { HttpError, isAbort } from '../services/http';
import { searchScenes } from '../services/stac/earthSearch';
import type { Store } from './store';

export interface SearchFlowDeps {
  store: Store;
  /** 取当前视口 bbox（4326） */
  getBbox: () => Bbox | null;
}

export interface SearchFlow {
  /** 计划一次检索（带去抖） */
  request(delayMs?: number): void;
  /** 立即执行（重试按钮用） */
  run(force?: boolean): Promise<void>;
  cancel(): void;
}

const AREA_LIMIT = config.maxBboxDeg * config.maxBboxDeg;

export function createSearchFlow(deps: SearchFlowDeps): SearchFlow {
  const { store, getBbox } = deps;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0;

  function cancel(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    controller?.abort();
    controller = null;
  }

  function request(delayMs = config.moveDebounce): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, Math.max(0, delayMs));
  }

  async function run(force = false): Promise<void> {
    const raw = getBbox();
    if (!raw) return;
    const bbox = roundBbox(raw);
    const s = store.get();

    const [dx, dy] = bboxSpan(bbox);
    if (dx * dy > AREA_LIMIT) {
      store.set({
        bbox,
        banner: {
          kind: 'warn',
          msg: `当前范围约 ${dx.toFixed(1)}° × ${dy.toFixed(1)}°，超出检索上限（${config.maxBboxDeg}°）。请放大地图，或改用框选工具。`,
        },
      });
      return;
    }

    const query: SearchQuery = { bbox, from: s.from, to: s.to, cloud: s.cloud, platform: s.platform };

    if (!force) {
      const cached = readQuery(query);
      if (cached) {
        apply(cached.scenes, cached.matched, { fromCache: true, truncated: cached.matched > cached.scenes.length }, bbox);
        return;
      }
    }

    const myToken = ++token;
    controller?.abort();
    controller = new AbortController();

    store.set({
      bbox,
      query: { ...s.query, status: 'loading', error: '' },
      banner: null,
    });

    try {
      const res = await searchScenes(query, { signal: controller.signal });
      if (myToken !== token) return;
      writeQuery(query, res.scenes, res.matched);
      apply(res.scenes, res.matched, { fromCache: false, truncated: res.truncated }, bbox);
    } catch (err) {
      if (myToken !== token || isAbort(err)) return;
      const message = describeError(err);
      const current = store.get();
      store.set({
        query: { ...current.query, status: 'error', error: message },
        banner: {
          kind: 'error',
          msg: message,
          actionLabel: '重试',
          action: () => void run(true),
        },
      });
    }
  }

  function apply(
    scenes: Scene[],
    matched: number,
    meta: { fromCache: boolean; truncated: boolean },
    bbox: Bbox,
  ): void {
    const s = store.get();
    const keep = s.selectedId && scenes.some((x) => x.id === s.selectedId) ? s.selectedId : null;
    const picked = pickScene(scenes, s.cloud, bbox);
    const selectedId = keep ?? picked.scene?.id ?? null;

    let banner = null as typeof s.banner;
    if (!scenes.length) {
      banner = {
        kind: 'info',
        msg: '该区域在所选时间与云量条件下没有影像。可以放宽云量、扩大时间范围，或缩小地图范围。',
        actionLabel: '放宽云量到 50%',
        action: () => store.set({ cloud: 50 }),
      };
    } else if (picked.reason === 'best' && picked.scene) {
      banner = {
        kind: 'warn',
        msg: `所选云量内没有影像，已展示近期最清晰的一景（云量 ${picked.scene.cloudCover.toFixed(1)}%）。`,
        actionLabel: '放宽云量',
        action: () => store.set({ cloud: Math.min(100, Math.round(picked.scene!.cloudCover) + 10) }),
      };
    }

    store.set({
      bbox,
      scenes,
      matched,
      selectedId,
      query: {
        status: scenes.length ? 'ok' : 'empty',
        error: '',
        updatedAt: Date.now(),
        fromCache: meta.fromCache,
        truncated: meta.truncated,
      },
      banner,
    });
  }

  return { request, run, cancel };
}

function describeError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.kind === 'timeout') return '检索服务响应超时，请检查网络后重试。';
    if (err.kind === 'network') return '无法连接检索服务（可能是网络或跨域限制）。';
    if (err.kind === 'http') return `检索服务返回错误（HTTP ${err.status ?? '?'}）。`;
    if (err.kind === 'parse') return '检索服务返回了无法解析的数据。';
  }
  return '检索失败，请稍后重试。';
}
