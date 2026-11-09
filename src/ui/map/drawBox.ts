/** 矩形框选：自实现 pointer 拖拽，不引入 Leaflet.draw（省 ~30 KB）。 */
import L from 'leaflet';
import { clampBbox } from '../../domain/bbox';
import type { Bbox } from '../../domain/types';

export interface BoxDrawer {
  enable(): void;
  disable(): void;
  toggle(): void;
  isEnabled(): boolean;
  destroy(): void;
}

export function createBoxDrawer(
  map: L.Map,
  onDone: (bbox: Bbox) => void,
  onState?: (enabled: boolean) => void,
): BoxDrawer {
  const container = map.getContainer();
  let enabled = false;
  let drawing = false;
  let start: L.LatLng | null = null;
  let startPoint: { x: number; y: number } | null = null;
  let rect: L.Rectangle | null = null;

  const rectStyle: L.PathOptions = {
    color: '#38bdf8',
    weight: 2,
    dashArray: '6 4',
    fillColor: '#38bdf8',
    fillOpacity: 0.12,
  };

  function toLatLng(e: PointerEvent): L.LatLng {
    return map.mouseEventToLatLng(e);
  }

  function cleanup(): void {
    drawing = false;
    start = null;
    startPoint = null;
    if (rect) {
      map.removeLayer(rect);
      rect = null;
    }
    map.dragging.enable();
    map.doubleClickZoom.enable();
    container.style.cursor = '';
  }

  function onDown(e: PointerEvent): void {
    if (!enabled || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drawing = true;
    start = toLatLng(e);
    startPoint = { x: e.clientX, y: e.clientY };
    map.dragging.disable();
    map.doubleClickZoom.disable();
    container.setPointerCapture(e.pointerId);
    rect = L.rectangle(L.latLngBounds(start, start), rectStyle).addTo(map);
  }

  function onMove(e: PointerEvent): void {
    if (!drawing || !start || !rect) return;
    e.preventDefault();
    const cur = toLatLng(e);
    rect.setBounds(L.latLngBounds(start, cur));
  }

  function onUp(e: PointerEvent): void {
    if (!drawing) return;
    const startPt = startPoint;
    const startLL = start;
    e.preventDefault();
    try {
      container.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const moved = startPt ? Math.hypot(e.clientX - startPt.x, e.clientY - startPt.y) : 0;
    const cur = toLatLng(e);
    cleanup();
    if (!startLL || moved < 12) return; // 视为误触，不改变检索范围
    const bbox = clampBbox([
      Math.min(startLL.lng, cur.lng),
      Math.min(startLL.lat, cur.lat),
      Math.max(startLL.lng, cur.lng),
      Math.max(startLL.lat, cur.lat),
    ]);
    onDone(bbox);
    disable();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && enabled) {
      cleanup();
      disable();
    }
  }

  function enable(): void {
    if (enabled) return;
    enabled = true;
    container.style.cursor = 'crosshair';
    container.addEventListener('pointerdown', onDown, true);
    container.addEventListener('pointermove', onMove, true);
    container.addEventListener('pointerup', onUp, true);
    container.addEventListener('pointercancel', cleanup, true);
    window.addEventListener('keydown', onKey);
    onState?.(true);
  }

  function disable(): void {
    if (!enabled) return;
    enabled = false;
    cleanup();
    container.removeEventListener('pointerdown', onDown, true);
    container.removeEventListener('pointermove', onMove, true);
    container.removeEventListener('pointerup', onUp, true);
    container.removeEventListener('pointercancel', cleanup, true);
    window.removeEventListener('keydown', onKey);
    onState?.(false);
  }

  return {
    enable,
    disable,
    toggle() {
      if (enabled) disable();
      else enable();
    },
    isEnabled: () => enabled,
    destroy() {
      cleanup();
      disable();
    },
  };
}
