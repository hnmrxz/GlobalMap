/**
 * 单图覆盖层：一次交互只显示一张「视口裁剪图」。
 * 换图时先加新层、加载完成再移除旧层，避免闪白；加载失败回调给上层走降级链。
 */
import L from 'leaflet';

export type Bounds = [[number, number], [number, number]];

export interface OverlayHandle {
  setImage(src: string | null, bounds: Bounds | null): void;
  clear(): void;
  destroy(): void;
}

export function createImageOverlay(
  map: L.Map,
  opts: { onError?: () => void; onLoad?: () => void } = {},
): OverlayHandle {
  let current: L.ImageOverlay | null = null;
  let pending: L.ImageOverlay | null = null;

  function drop(layer: L.ImageOverlay | null): void {
    if (layer && map.hasLayer(layer)) map.removeLayer(layer);
  }

  return {
    setImage(src, bounds) {
      if (!src || !bounds) {
        drop(pending);
        drop(current);
        pending = null;
        current = null;
        return;
      }
      drop(pending);
      pending = null;

      const next = L.imageOverlay(src, bounds, {
        opacity: 0,
        className: 'gm-scene-img',
        interactive: false,
        crossOrigin: false,
      });

      next.on('load', () => {
        if (pending !== next) return;
        next.setOpacity(1);
        drop(current);
        current = next;
        pending = null;
        opts.onLoad?.();
      });

      next.on('error', () => {
        if (pending !== next) return;
        drop(next);
        pending = null;
        opts.onError?.();
      });

      pending = next;
      next.addTo(map);
    },
    clear() {
      drop(pending);
      drop(current);
      pending = null;
      current = null;
    },
    destroy() {
      drop(pending);
      drop(current);
      pending = null;
      current = null;
    },
  };
}
