/** 场景足迹图层：GeoJSON 多边形 + 选中/悬停态。 */
import L from 'leaflet';
import type { Scene } from '../../domain/types';

export interface FootprintHandle {
  update(scenes: Scene[], selectedId: string | null): void;
  fit(scene: Scene): void;
  clear(): void;
  destroy(): void;
}

export function createFootprintLayer(map: L.Map, onPick: (id: string) => void): FootprintHandle {
  const group = L.layerGroup().addTo(map);
  let current: L.GeoJSON | null = null;
  let lastIds = '';
  let lastSelected: string | null = null;
  const MAX_FOOTPRINTS = 24;

  /** 上百个重叠足迹会糊成一片：只画最新的一批，但保证选中的那一景始终可见 */
  function limit(scenes: Scene[], selectedId: string | null): Scene[] {
    if (scenes.length <= MAX_FOOTPRINTS) return scenes;
    const head = scenes.slice(0, MAX_FOOTPRINTS);
    const sel = scenes.find((s) => s.id === selectedId);
    if (!sel || head.some((s) => s.id === sel.id)) return head;
    return [...head, sel];
  }

  function styleFor(selected: boolean): L.PathOptions {
    // 只给选中景填色：几十个半透明多边形叠加会把整幅影像染成蓝色
    return {
      color: selected ? '#38bdf8' : '#67c7f5',
      weight: selected ? 2.2 : 1,
      opacity: selected ? 1 : 0.26,
      fill: selected,
      fillColor: '#38bdf8',
      fillOpacity: selected ? 0.08 : 0,
      dashArray: selected ? undefined : '3 5',
    };
  }

  function build(scenes: Scene[], selectedId: string | null): void {
    if (current) {
      group.removeLayer(current);
      current = null;
    }
    const features: GeoJSON.Feature[] = [];
    for (const s of scenes) {
      if (!s.footprint) continue;
      features.push({ type: 'Feature', properties: { id: s.id }, geometry: s.footprint });
    }
    if (!features.length) return;

    current = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      style: (f) => styleFor((f?.properties as { id?: string } | null)?.id === selectedId),
      onEachFeature: (feature, layer) => {
        const id = (feature.properties as { id?: string } | null)?.id;
        if (!id) return;
        layer.on('click', () => onPick(id));
        layer.on('mouseover', () => {
          if (id === selectedId) return;
          (layer as L.Path).setStyle({ weight: 2, opacity: 0.9, fill: true, fillOpacity: 0.05 });
        });
        layer.on('mouseout', () => {
          if (id === selectedId) return;
          (layer as L.Path).setStyle(styleFor(false));
        });
      },
    });
    current.addTo(group);
  }

  return {
    update(scenes, selectedId) {
      const visible = limit(scenes, selectedId);
      const ids = visible.map((s) => s.id).join('|');
      const structuralChange = ids !== lastIds;
      if (structuralChange) {
        build(visible, selectedId);
        lastIds = ids;
        lastSelected = selectedId;
        return;
      }
      if (selectedId !== lastSelected && current) {
        current.setStyle((f) => styleFor((f?.properties as { id?: string } | null)?.id === selectedId));
        lastSelected = selectedId;
      }
    },
    fit(scene) {
      const b = scene.bbox;
      map.fitBounds(L.latLngBounds([b[1], b[0]], [b[3], b[2]]), { maxZoom: 13, animate: true, padding: [30, 30] });
    },
    clear() {
      group.clearLayers();
      current = null;
      lastIds = '';
      lastSelected = null;
    },
    destroy() {
      group.remove();
    },
  };
}
