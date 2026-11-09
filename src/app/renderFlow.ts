/**
 * 出图用例：缩放分级 → 视口裁剪 → 单请求 → 降级。
 *
 * 关键约束（ADR-002）：并发 1、请求数恒定、失败必降级，绝不让用户看到破图。
 * 图片显示走 <img src>（不依赖 CORS），IndexedDB 缓存只作为"已缓存则秒开"的优化。
 */
import { config } from '../config';
import { bboxTo3857, intersectBbox } from '../domain/bbox';
import type { Bbox, Scene } from '../domain/types';
import { planForZoom } from '../domain/zoomTier';
import { getCachedImage, putCachedImage } from '../services/cache/imageCache';
import { getBlob, isAbort } from '../services/http';
import { browserDeepLink, thumbSrc } from '../services/render/fallback';
import { assetFor, planCrop } from '../services/render/titiler';
import type { RenderState } from './state';
import type { Store } from './store';

export type Bounds = [[number, number], [number, number]];

export interface RenderFlowDeps {
  store: Store;
  /** 当前视口 bbox（4326） */
  getViewBbox: () => Bbox | null;
  getZoom: () => number;
}

export interface RenderFlow {
  request(delayMs?: number): void;
  run(force?: boolean): Promise<void>;
  cancel(): void;
  /** 图片解码失败时由 UI 回调，直接走降级 */
  notifyError(): void;
  /** 图片真正加载完成时回调，把状态从 loading 收敛为 ok */
  notifyLoad(): void;
  degrade(reason: string): void;
}

const IDLE_RENDER: RenderState = { status: 'idle', src: null, bounds: null, note: '', tier: null };

function boundsOf(bbox: Bbox): Bounds {
  return [
    [bbox[1], bbox[0]],
    [bbox[3], bbox[2]],
  ];
}

export function createRenderFlow(deps: RenderFlowDeps): RenderFlow {
  const { store } = deps;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0;
  let lastKey = '';
  let activeSrc: string | null = null;
  const objectUrls = new Set<string>();

  function releaseObjectUrl(url: string | null): void {
    if (url && objectUrls.has(url)) {
      URL.revokeObjectURL(url);
      objectUrls.delete(url);
    }
  }

  function cancel(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function request(delayMs = config.moveDebounce): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, Math.max(0, delayMs));
  }

  function setRender(patch: Partial<RenderState>): void {
    store.set((s) => ({ render: { ...s.render, ...patch } }));
  }

  function degrade(reason: string): void {
    const s = store.get();
    const scene = s.scenes.find((x) => x.id === s.selectedId);
    if (!scene) return;
    const src = thumbSrc(scene);
    if (src && s.render.tier !== 'thumb') {
      activeSrc = src;
      setRender({ status: 'degraded', src, bounds: boundsOf(scene.bbox), note: reason, tier: 'thumb' });
    } else if (s.render.status !== 'error') {
      activeSrc = null;
      setRender({ status: 'error', src: null, bounds: null, note: reason, tier: null });
    }
  }

  async function run(force = false): Promise<void> {
    const s = store.get();
    const scene = s.scenes.find((x) => x.id === s.selectedId) ?? null;
    if (!scene) {
      activeSrc = null;
      setRender(IDLE_RENDER);
      return;
    }

    const zoom = deps.getZoom();
    const plan = planForZoom(zoom);
    cancel();

    // 低缩放：直接用约 45 KB 的缩略图，零渲染请求
    if (plan.tier === 'thumb') {
      const src = thumbSrc(scene);
      if (!src) {
        degrade('该场景缺少缩略图');
        return;
      }
      lastKey = '';
      activeSrc = src;
      setRender({ status: 'ok', src, bounds: boundsOf(scene.bbox), note: '', tier: 'thumb' });
      return;
    }

    const asset = assetFor(scene);
    if (!asset) {
      degrade('该场景缺少可用影像资产，已切换为缩略图');
      return;
    }

    const view = deps.getViewBbox();
    const clipped = view ? intersectBbox(view, scene.bbox) : null;
    const box = clipped ?? scene.bbox;
    const crop = planCrop(asset, box, plan.maxSize);
    const bounds = boundsOf(crop.bbox);

    if (!force && crop.url === lastKey && store.get().render.status === 'ok') return;

    lastKey = crop.url;
    const myToken = ++token;

    // 已缓存（含离线）→ 直接出图，不发请求
    const cached = await getCachedImage(crop.url);
    if (myToken !== token) return;

    if (cached) {
      const url = URL.createObjectURL(cached);
      objectUrls.add(url);
      const prev = activeSrc;
      activeSrc = url;
      setRender({ status: 'ok', src: url, bounds, note: plan.note, tier: plan.tier });
      setTimeout(() => releaseObjectUrl(prev), 2000);
      return;
    }

    // 主路径：直接把 URL 交给 <img>，交给浏览器加载；加载完成/失败由 overlay 回调
    const prev = activeSrc;
    activeSrc = crop.url;
    setRender({ status: 'loading', src: crop.url, bounds, note: plan.note, tier: plan.tier });
    setTimeout(() => releaseObjectUrl(prev), 2000);

    // 后台预热缓存（失败无关紧要）：让二次访问与离线可用
    if (navigator.onLine !== false) {
      void getBlob(crop.url, { timeoutMs: config.renderTimeout })
        .then((blob) => putCachedImage(crop.url, blob))
        .catch(() => undefined);
    }
  }

  return {
    request,
    run,
    cancel,
    degrade,
    notifyLoad() {
      if (store.get().render.status === 'loading') setRender({ status: 'ok' });
    },
    notifyError() {
      if (isAbort(undefined)) return;
      degrade('影像渲染失败，已切换为低清预览');
    },
  };
}

/** 供详情面板直接使用：官方看图深链 */
export function officialLink(scene: Scene): string {
  return browserDeepLink(scene);
}

/** 供调试/测试：当前选中的场景是否已出了细节图 */
export function isDetailed(bbox: Bbox): boolean {
  const m = bboxTo3857(bbox);
  return m[2] - m[0] > 0;
}
