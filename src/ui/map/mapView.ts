/** 地图封装：只管 Leaflet 生命周期与视图事件，不发任何网络请求。 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { boundsToBbox, bboxTo3857 } from '../../domain/bbox';
import type { Bbox, MercBbox } from '../../domain/types';
import { getBase } from '../../services/basemap/sources';

export interface MapInit {
  container: HTMLElement;
  z: number;
  lat: number;
  lng: number;
  basemap: string;
  onViewChange: () => void;
}

export interface MapHandle {
  map: L.Map;
  setBasemap(id: string): void;
  getBbox(): Bbox;
  getMerc(): MercBbox;
  getZoom(): number;
  getCenter(): { lat: number; lng: number };
  setView(z: number, lat: number, lng: number, animate?: boolean): void;
  fitTo(bbox: Bbox, maxZoom?: number): void;
  invalidate(): void;
  getContainer(): HTMLElement;
  destroy(): void;
}

export function createMap(init: MapInit): MapHandle {
  const map = L.map(init.container, {
    center: [init.lat, init.lng],
    zoom: init.z,
    minZoom: 3,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: true,
    worldCopyJump: true,
    preferCanvas: true,
    zoomAnimation: true,
    fadeAnimation: false,
  });

  map.attributionControl.setPrefix(false);

  let layer: L.TileLayer | null = null;

  function setBasemap(id: string): void {
    const src = getBase(id);
    if (layer) {
      map.removeLayer(layer);
      layer = null;
    }
    if (!src.url) return;
    layer = L.tileLayer(src.url, {
      attribution: src.attribution,
      maxZoom: src.maxZoom,
      maxNativeZoom: src.maxNativeZoom,
      crossOrigin: false,
      keepBuffer: 2,
      updateWhenIdle: false,
      detectRetina: false,
    });
    layer.addTo(map);
  }

  setBasemap(init.basemap);

  map.on('moveend zoomend', () => init.onViewChange());

  const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }));
  ro.observe(init.container);
  setTimeout(() => map.invalidateSize({ animate: false }), 60);

  return {
    map,
    setBasemap,
    getBbox(): Bbox {
      const b = map.getBounds();
      return boundsToBbox({ lat: b.getSouthWest().lat, lng: b.getSouthWest().lng }, { lat: b.getNorthEast().lat, lng: b.getNorthEast().lng });
    },
    getMerc(): MercBbox {
      return bboxTo3857(this.getBbox());
    },
    getZoom(): number {
      return map.getZoom();
    },
    getCenter(): { lat: number; lng: number } {
      const c = map.getCenter();
      return { lat: c.lat, lng: c.lng };
    },
    setView(z: number, lat: number, lng: number, animate = false): void {
      map.setView([lat, lng], z, { animate });
    },
    fitTo(bbox: Bbox, maxZoom = 14): void {
      const bounds = L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]);
      map.fitBounds(bounds, { maxZoom, animate: true, padding: [24, 24] });
    },
    invalidate(): void {
      map.invalidateSize({ animate: false });
    },
    getContainer(): HTMLElement {
      return map.getContainer();
    },
    destroy(): void {
      ro.disconnect();
      map.remove();
    },
  };
}
