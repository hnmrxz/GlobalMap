/** 装配层：把 store、地图、两个用例流与所有 UI 组件接起来。 */
import { config } from '../config';
import { pickScene } from '../domain/scene';
import type { PlatformFilter } from '../domain/types';
import { BASEMAPS } from '../services/basemap/sources';
import { createBoxDrawer } from '../ui/map/drawBox';
import { createFootprintLayer } from '../ui/map/footprintLayer';
import { createImageOverlay } from '../ui/map/imageOverlay';
import { createMap, type MapHandle } from '../ui/map/mapView';
import { mountCloudSlider } from '../ui/controls/cloudSlider';
import { mountRangeFilter, mountTimeline } from '../ui/controls/dateRail';
import { mountPlatformToggle } from '../ui/controls/platformToggle';
import { mountSearchBox } from '../ui/controls/searchBox';
import { createToast } from '../ui/common/toast';
import { openAbout } from '../ui/common/about';
import { mountDetail } from '../ui/panels/sceneDetail';
import { mountSceneList } from '../ui/panels/sceneList';
import { mountBanner } from '../ui/panels/statusBanner';
import { createSheet } from '../ui/panels/bottomSheet';
import { h } from '../ui/dom';
import { createRenderFlow } from './renderFlow';
import { createSearchFlow } from './searchFlow';
import { createInitialState } from './state';
import { createStore } from './store';
import { buildHash, parseHash } from './urlState';

function need<T extends Element = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`缺少必要节点：${selector}`);
  return el;
}

const isMobile = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

export function createApp(): { destroy(): void } {
  const app = need<HTMLElement>('#app');
  const store = createStore(createInitialState());

  // ---- 1. URL → 初始状态 ----
  const bootHash = parseHash(location.hash);
  if (bootHash.from && bootHash.to) store.set({ from: bootHash.from, to: bootHash.to });
  if (bootHash.cloud != null) store.set({ cloud: bootHash.cloud });
  if (bootHash.platform) store.set({ platform: bootHash.platform });
  if (bootHash.scene) store.set({ selectedId: bootHash.scene });

  let map: MapHandle | null = null;

  // ---- 2. 用例流（先用闭包持有 map 的访问器） ----
  const searchFlow = createSearchFlow({
    store,
    getBbox: () => (map ? map.getBbox() : null),
  });

  const renderFlow = createRenderFlow({
    store,
    getViewBbox: () => (map ? map.getBbox() : null),
    getZoom: () => (map ? map.getZoom() : config.home.z),
  });

  function syncHash(mode: 'replace' | 'push' = 'replace'): void {
    if (!map) return;
    const s = store.get();
    const c = map.getCenter();
    const next = buildHash({
      view: { z: map.getZoom(), lat: c.lat, lng: c.lng },
      from: s.from,
      to: s.to,
      cloud: s.cloud,
      platform: s.platform,
      scene: s.selectedId,
    });
    if (location.hash === next) return;
    try {
      if (mode === 'push') history.pushState(null, '', next);
      else history.replaceState(null, '', next);
    } catch {
      /* file:// 下可能受限，忽略 */
    }
  }

  // ---- 3. 地图 ----
  map = createMap({
    container: need('#map'),
    z: bootHash.z ?? config.home.z,
    lat: bootHash.lat ?? config.home.lat,
    lng: bootHash.lng ?? config.home.lng,
    basemap: store.get().basemap,
    onViewChange: () => {
      const s = store.get();
      if (map) store.set({ bbox: map.getBbox() });
      searchFlow.request(config.moveDebounce);
      renderFlow.request(config.zoomDebounce);
      syncHash('replace');
      void s;
    },
  });

  const overlay = createImageOverlay(map.map, {
    onError: () => renderFlow.notifyError(),
    onLoad: () => renderFlow.notifyLoad(),
  });

  const footprints = createFootprintLayer(map.map, (id) => selectScene(id, true));

  const drawer = createBoxDrawer(
    map.map,
    (bbox) => {
      map?.fitTo(bbox, 14);
      store.set({ drawing: false });
    },
    (on) => store.set({ drawing: on }),
  );

  // ---- 4. 组件 ----
  const banner = mountBanner(need('#mount-banner'));
  const toast = createToast(need('#mount-toast'));

  const tierTag = h('div', { class: 'gm-tiertag', hidden: true });
  need('.gm-mapwrap').appendChild(tierTag);

  const detail = mountDetail(need('#mount-detail'), {
    onClose: () => store.set({ detailOpen: false }),
  });

  const rangeFilter = mountRangeFilter(need('#mount-filters'), {
    from: store.get().from,
    to: store.get().to,
    onChange: (from, to) => {
      store.set({ from, to });
      searchFlow.request(0);
      syncHash('replace');
    },
  });

  const cloudCtl = mountCloudSlider(need('#mount-filters'), {
    value: store.get().cloud,
    onChange: (v) => {
      store.set({ cloud: v });
      searchFlow.request(120);
      syncHash('replace');
    },
  });

  const platCtl = mountPlatformToggle(need('#mount-filters'), {
    value: store.get().platform,
    onChange: (v) => {
      store.set({ platform: v });
      searchFlow.request(120);
      syncHash('replace');
    },
  });

  function bestId(): string | null {
    const s = store.get();
    const ok = s.scenes.filter((x) => x.cloudCover <= s.cloud);
    if (!ok.length) return null;
    return ok.reduce((a, b) => (b.thickCloud < a.thickCloud ? b : a)).id;
  }

  const list = mountSceneList(need('#mount-list'), {
    getScenes: () => store.get().scenes,
    getSelectedId: () => store.get().selectedId,
    getQuery: () => store.get().query,
    getBestId: () => bestId(),
    onPick: (id) => selectScene(id, true),
    onDetail: (id) => {
      store.set({ selectedId: id, detailOpen: true });
    },
    onRetry: () => void searchFlow.run(true),
  });

  const timeline = mountTimeline(need('#mount-rail'), {
    getScenes: () => store.get().scenes,
    getSelectedId: () => store.get().selectedId,
    onPick: (id) => selectScene(id, true),
  });

  const search = mountSearchBox(need('#mount-search'), {
    onPick: (t) => {
      if (t.bbox) map?.fitTo(t.bbox, 13);
      else map?.setView(13, t.lat, t.lon, true);
      toast.show(`已定位：${(t.label.split(',')[0] ?? t.label).slice(0, 24)}`);
      if (isMobile()) store.set({ sheet: 'peek' });
    },
  });

  const sheet = createSheet({
    app,
    handle: need('#sheet-grab'),
    getState: () => store.get().sheet,
    onChange: (s) => store.set({ sheet: s }),
  });

  // 底图切换
  const selBase = need<HTMLSelectElement>('#sel-base');
  selBase.replaceChildren(...BASEMAPS.map((b) => h('option', { value: b.id, text: b.label })));
  selBase.value = store.get().basemap;
  selBase.addEventListener('change', () => {
    map?.setBasemap(selBase.value);
    store.set({ basemap: selBase.value });
  });

  // ---- 5. 交互动作 ----
  function selectScene(id: string, push = true, fit = false): void {
    const scene = store.get().scenes.find((s) => s.id === id);
    if (!scene) return;
    store.set({ selectedId: id });
    if (fit) footprints.fit(scene);
    if (isMobile() && store.get().sheet === 'full') sheet.set('half');
    syncHash(push ? 'push' : 'replace');
  }

  const drawBtn = need('#btn-draw');
  drawBtn.addEventListener('click', () => drawer.toggle());

  need('#btn-reset').addEventListener('click', () => {
    const s = store.get();
    const picked = pickScene(s.scenes, s.cloud);
    if (!picked.scene) {
      toast.show('当前没有可显示的影像，先放大地图或放宽云量', 'warn');
      return;
    }
    selectScene(picked.scene.id, true, true);
  });

  need('#btn-locate').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast.show('当前浏览器不支持定位', 'warn');
      return;
    }
    toast.show('正在定位…');
    navigator.geolocation.getCurrentPosition(
      (pos) => map?.setView(12, pos.coords.latitude, pos.coords.longitude, true),
      () => toast.show('定位失败，可直接搜索地名', 'warn'),
      { timeout: 8000, maximumAge: 600000, enableHighAccuracy: false },
    );
  });

  need('#btn-share').addEventListener('click', async () => {
    syncHash('replace');
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'GlobeMap · Sentinel-2 影像', url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.show('链接已复制');
      }
    } catch {
      toast.show('复制失败，请从地址栏复制', 'warn');
    }
  });

  need('#btn-about').addEventListener('click', () => openAbout(need('#mount-modal')));

  // ---- 6. 渲染订阅 ----
  let lastSrc: string | null = null;
  let lastSelected: string | null = null;
  let lastCloud = store.get().cloud;
  let lastPlatform = store.get().platform as PlatformFilter;
  let lastFrom = store.get().from;
  let lastTo = store.get().to;

  const unsubscribe = store.subscribe((s) => {
    if (s.render.src !== lastSrc) {
      lastSrc = s.render.src;
      overlay.setImage(s.render.src, s.render.bounds);
    }

    list.update();
    timeline.update();
    banner.update(s.banner);
    footprints.update(s.scenes, s.selectedId);
    detail.update(s.detailOpen ? s.scenes.find((x) => x.id === s.selectedId) ?? null : null);

    const note = s.render.status === 'degraded' ? s.render.note || '当前为低清预览' : s.render.note;
    tierTag.hidden = !note;
    if (note) tierTag.textContent = note;

    // 选中场景变化（含首次检索自动选中）是出图的唯一触发点
    if (s.selectedId !== lastSelected) {
      lastSelected = s.selectedId;
      if (s.selectedId) {
        renderFlow.request(20);
        syncHash('replace');
      } else {
        void renderFlow.run();
      }
    }

    drawBtn.classList.toggle('is-on', s.drawing);

    if (s.cloud !== lastCloud) {
      lastCloud = s.cloud;
      cloudCtl.set(s.cloud);
    }
    if (s.platform !== lastPlatform) {
      lastPlatform = s.platform;
      platCtl.set(s.platform);
    }
    if (s.from !== lastFrom || s.to !== lastTo) {
      lastFrom = s.from;
      lastTo = s.to;
      rangeFilter.set(s.from, s.to);
    }
  });

  // ---- 7. 前进/后退 ----
  window.addEventListener('popstate', () => {
    const h2 = parseHash(location.hash);
    if (h2.from && h2.to) store.set({ from: h2.from, to: h2.to });
    if (h2.cloud != null) store.set({ cloud: h2.cloud });
    if (h2.platform) store.set({ platform: h2.platform });
    if (h2.scene) store.set({ selectedId: h2.scene });
    if (h2.z != null && h2.lat != null && h2.lng != null) map?.setView(h2.z, h2.lat, h2.lng);
    searchFlow.request(60);
  });

  // ---- 8. 首次检索（等地图尺寸稳定） ----
  requestAnimationFrame(() => {
    map?.invalidate();
    store.set({ bbox: map?.getBbox() ?? null });
    searchFlow.request(0);
    syncHash('replace');
  });

  return {
    destroy() {
      unsubscribe();
      searchFlow.cancel();
      renderFlow.cancel();
      drawer.destroy();
      footprints.destroy();
      overlay.destroy();
      map?.destroy();
    },
  };
}
