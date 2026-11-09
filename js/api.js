/* GlobeMap · 数据与渲染适配层
 * 这里集中所有第三方 URL 与网络访问：UI 不得自己拼 URL。
 * 无 key、无后端：STAC 检索 + 公共 titiler 出图 + STAC 缩略图。
 */
(function (GM) {
  'use strict';

  var C = GM.CONFIG;
  var api = {};

  /* ============================ 工具 ============================ */

  function enc(u) { return encodeURIComponent(u || ''); }

  /** 四舍五入到 step（默认 0.01°），用于稳定缓存键与避免抖动重查 */
  api.roundBbox = function (b, step) {
    step = step == null ? 0.01 : step;
    return b.map(function (v) { return Math.round(v / step) * step; });
  };

  /** 交给 STAC 的 bbox：裁剪到合法经纬度 + 保留 5 位小数 */
  api.cleanBbox = function (b) {
    return [
      Math.max(-180, Math.min(180, b[0])),
      Math.max(-85, Math.min(85, b[1])),
      Math.max(-180, Math.min(180, b[2])),
      Math.max(-85, Math.min(85, b[3]))
    ].map(function (v) { return +v.toFixed(5); });
  };

  api.bboxArea = function (b) {
    return Math.abs((b[2] - b[0]) * (b[3] - b[1]));
  };

  api.bboxSpan = function (b) {
    return Math.max(Math.abs(b[2] - b[0]), Math.abs(b[3] - b[1]));
  };

  api.intersect = function (a, b) {
    return [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  };

  api.isEmptyBbox = function (b) {
    return !b || b[2] <= b[0] || b[3] <= b[1];
  };

  /** [w,s,e,n] → Leaflet bounds [[s,w],[n,e]] */
  api.toLatLngBounds = function (b) {
    return [[b[1], b[0]], [b[3], b[2]]];
  };

  /* ============================ HTTP ============================ */

  function withTimeout(signal, ms) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(new DOMException('timeout', 'TimeoutError')); }, ms);
    if (signal) {
      if (signal.aborted) ctrl.abort();
      else signal.addEventListener('abort', function () { ctrl.abort(); }, { once: true });
    }
    return {
      signal: ctrl.signal,
      clear: function () { clearTimeout(timer); }
    };
  }

  api.fetchJSON = function (url, opts) {
    opts = opts || {};
    var t = withTimeout(opts.signal, opts.timeout || C.searchTimeout);
    return fetch(url, { signal: t.signal, mode: 'cors', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status);
          err.status = res.status;
          throw err;
        }
        return res.json();
      })
      .finally(t.clear);
  };

  /* ============================ STAC 检索 ============================ */

  function normalize(item) {
    if (!item || !item.id || !item.properties) return null;
    var p = item.properties;
    var a = item.assets || {};
    var thumb = a.thumbnail || a.overview || null;
    var preview = a.preview || a.overview || null;
    var visual = a.visual || a.tci || null;
    if (!visual && a.red && a.green && a.blue) visual = a.red; // 极少见：无 TCI 时用红波段兜底

    var bbox = item.bbox && item.bbox.length >= 4 ? [item.bbox[0], item.bbox[1], item.bbox[2], item.bbox[3]] : null;
    if (!bbox && item.geometry && item.geometry.coordinates) {
      var xs = [], ys = [];
      (function walk(c) {
        if (typeof c[0] === 'number') { xs.push(c[0]); ys.push(c[1]); }
        else c.forEach(walk);
      })(item.geometry.coordinates);
      if (xs.length) bbox = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
    }
    if (!bbox) return null;

    var cloud = typeof p['eo:cloud_cover'] === 'number' ? p['eo:cloud_cover'] : 0;
    var thick = (p['s2:high_proba_clouds_percentage'] || 0) + (p['s2:medium_proba_clouds_percentage'] || 0);
    var self = null;
    (item.links || []).forEach(function (l) { if (!self && l.rel === 'self') self = l.href; });

    // MGRS 图幅号：item.id 形如 S2B_T50TMK_20261102T030954_L2A
    var tileMatch = /_(T\d{2}[A-Z]{3})_/.exec(item.id);

    return {
      id: item.id,
      datetime: p.datetime,
      platform: p.platform || '',
      cloud: cloud,
      thick: thick,
      cirrus: p['s2:thin_cirrus_percentage'] || 0,
      bbox: bbox,
      geometry: item.geometry || null,
      thumb: thumb ? thumb.href : null,
      preview: preview ? preview.href : null,
      visual: visual ? visual.href : null,
      visualSize: visual && visual['file:size'] ? visual['file:size'] : null,
      self: self,
      tile: tileMatch ? tileMatch[1] : (p['grid:code'] || '')
    };
  }

  api.normalize = normalize;

  /**
   * 检索影像
   * @param {{bbox:number[], from:string, to:string, cloud:number, only2a:boolean, signal:AbortSignal}} o
   */
  api.search = function (o) {
    var bbox = api.cleanBbox(o.bbox);
    var q = { 'eo:cloud_cover': { lt: o.cloud } };
    if (o.only2a) q.platform = { eq: 'sentinel-2a' };

    var params = new URLSearchParams();
    params.set('bbox', bbox.join(','));
    params.set('datetime', o.from + 'T00:00:00Z/' + o.to + 'T23:59:59Z');
    params.set('limit', String(C.limit));
    params.set('query', JSON.stringify(q));
    var url = C.stacBase + '/collections/' + C.collection + '/items?' + params.toString();

    return api.fetchJSON(url, { signal: o.signal, timeout: C.searchTimeout }).then(function (res) {
      var scenes = (res.features || []).map(normalize).filter(Boolean);
      // 服务端 sortby 不可用（No mapping found for [datetime]），必须客户端排序
      scenes.sort(function (x, y) {
        var d = new Date(y.datetime) - new Date(x.datetime);
        return d !== 0 ? d : (x.thick - y.thick);
      });
      var matched = (res.context && res.context.matched != null) ? res.context.matched : scenes.length;
      return { scenes: scenes, matched: matched, url: url };
    });
  };

  /* ============================ 渲染计划 ============================ */

  /**
   * 根据缩放级别决定一次交互 = 一次出图
   * preview : z<=12  整景 320m 预览（快）
   * crop    : z13-14 视口 10m 裁剪 1024
   * detail  : z>=15  视口 10m 裁剪 2048
   */
  api.renderPlan = function (scene, zoom, viewBbox) {
    var tier = zoom <= C.tierPreviewMaxZoom ? 'preview' : (zoom >= C.tierDetailMinZoom ? 'detail' : 'crop');
    var base = C.titiler;

    if (tier === 'preview' || !scene.visual || !viewBbox) {
      var src = scene.preview || scene.visual;
      if (!src) return null;
      return {
        tier: 'preview',
        url: base + '/cog/preview?url=' + enc(src) + '&max_size=' + C.previewSize + '&dst_crs=EPSG:3857',
        altUrl: base + '/cog/preview?url=' + enc(src) + '&max_size=' + C.previewSize,
        bounds: api.toLatLngBounds(scene.bbox)
      };
    }

    var b = api.intersect(api.cleanBbox(viewBbox), scene.bbox);
    if (api.isEmptyBbox(b)) {
      // 视口已不在该景范围内 → 退回整景预览
      return api.renderPlan(scene, C.tierPreviewMaxZoom, null);
    }
    b = b.map(function (v) { return +v.toFixed(5); });
    var size = tier === 'detail' ? C.detailSize : C.cropSize;
    return {
      tier: tier,
      url: base + '/cog/bbox/' + b.join(',') + '.jpg?url=' + enc(scene.visual) +
        '&bidx=1&bidx=2&bidx=3&dst_crs=EPSG:3857&max_size=' + size,
      bounds: api.toLatLngBounds(b)
    };
  };

  /* ============================ 图片加载（含 LRU） ============================ */

  var imgCache = new Map();   // url -> blob url
  var imgInflight = new Map(); // url -> Promise

  api.image = function (url, signal) {
    if (imgCache.has(url)) {
      var hit = imgCache.get(url);
      imgCache.delete(url); imgCache.set(url, hit); // LRU touch
      return Promise.resolve(hit);
    }
    if (imgInflight.has(url)) return imgInflight.get(url);

    var t = withTimeout(signal, C.renderTimeout);
    var p = fetch(url, { signal: t.signal, mode: 'cors', credentials: 'omit' })
      .then(function (res) {
        if (!res.ok) {
          var e = new Error('HTTP ' + res.status); e.status = res.status; throw e;
        }
        var ct = res.headers.get('content-type') || '';
        if (ct.indexOf('image') !== 0) throw new Error('返回的不是图片');
        return res.blob();
      })
      .then(function (blob) {
        var obj = URL.createObjectURL(blob);
        imgCache.set(url, obj);
        while (imgCache.size > C.imageCacheSize) {
          var k = imgCache.keys().next().value;
          URL.revokeObjectURL(imgCache.get(k));
          imgCache.delete(k);
        }
        return obj;
      })
      .finally(function () {
        t.clear();
        imgInflight.delete(url);
      });

    imgInflight.set(url, p);
    return p;
  };

  api.warmThumb = function (url) {
    if (!url) return;
    var img = new Image();
    img.decoding = 'async';
    img.src = url;
  };

  /* ============================ 地理编码 ============================ */

  api.geocode = function (q, signal) {
    var url = C.geocoder + '/search?format=jsonv2&limit=6&accept-language=zh-CN,zh&q=' + enc(q);
    return api.fetchJSON(url, { signal: signal, timeout: 9000 }).then(function (rows) {
      return (rows || []).map(function (r) {
        return {
          name: r.display_name,
          short: (r.name || r.display_name || '').split(',')[0],
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          type: r.type
        };
      }).filter(function (r) { return isFinite(r.lat) && isFinite(r.lon); });
    });
  };

  /* ============================ 时间格式 ============================ */

  var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

  api.isoDate = function (d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  /** UTC ISO → 北京时间展示 */
  api.fmtTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    var bj = new Date(d.getTime() + 8 * 3600 * 1000);
    return {
      date: api.isoDate(bj),
      md: pad(bj.getMonth() + 1) + '-' + pad(bj.getDate()),
      hm: pad(bj.getHours()) + ':' + pad(bj.getMinutes()),
      utc: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()),
      full: api.isoDate(bj) + ' ' + pad(bj.getHours()) + ':' + pad(bj.getMinutes()),
      ts: d.getTime()
    };
  };

  api.relTime = function (iso) {
    var t = new Date(iso).getTime();
    if (!isFinite(t)) return '';
    var diff = Date.now() - t;
    var m = Math.round(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.round(m / 60);
    if (h < 24) return h + ' 小时前';
    var d = Math.round(h / 24);
    if (d < 30) return d + ' 天前';
    return Math.round(d / 30) + ' 个月前';
  };

  api.platformLabel = function (p) {
    if (!p) return 'S2';
    var m = /sentinel-2([abc])/i.exec(p);
    return m ? '2' + m[1].toUpperCase() : 'S2';
  };

  api.formatSize = function (bytes) {
    if (!bytes) return '';
    if (bytes > 1024 * 1024 * 1024) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes > 1024 * 1024) return Math.round(bytes / 1048576) + ' MB';
    return Math.round(bytes / 1024) + ' KB';
  };

  GM.api = api;
})(window.GM = window.GM || {});
