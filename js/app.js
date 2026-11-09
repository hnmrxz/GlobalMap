/* GlobeMap · 交互与渲染编排 */
(function () {
  'use strict';

  var C = GM.CONFIG;
  var api = GM.api;

  /* ---------------------------------------------------------------- refs */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  var el = {
    map: $('#map'),
    panel: $('#panel'),
    list: $('#scene-list'),
    empty: $('#empty'),
    sumCount: $('#sum-count'),
    sumSub: $('#sum-sub'),
    cloudRange: $('#cloud-range'),
    cloudVal: $('#cloud-val'),
    only2a: $('#only-2a'),
    rangeSeg: $('#range-seg'),
    banner: $('#banner'),
    bannerText: $('#banner-text'),
    bannerAct: $('#banner-act'),
    bannerX: $('#banner-x'),
    toast: $('#toast'),
    modal: $('#modal'),
    modalBody: $('#modal-body'),
    modalCard: $('#modal-card'),
    boot: $('#boot'),
    bootSub: $('#boot-sub'),
    suggest: $('#suggest'),
    searchForm: $('#search-form'),
    searchInput: $('#search-input'),
    searchClear: $('#search-clear'),
    menuBasemap: $('#menu-basemap'),
    btnBasemap: $('#btn-basemap'),
    btnShare: $('#btn-share'),
    btnAbout: $('#btn-about'),
    btnPanel: $('#btn-panel'),
    btnMsearch: $('#btn-msearch'),
    btnCollapse: $('#btn-collapse'),
    btnRefresh: $('#btn-refresh'),
    hintbar: $('#hintbar'),
    grip: $('#sheet-grip'),
    mapctl: $('#mapctl'),
    foot: $('#foot-note')
  };

  var state = {
    scenes: [],
    matched: 0,
    selectedId: null,
    days: C.defaultDays,
    from: '',
    to: '',
    cloud: C.defaultCloud,
    only2a: false,
    searchBbox: null,
    lastRenderUrl: null,
    tier: 'preview',
    booted: false
  };

  /* ---------------------------------------------------------------- utils */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function debounce(fn, ms) {
    var t = null, lastArg = null;
    return function () {
      lastArg = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, lastArg); }, ms);
    };
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function isNarrow() { return window.matchMedia('(max-width: 860px)').matches; }

  /* ---------------------------------------------------------------- map */
  var map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    minZoom: C.minZoom,
    maxZoom: C.maxZoom,
    worldCopyJump: true,
    zoomSnap: 0.5,
    zoomDelta: 1,
    wheelPxPerZoomLevel: 90,
    tap: false
  });

  var baseLayer = null;
  var basemapKey = C.basemap;

  function applyBasemap(key) {
    if (baseLayer) { map.removeLayer(baseLayer); baseLayer = null; }
    basemapKey = key;
    var cfg = C.basemaps[key];
    if (key !== 'none' && cfg && cfg.url) {
      baseLayer = L.tileLayer(cfg.url, {
        maxZoom: 19,
        maxNativeZoom: cfg.maxZoom,
        attribution: cfg.attribution,
        crossOrigin: true,
        className: 'gm-base'
      });
      baseLayer.addTo(map);
    }
    document.body.setAttribute('data-basemap', key);
    $$('#menu-basemap button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-bm') === key);
    });
  }
  applyBasemap(C.basemap);

  var footprintGroup = L.layerGroup().addTo(map);
  var imageLayer = null;

  /* ---------------------------------------------------------------- boot */
  function parseHash() {
    var raw = location.hash.replace(/^#/, '');
    var out = {};
    if (!raw) return out;
    raw.split('&').forEach(function (seg) {
      var i = seg.indexOf('=');
      if (i < 0) return;
      var k = seg.slice(0, i);
      var v = decodeURIComponent(seg.slice(i + 1));
      if (k === 'map') {
        var m = /^([\d.]+)\/(-?[\d.]+)\/(-?[\d.]+)$/.exec(v);
        if (m) out.view = { z: +m[1], lat: +m[2], lng: +m[3] };
      } else {
        out[k] = v;
      }
    });
    return out;
  }

  var hash = parseHash();

  // 视图
  if (hash.view && isFinite(hash.view.lat) && isFinite(hash.view.lng)) {
    map.setView([hash.view.lat, hash.view.lng], Math.min(18, Math.max(3, hash.view.z)));
  } else {
    map.setView(C.center, C.zoom);
  }

  // 时间
  function setDays(d, keepDates) {
    state.days = d;
    var now = new Date();
    var from = new Date(now.getTime() - d * 86400000);
    state.to = api.isoDate(now);
    state.from = api.isoDate(from);
    $$('#range-seg button').forEach(function (b) {
      b.classList.toggle('is-on', +b.getAttribute('data-days') === d);
    });
  }

  if (hash.d && /^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/.test(hash.d)) {
    var dd = hash.d.split('..');
    state.from = dd[0]; state.to = dd[1];
    state.days = Math.max(1, Math.round((new Date(dd[1]) - new Date(dd[0])) / 86400000));
    $$('#range-seg button').forEach(function (b) {
      b.classList.toggle('is-on', +b.getAttribute('data-days') === state.days);
    });
  } else {
    setDays(C.defaultDays);
  }

  if (hash.c != null && hash.c !== '' && isFinite(+hash.c)) state.cloud = Math.max(0, Math.min(100, +hash.c));
  if (hash.p === '2a') state.only2a = true;
  if (hash.s) state.selectedId = hash.s;

  el.cloudRange.value = state.cloud;
  el.cloudVal.textContent = '≤ ' + state.cloud + '%';
  el.only2a.checked = state.only2a;

  /* ---------------------------------------------------------------- hash 同步 */
  function syncHash() {
    var c = map.getCenter();
    var h = '#map=' + map.getZoom() + '/' + c.lat.toFixed(5) + '/' + c.lng.toFixed(5) +
      '&d=' + state.from + '..' + state.to +
      '&c=' + state.cloud +
      '&p=' + (state.only2a ? '2a' : 'all') +
      (state.selectedId ? '&s=' + encodeURIComponent(state.selectedId) : '');
    try { history.replaceState(null, '', h); } catch (e) { /* file:// 下忽略 */ }
  }

  /* ---------------------------------------------------------------- banner */
  var bannerTimer = null;
  function showBanner(kind, text, actLabel, actFn, autoHideMs) {
    clearTimeout(bannerTimer);
    el.banner.hidden = false;
    el.banner.className = 'gm-banner is-' + kind;
    el.bannerText.textContent = text;
    if (actLabel && actFn) {
      el.bannerAct.hidden = false;
      el.bannerAct.textContent = actLabel;
      el.bannerAct.onclick = function () { hideBanner(); actFn(); };
    } else {
      el.bannerAct.hidden = true;
      el.bannerAct.onclick = null;
    }
    if (autoHideMs) bannerTimer = setTimeout(hideBanner, autoHideMs);
  }
  function hideBanner() { clearTimeout(bannerTimer); el.banner.hidden = true; }
  el.bannerX.addEventListener('click', hideBanner);

  var toastTimer = null;
  function toast(text) {
    clearTimeout(toastTimer);
    el.toast.hidden = false;
    el.toast.textContent = text;
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2200);
  }

  /* ---------------------------------------------------------------- 检索 */
  var searchAbort = null, searchToken = 0, searchTimer = null;
  var lastSearchAt = 0;

  function currentBbox() {
    var b = map.getBounds();
    var z = map.getZoom();
    var step = z >= 13 ? 0.02 : 0.01;
    return api.roundBbox([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], step);
  }

  function bboxSame(a, b) {
    if (!a || !b) return false;
    return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 &&
      Math.abs(a[2] - b[2]) < 1e-6 && Math.abs(a[3] - b[3]) < 1e-6;
  }

  function setSummary(loading) {
    if (loading) {
      el.sumCount.textContent = '…';
      el.sumSub.textContent = '正在检索影像';
      return;
    }
    el.sumCount.textContent = state.matched ? ('共 ' + state.matched + ' 景') : '0 景';
    if (!state.scenes.length) {
      el.sumSub.textContent = '云量 ≤ ' + state.cloud + '% · 近 ' + state.days + ' 天';
      return;
    }
    var newest = state.scenes[0];
    el.sumSub.textContent = '最近成像 ' + api.relTime(newest.datetime) + ' · 云量≤' + state.cloud + '%';
  }

  function runSearch(opts) {
    opts = opts || {};
    var bbox = currentBbox();
    var span = api.bboxSpan(bbox);

    if (span > C.maxBboxDeg && !opts.force) {
      el.foot.textContent = '提示：视野约 ' + span.toFixed(1) + '° 跨度，结果可能较多，放大地图可更精确';
    } else {
      el.foot.textContent = '数据：Copernicus Sentinel-2 · AWS Earth Search';
    }

    state.searchBbox = bbox;

    var token = ++searchToken;
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();
    setSummary(true);
    state.scenes = state.scenes && opts.keep ? state.scenes : state.scenes;

    api.search({
      bbox: bbox,
      from: state.from,
      to: state.to,
      cloud: state.cloud,
      only2a: state.only2a,
      signal: searchAbort.signal
    }).then(function (res) {
      if (token !== searchToken) return;
      lastSearchAt = Date.now();
      state.scenes = res.scenes;
      state.matched = res.matched;
      renderList();
      setSummary(false);
      pickSmart();
      finishBoot();
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      if (token !== searchToken) return;
      setSummary(false);
      showBanner('error', '检索失败：' + (err && err.message ? err.message : '网络不可达'), '重试', function () { runSearch({ force: true }); });
      finishBoot();
    });
  }

  /* ---------------------------------------------------------------- 选择策略 */
  function getScene(id) {
    for (var i = 0; i < state.scenes.length; i++) if (state.scenes[i].id === id) return state.scenes[i];
    return null;
  }

  /** 景与当前视口的重叠比例，用于"同一天多幅"时挑覆盖最好的一幅 */
  function overlapRatio(sceneBbox, viewBbox) {
    var inter = api.intersect(sceneBbox, viewBbox);
    if (api.isEmptyBbox(inter)) return 0;
    var a = api.bboxArea(inter), b = api.bboxArea(viewBbox) || 1;
    return a / b;
  }

  /** 按天合并：同一天多个图幅只显示一张（选覆盖视口最大的），避免列表里全是重复日期 */
  function buildGroups() {
    var view = currentBbox();
    var byDate = {};
    var order = [];
    state.scenes.forEach(function (s) {
      var t = api.fmtTime(s.datetime);
      var key = t.date;
      var g = byDate[key];
      var cov = overlapRatio(s.bbox, view);
      if (!g) {
        g = byDate[key] = { date: key, md: t.md, rep: s, cov: cov, count: 1, lowest: s, t: t };
        order.push(g);
      } else {
        g.count++;
        if (cov > g.cov) { g.rep = s; g.cov = cov; }
        if (s.cloud < g.lowest.cloud) g.lowest = s;
      }
    });
    order.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
    return order;
  }

  function pickSmart() {
    var list = state.scenes;
    if (!list.length) {
      state.selectedId = null;
      clearOverlay();
      drawFootprints();
      el.empty.hidden = false;
      return;
    }
    el.empty.hidden = true;

    // 1) 保持当前选择（若仍在结果里）
    var keep = state.selectedId ? getScene(state.selectedId) : null;
    if (keep) { state.selectedId = keep.id; renderList(); drawFootprints(); renderScene(); return; }

    // 2) 最新一天里覆盖视口最好的一幅；若都超阈值，则取云量最低的一天
    var groups = buildGroups();
    var target = groups[0].rep;
    if (groups[0].rep.cloud > state.cloud) {
      var best = groups[0];
      groups.forEach(function (g) { if (g.lowest.cloud < best.lowest.cloud) best = g; });
      target = best.rep;
      if (target.cloud > state.cloud) {
        showBanner('warn', '近期多云，已为你展示云量最低的一景（整景云量 ' + target.cloud.toFixed(1) + '%）', null, null, 6500);
      }
    }
    state.selectedId = target.id;
    renderList();
    drawFootprints();
    renderScene();
  }

  /* ---------------------------------------------------------------- 列表 */
  function renderList() {
    if (!state.scenes.length) { el.list.innerHTML = ''; return; }

    var groups = buildGroups();
    var minCloud = Infinity;
    groups.forEach(function (g) { if (g.lowest.cloud < minCloud) minCloud = g.lowest.cloud; });

    var html = groups.map(function (g, i) {
      var s = g.rep;
      var sel = s.id === state.selectedId ||
        (getScene(state.selectedId) && api.fmtTime(getScene(state.selectedId).datetime).date === g.date);
      var badges = '';
      if (i === 0) badges += '<span class="gm-badge gm-badge--new">最新</span>';
      if (g.lowest.cloud <= minCloud + 0.001 && i !== 0) badges += '<span class="gm-badge gm-badge--best">最清晰</span>';
      if (g.count > 1) badges += '<span class="gm-badge gm-badge--multi" title="当天还有 ' + (g.count - 1) + ' 幅相邻图幅">×' + g.count + '</span>';

      return '<button class="gm-item' + (sel ? ' is-sel' : '') + '" data-id="' + esc(s.id) + '" role="option" aria-selected="' + (!!sel) + '">' +
        '<span class="gm-item-thumb">' +
        (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="" loading="lazy" decoding="async">' : '<i></i>') +
        '</span>' +
        '<span class="gm-item-main">' +
        '<span class="gm-item-l1"><b>' + g.md + '</b>' +
        '<span class="gm-badge gm-badge--sat">' + api.platformLabel(s.platform) + '</span>' + badges +
        '<span class="gm-item-cloud' + (s.cloud > 40 ? ' is-bad' : '') + '">云 ' + s.cloud.toFixed(1) + '%</span></span>' +
        '<span class="gm-item-l2">' + g.t.full + ' · UTC ' + g.t.utc + '</span>' +
        '</span>' +
        '<span class="gm-item-go" aria-hidden="true"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 5 7 7-7 7" stroke-linecap="round"/></svg></span>' +
        '</button>';
    }).join('');

    el.list.innerHTML = html;
    groups.slice(0, 12).forEach(function (g) { api.warmThumb(g.rep.thumb); });
  }

  el.list.addEventListener('click', function (e) {
    var item = e.target.closest('.gm-item');
    if (!item) return;
    var id = item.getAttribute('data-id');
    // 再次点击已选中的一景 → 打开详情（含下载入口）
    if (id === state.selectedId) showDetail();
    else selectScene(id);
  });

  function selectScene(id, fly) {
    var s = getScene(id);
    if (!s) return;
    state.selectedId = id;
    state.lastRenderUrl = null;
    renderList();
    drawFootprints();
    renderScene();
    syncHash();
    if (fly) {
      var vb = currentBbox();
      var inter = api.intersect(vb, s.bbox);
      if (api.isEmptyBbox(inter)) {
        map.fitBounds(api.toLatLngBounds(s.bbox), { padding: [40, 40], maxZoom: 13 });
      }
    }
    if (isNarrow() && sheetState === 'peek') setSheet('half');
  }

  /* ---------------------------------------------------------------- 足迹 */
  function drawFootprints() {
    footprintGroup.clearLayers();
    if (!state.scenes.length) return;
    state.scenes.forEach(function (s) {
      if (!s.geometry) return;
      var sel = s.id === state.selectedId;
      var layer = L.geoJSON(s.geometry, {
        interactive: true,
        style: {
          color: sel ? '#4cc9f0' : 'rgba(230,240,255,.62)',
          weight: sel ? 2 : 1,
          opacity: sel ? 1 : 0.75,
          fill: sel ? '#4cc9f0' : '#9fc7ff',
          fillOpacity: sel ? 0.10 : 0.03,
          dashArray: sel ? null : '5 5'
        }
      });
      layer.on('click', function () { selectScene(s.id); });
      footprintGroup.addLayer(layer);
    });
  }

  /* ---------------------------------------------------------------- 渲染 */
  var renderAbort = null, renderToken = 0;
  var imgBusy = document.createElement('div');
  imgBusy.className = 'gm-imgbusy';
  imgBusy.hidden = true;
  imgBusy.innerHTML = '<span class="gm-spin"></span><span>正在渲染 10 m 影像…</span>';
  $('#app').appendChild(imgBusy);

  function setImgBusy(on, text) {
    imgBusy.hidden = !on;
    if (text) imgBusy.lastChild.textContent = text;
  }

  function clearOverlay() {
    if (imageLayer) { map.removeLayer(imageLayer); imageLayer = null; }
    state.lastRenderUrl = null;
  }

  function showOverlay(src, bounds) {
    var prev = imageLayer;
    imageLayer = L.imageOverlay(src, bounds, {
      opacity: 0,
      interactive: false,
      className: 'gm-scene-img',
      attribution: '影像 © Copernicus Sentinel-2'
    });
    imageLayer.addTo(map);
    var cur = imageLayer;
    setTimeout(function () {
      if (!cur || imageLayer !== cur) return;
      cur.setOpacity(1);
      setTimeout(function () {
        if (prev && prev !== cur && map.hasLayer(prev)) map.removeLayer(prev);
      }, 340);
    }, 20);
  }

  function loadPlan(plan, signal) {
    return api.image(plan.url, signal).catch(function (err) {
      if (plan.altUrl && (!err.signals)) return api.image(plan.altUrl, signal);
      throw err;
    });
  }

  function renderScene() {
    var scene = getScene(state.selectedId);
    if (!scene) { clearOverlay(); return; }

    var plan = api.renderPlan(scene, map.getZoom(), currentBbox());
    if (!plan) { clearOverlay(); return; }
    if (plan.url === state.lastRenderUrl) return;

    var token = ++renderToken;
    if (renderAbort) renderAbort.abort();
    renderAbort = new AbortController();

    state.lastRenderUrl = plan.url;
    state.tier = plan.tier;
    setImgBusy(true, plan.tier === 'preview' ? '正在加载整景预览…' : '正在渲染 10 m 影像…');

    loadPlan(plan, renderAbort.signal).then(function (blobUrl) {
      if (token !== renderToken) return;
      showOverlay(blobUrl, plan.bounds);
      setImgBusy(false);
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return;
      if (token !== renderToken) return;
      setImgBusy(false);
      state.lastRenderUrl = null;
      if (scene.thumb) {
        showOverlay(scene.thumb, api.toLatLngBounds(scene.bbox));
        showBanner('warn', '高清渲染超时，已切换为低清缩略图', '重试高清', function () { renderScene(); }, 8000);
      } else {
        showBanner('error', '影像加载失败：' + (err && err.message ? err.message : '网络异常'), '重试', function () { renderScene(); });
      }
    });
  }

  /* ---------------------------------------------------------------- 地图事件 */
  var moveTimer = null;
  map.on('moveend', function () {
    clearTimeout(moveTimer);
    moveTimer = setTimeout(onViewSettled, 620);
    syncHash();
  });

  map.on('zoomend', function () {
    var z = map.getZoom();
    var tier = z <= C.tierPreviewMaxZoom ? 'preview' : (z >= C.tierDetailMinZoom ? 'detail' : 'crop');
    if (tier !== state.tier && state.selectedId) {
      state.lastRenderUrl = null;
      renderScene();
    }
    syncHash();
  });

  function onViewSettled() {
    if (drawMode) return;
    var bbox = currentBbox();
    if (!state.scenes.length || !bboxSame(bbox, state.searchBbox)) {
      runSearch();
    } else if (map.getZoom() > C.tierPreviewMaxZoom) {
      state.lastRenderUrl = null;
      renderScene();
    }
    el.foot.textContent = '数据：Copernicus Sentinel-2 · AWS Earth Search';
  }

  /* ---------------------------------------------------------------- 框选 */
  var drawMode = false, drawStart = null, drawRect = null, drawLayer = null;

  function startDraw() {
    if (drawMode) { stopDraw(); return; }
    drawMode = true;
    map.dragging.disable();
    el.map.classList.add('gm-drawing');
    el.hintbar.hidden = false;
    el.hintbar.textContent = '按住并拖拽，画出你要检索的区域（Esc 取消）';
    $$('#mapctl button').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-act') === 'box'); });
    el.map.addEventListener('pointerdown', onDrawDown);
    el.map.addEventListener('pointermove', onDrawMove);
    el.map.addEventListener('pointerup', onDrawUp);
  }

  function stopDraw() {
    drawMode = false; drawStart = null;
    map.dragging.enable();
    el.map.classList.remove('gm-drawing');
    el.hintbar.hidden = true;
    $$('#mapctl button').forEach(function (b) { b.classList.remove('is-on'); });
    el.map.removeEventListener('pointerdown', onDrawDown);
    el.map.removeEventListener('pointermove', onDrawMove);
    el.map.removeEventListener('pointerup', onDrawUp);
    if (drawRect) { map.removeLayer(drawRect); drawRect = null; }
  }

  function onDrawDown(e) {
    if (e.button != null && e.button > 0) return;
    drawStart = map.mouseEventToContainerPoint(e);
    el.map.setPointerCapture && el.map.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
  function onDrawMove(e) {
    if (!drawStart) return;
    var end = map.mouseEventToContainerPoint(e);
    var b = L.bounds(drawStart, end);
    if (b.getSize().x < 4 && b.getSize().y < 4) return;
    var sw = map.containerPointToLatLng(b.min);
    var ne = map.containerPointToLatLng(b.max);
    var lb = L.latLngBounds(sw, ne);
    if (!drawRect) {
      drawRect = L.rectangle(lb, { color: '#4cc9f0', weight: 2, fill: true, fillOpacity: 0.12, dashArray: '6 4' }).addTo(map);
    } else {
      drawRect.setBounds(lb);
    }
  }
  function onDrawUp(e) {
    if (!drawStart || !drawRect) { stopDraw(); return; }
    var bounds = drawRect.getBounds();
    stopDraw();
    if (Math.abs(bounds.getEast() - bounds.getWest()) < 0.005) { return; }
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    setTimeout(function () { runSearch({ force: true }); }, 400);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (drawMode) stopDraw();
      else if (!el.modal.hidden) closeModal();
      else hideBanner();
    }
  });

  /* ---------------------------------------------------------------- 地图工具 */
  el.mapctl.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    switch (b.getAttribute('data-act')) {
      case 'zin': map.zoomIn(); break;
      case 'zout': map.zoomOut(); break;
      case 'locate': locate(); break;
      case 'box': startDraw(); break;
      case 'full': toggleFull(); break;
    }
  });

  function locate() {
    if (!navigator.geolocation) { toast('浏览器不支持定位'); return; }
    toast('正在定位…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      toast('已定位到当前位置');
    }, function () { toast('定位失败，请检查权限'); }, { timeout: 8000 });
  }

  function toggleFull() {
    var app = document.getElementById('app');
    if (!document.fullscreenElement) {
      (app.requestFullscreen || app.webkitRequestFullscreen || function () {}).call(app);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  }

  /* ---------------------------------------------------------------- 筛选器 */
  el.rangeSeg.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    setDays(+b.getAttribute('data-days'));
    syncHash();
    runSearch({ force: true });
  });

  el.cloudRange.addEventListener('input', function () {
    el.cloudVal.textContent = '≤ ' + el.cloudRange.value + '%';
  });
  el.cloudRange.addEventListener('change', function () {
    state.cloud = +el.cloudRange.value;
    syncHash();
    runSearch({ force: true });
  });

  el.only2a.addEventListener('change', function () {
    state.only2a = el.only2a.checked;
    syncHash();
    runSearch({ force: true });
  });

  el.btnRefresh.addEventListener('click', function () { runSearch({ force: true }); });

  var btnDetail = $('#btn-detail');
  if (btnDetail) btnDetail.addEventListener('click', function () {
    if (isNarrow() && sheetState === 'peek') setSheet('half');
    showDetail();
  });

  el.empty.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var fix = b.getAttribute('data-fix');
    if (fix === 'cloud') {
      state.cloud = 60;
      el.cloudRange.value = 60;
      el.cloudVal.textContent = '≤ 60%';
    } else if (fix === 'year') {
      setDays(365);
    } else if (fix === 'close') {
      map.zoomIn(2);
      return;
    }
    syncHash();
    runSearch({ force: true });
  });

  /* ---------------------------------------------------------------- 底图菜单 */
  el.btnBasemap.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = el.menuBasemap.hidden;
    el.menuBasemap.hidden = !open;
    el.btnBasemap.setAttribute('aria-expanded', String(open));
  });
  el.menuBasemap.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    applyBasemap(b.getAttribute('data-bm'));
    el.menuBasemap.hidden = true;
    el.btnBasemap.setAttribute('aria-expanded', 'false');
  });
  document.addEventListener('click', function (e) {
    if (!el.menuBasemap.hidden && !e.target.closest('.gm-menu-wrap')) {
      el.menuBasemap.hidden = true;
      el.btnBasemap.setAttribute('aria-expanded', 'false');
    }
  });

  /* ---------------------------------------------------------------- 搜索（地名/坐标） */
  var geoTimer = null, geoAbort = null;

  var COORD_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,，\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

  function suggestItem(html, data) {
    var d = document.createElement('button');
    d.className = 'gm-sug-item';
    d.type = 'button';
    d.setAttribute('role', 'option');
    d.innerHTML = html;
    d.addEventListener('click', function () {
      if (data.lat != null) {
        map.setView([data.lat, data.lon], data.zoom || 13);
      }
      el.suggest.hidden = true;
      el.searchInput.blur();
    });
    return d;
  }

  function showSuggest(nodes) {
    el.suggest.innerHTML = '';
    if (!nodes.length) { el.suggest.hidden = true; return; }
    nodes.forEach(function (n) { el.suggest.appendChild(n); });
    el.suggest.hidden = false;
  }

  function doGeocode(q) {
    if (geoAbort) geoAbort.abort();
    geoAbort = new AbortController();
    api.geocode(q, geoAbort.signal).then(function (rows) {
      var nodes = rows.map(function (r) {
        return suggestItem(
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/></svg>' +
          '<span>' + esc(r.name) + '</span>', { lat: r.lat, lon: r.lon, zoom: 13 });
      });
      if (!nodes.length) nodes = [suggestItem('<span>没有找到「' + esc(q) + '」，试试更具体的地名</span>', {})];
      showSuggest(nodes);
    }).catch(function (err) {
      if (err.name === 'AbortError') return;
      showSuggest([suggestItem('<span>地名服务暂不可用，可直接拖动地图</span>', {})]);
    });
  }

  el.searchInput.addEventListener('input', function () {
    var v = el.searchInput.value.trim();
    el.searchClear.hidden = !v;
    clearTimeout(geoTimer);
    if (v.length < 2) { el.suggest.hidden = true; return; }

    var m = COORD_RE.exec(v);
    if (m) {
      var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
      if (Math.abs(lat) <= 85 && Math.abs(lon) <= 180) {
        showSuggest([suggestItem('<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg><span>跳到坐标 <b>' + lat.toFixed(4) + ', ' + lon.toFixed(4) + '</b></span>', { lat: lat, lon: lon, zoom: 13 })]);
        return;
      }
    }
    geoTimer = setTimeout(function () { doGeocode(v); }, 480);
  });

  el.searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = el.searchInput.value.trim();
    var m = COORD_RE.exec(v);
    if (m) {
      var lat = parseFloat(m[1]), lon = parseFloat(m[2]);
      if (Math.abs(lat) <= 85 && Math.abs(lon) <= 180) { map.setView([lat, lon], 13); el.suggest.hidden = true; el.searchInput.blur(); return; }
    }
    var first = el.suggest.querySelector('.gm-sug-item');
    if (first) first.click();
  });

  el.searchClear.addEventListener('click', function () {
    el.searchInput.value = '';
    el.searchClear.hidden = true;
    el.suggest.hidden = true;
    el.searchInput.focus();
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.gm-search') && !el.suggest.hidden) el.suggest.hidden = true;
  });

  /* ---------------------------------------------------------------- 详情 / 关于 模态 */
  function openModal(html) {
    el.modalBody.innerHTML = html;
    el.modal.hidden = false;
    document.body.classList.add('gm-modal-open');
  }
  function closeModal() {
    el.modal.hidden = true;
    document.body.classList.remove('gm-modal-open');
  }
  el.modal.addEventListener('click', function (e) {
    if (e.target.hasAttribute('data-close')) closeModal();
  });

  function showDetail() {
    var s = getScene(state.selectedId);
    if (!s) { toast('还没有选中影像'); return; }
    var t = api.fmtTime(s.datetime);
    var browser = 'https://browser.dataspace.copernicus.eu/?zoom=13&lat=' +
      ((s.bbox[1] + s.bbox[3]) / 2).toFixed(4) + '&lng=' + ((s.bbox[0] + s.bbox[2]) / 2).toFixed(4) +
      '&fromTime=' + t.date + 'T00:00:00.000Z&toTime=' + t.date + 'T23:59:59.999Z&datasetId=S2_L2A_CDAS';
    var previewUrl = C.titiler + '/cog/preview?url=' + encodeURIComponent(s.preview || s.visual) + '&max_size=1400';

    openModal(
      '<div class="gm-detail">' +
      '<div class="gm-detail-hero">' +
      (s.thumb ? '<img src="' + esc(s.thumb) + '" alt="影像缩略图">' : '') +
      '<div class="gm-detail-hero-t">' + t.full + '<small>北京时间（UTC ' + t.utc + '）</small></div>' +
      '</div>' +
      '<dl class="gm-kv">' +
      '<div><dt>卫星</dt><dd>Sentinel-' + api.platformLabel(s.platform) + '</dd></div>' +
      '<div><dt>整景云量</dt><dd>' + s.cloud.toFixed(1) + '%' + (s.thick ? '（厚云 ' + s.thick.toFixed(1) + '%）' : '') + '</dd></div>' +
      '<div><dt>图幅</dt><dd>' + esc(s.tile || '—') + '</dd></div>' +
      '<div><dt>分辨率</dt><dd>10 m（真彩色）</dd></div>' +
      '<div class="gm-kv-wide"><dt>覆盖范围</dt><dd>' + s.bbox.map(function (v) { return v.toFixed(2); }).join(', ') + '</dd></div>' +
      '<div class="gm-kv-wide"><dt>影像编号</dt><dd class="gm-kv-mono">' + esc(s.id) + '</dd></div>' +
      '</dl>' +
      '<p class="gm-note">云量为整景平均，你关注的区域仍可能被云遮挡。</p>' +
      '<div class="gm-detail-acts">' +
      '<a class="gm-btn gm-btn--primary" href="' + esc(previewUrl) + '" target="_blank" rel="noopener">查看大图</a>' +
      (s.visual ? '<a class="gm-btn" href="' + esc(s.visual) + '" target="_blank" rel="noopener">原始 COG ' + (s.visualSize ? api.formatSize(s.visualSize) : '') + '</a>' : '') +
      '<a class="gm-btn" href="' + esc(browser) + '" target="_blank" rel="noopener">在 Copernicus Browser 打开</a>' +
      (s.self ? '<a class="gm-btn" href="' + esc(s.self) + '" target="_blank" rel="noopener">STAC 元数据</a>' : '') +
      '</div></div>'
    );
  }

  function showAbout() {
    openModal(
      '<div class="gm-about">' +
      '<h3>关于 GlobeMap</h3>' +
      '<p>免费、免注册地查看 <b>Sentinel-2（哨兵 2）</b> 的最新 10 米卫星影像。拖到哪里就看哪里，自动挑出云量最低的一景。</p>' +
      '<h4>数据来源</h4>' +
      '<ul>' +
      '<li>影像检索：<a href="https://earth-search.aws.element84.com/v1" target="_blank" rel="noopener">AWS Earth Search STAC</a>（Copernicus Sentinel-2 L2A）</li>' +
      '<li>影像出图：公共 <a href="https://titiler.xyz" target="_blank" rel="noopener">titiler</a> 实例，按需裁剪，无需账号</li>' +
      '<li>无云底图：<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless</a> by EOX</li>' +
      '</ul>' +
      '<h4>许可与说明</h4>' +
      '<ul>' +
      '<li>Sentinel 数据由 ESA / Copernicus 免费开放（CC BY-SA 3.0 IGO）。</li>' +
      '<li>EOX 无云镶嵌底图按 <b>CC BY-NC-SA 4.0</b> 提供，<b>仅限非商业用途</b>；商业项目请改用其他底图。</li>' +
      '<li>公共渲染实例无 SLA，若渲染失败会自动降级为低清预览。</li>' +
      '<li>「最新」受云量限制：整景无云不等于目标区域无云。</li>' +
      '</ul>' +
      '<p class="gm-note">本页不上传、不收集任何个人数据；定位仅在你的浏览器内使用。</p>' +
      '</div>'
    );
  }

  el.btnShare.addEventListener('click', function () {
    var url = location.href;
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = url; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('链接已复制'); } catch (e) { toast('请手动复制地址栏链接'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { toast('链接已复制，可分享给朋友'); }, fallback);
    } else fallback();
  });
  el.btnAbout.addEventListener('click', showAbout);

  /* 移动端：搜索按钮展开输入框 */
  el.btnMsearch.addEventListener('click', function () {
    var open = !document.body.classList.contains('is-search-open');
    document.body.classList.toggle('is-search-open', open);
    if (open) setTimeout(function () { el.searchInput.focus(); }, 60);
  });

  /* 移动端：底图选择走弹窗（顶栏菜单在窄屏被收起） */
  function showBasemapPicker() {
    var items = Object.keys(C.basemaps).map(function (k) {
      var b = C.basemaps[k];
      return '<button class="gm-bm-opt" data-bm="' + k + '"' + (k === basemapKey ? ' data-on="1"' : '') + '>' +
        '<b>' + esc(b.name) + '</b><small>' + esc(b.attribution ? b.attribution.replace(/<[^>]+>/g, '') : '不使用远程底图') + '</small></button>';
    }).join('');
    openModal('<div class="gm-about"><h3>选择底图</h3><div class="gm-bm-list">' + items + '</div></div>');
    el.modalBody.querySelectorAll('.gm-bm-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        applyBasemap(b.getAttribute('data-bm'));
        closeModal();
      });
    });
  }

  var footLinks = document.querySelector('.gm-foot-links');
  if (footLinks) {
    footLinks.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'share') el.btnShare.click();
      else if (act === 'about') showAbout();
      else if (act === 'basemap') showBasemapPicker();
    });
  }

  /* ---------------------------------------------------------------- 移动端抽屉 */
  var sheetState = 'peek';
  function sheetHeights() {
    var h = window.innerHeight;
    return { peek: 96, half: Math.round(h * 0.55), full: Math.round(h * 0.9) };
  }
  function setSheet(name) {
    if (!isNarrow()) return;
    var hs = sheetHeights();
    sheetState = name;
    el.panel.style.height = hs[name] + 'px';
    el.panel.setAttribute('data-state', name);
    el.grip.setAttribute('aria-expanded', name !== 'peek');
  }
  el.btnPanel.addEventListener('click', function () {
    setSheet(sheetState === 'peek' ? 'half' : 'peek');
  });
  el.btnCollapse.addEventListener('click', function () {
    if (isNarrow()) setSheet('peek');
    else el.panel.classList.toggle('is-hidden');
  });
  el.grip.addEventListener('click', function () {
    if (!isNarrow()) return;
    if (sheetState === 'peek') setSheet('half');
    else if (sheetState === 'half') setSheet('full');
    else setSheet('peek');
  });

  (function dragSheet() {
    var startY = 0, startH = 0, dragging = false;
    el.grip.addEventListener('pointerdown', function (e) {
      if (!isNarrow()) return;
      dragging = true;
      startY = e.clientY;
      startH = el.panel.getBoundingClientRect().height;
      el.grip.setPointerCapture(e.pointerId);
      el.panel.style.transition = 'none';
    });
    el.grip.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var hs = sheetHeights();
      var h = Math.max(64, Math.min(hs.full + 24, startH + (startY - e.clientY)));
      el.panel.style.height = h + 'px';
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      el.panel.style.transition = '';
      var hs = sheetHeights();
      var h = el.panel.getBoundingClientRect().height;
      var list = [['peek', hs.peek], ['half', hs.half], ['full', hs.full]];
      var best = list[0];
      for (var i = 1; i < list.length; i++) if (Math.abs(list[i][1] - h) < Math.abs(best[1] - h)) best = list[i];
      setSheet(best[0]);
    }
    el.grip.addEventListener('pointerup', end);
    el.grip.addEventListener('pointercancel', end);
  })();

  window.addEventListener('resize', debounce(function () {
    if (isNarrow()) setSheet(sheetState);
    else el.panel.style.height = '';
    map.invalidateSize();
  }, 180));

  /* ---------------------------------------------------------------- 启动 */
  function finishBoot() {
    if (state.booted) return;
    state.booted = true;
    setTimeout(function () {
      el.boot.classList.add('is-gone');
      setTimeout(function () { el.boot.style.display = 'none'; }, 420);
    }, 120);
  }

  if (isNarrow()) setSheet('peek');

  // 地图首次就绪后检索
  map.whenReady(function () {
    setTimeout(function () {
      runSearch();
      setTimeout(finishBoot, 6000);
    }, 60);
  });

  // 地址栏坐标默认北京；若用户分享过视口则保留
  syncHash();
})();
