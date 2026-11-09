/* GlobeMap · 全局配置（唯一集中出口，改这里即可换数据源） */
(function (GM) {
  'use strict';

  GM.CONFIG = {
    /* ---- 数据源（全部免费、零 API Key） ---- */
    stacBase: 'https://earth-search.aws.element84.com/v1',
    collection: 'sentinel-2-c1-l2a',   // COG 格式，2015-06 至今
    titiler: 'https://titiler.xyz',    // 公共渲染服务（演示实例，可换自建实例）
    geocoder: 'https://nominatim.openstreetmap.org',

    /* ---- 默认视图：北京 ---- */
    center: [39.9042, 116.4074],
    zoom: 11,
    minZoom: 3,
    maxZoom: 18,

    /* ---- 检索默认值 ---- */
    defaultDays: 90,
    defaultCloud: 20,
    limit: 100,
    maxBboxDeg: 3.0,        // 视口经纬跨度上限，超出时提示放大
    searchTimeout: 12000,
    renderTimeout: 20000,

    /* ---- 渲染分级（缩放 → 出图策略） ---- */
    tierPreviewMaxZoom: 9,  // z <= 9  ：整景预览（缩略快照）
    tierDetailMinZoom: 15,  // z >= 15 ：2048px 细节裁剪
    previewSize: 1024,
    cropSize: 1024,
    detailSize: 2048,

    /* ---- 底图 ---- */
    basemap: 'eox',
    basemaps: {
      eox: {
        name: 'Sentinel-2 无云镶嵌 2025',
        url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg',
        maxZoom: 16,
        attribution: '底图 <a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX (CC BY-NC-SA 4.0)'
      },
      carto: {
        name: '浅色底图',
        url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
      },
      osm: {
        name: 'OpenStreetMap',
        url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
      },
      none: { name: '无底图', url: '', maxZoom: 19, attribution: '' }
    },

    /* ---- 缓存 ---- */
    imageCacheSize: 32,
    queryCacheTTL: 10 * 60 * 1000
  };
})(window.GM = window.GM || {});
