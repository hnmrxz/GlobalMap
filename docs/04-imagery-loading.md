# 04 · 检索与影像加载方案

本文件是整个方案的技术核心：**坐标系、查询协议、渲染分级、缓存与降级**。所有 URL 与参数均已在 2026-11-06 实测可用。

---

## 4.1 坐标系与投影

| 环节 | 坐标参考 | 说明 |
|---|---|---|
| 地图显示 | **EPSG:3857**（Web Mercator） | Leaflet `CRS.EPSG3857`，缩放 3–18 |
| **请求 bbox** | **EPSG:4326**（经纬度，`minLon,minLat,maxLon,maxLat`） | STAC 规范要求 4326；Leaflet `map.getBounds()` 是 3857 米，必须 `L.CRS.EPSG3857.unproject()` 或 `boundsToLngLatArray()` 转换 |
| 原始影像 | **EPSG:326xx**（UTM，按 MGRS 带） | 单景 `proj:epsg=32650`（北京）；客户端**不与之直接打交道**，全部交给 titiler |
| 出图 | 请求 `dst_crs=EPSG:3857`，输出为墨卡托等距像元 | ⚠️ 关键：若按 4326 bbox 出图再贴到 3857 地图上，纬度方向会产生非线性拉伸（整景高度可达 1 % 级偏差）。**统一以 3857 米制 bbox 请求、以 3857 米制 bounds 放置** → Leaflet 的 `imageOverlay` 在图层像素空间内是线性拉伸，正好与墨卡托线性一致，配准正确。 |
| 时间 | **UTC 存储，北京时间显示** | `datetime` 一律 `…Z`；UI 显示 `北京时间 (UTC …)` |

**bbox 处理规则（`domain/bbox.ts`）**

1. 视口 bbox 换算成 4326 后**按 0.01° 取整**（作为缓存键，避免 1 像素抖动击穿缓存）。
2. 面积上限 `VITE_MAX_BBOX_DEG`（默认 1.5°×1.5°）。超限：不检索，提示"范围过大，请放大"，并给出"用整景预览代替"的按钮（切到 `m=footprint` 模式）。
3. 跨 180° 经线/极区：直接裁剪到 `[-180,-85,180,85]`，不做跨国界拼接（本项目不服务极区）。

---

## 4.2 检索（STAC）

### 请求构造

```
GET {STAC_BASE}/collections/{collection}/items
    ?bbox={minLon},{minLat},{maxLon},{maxLat}
    &datetime={fromISO}Z/{toISO}Z
    &limit={SEARCH_LIMIT}                 # 100
    &query={"eo:cloud_cover":{"lt":20}}   # 云量上限
    # 勾选"仅 2A"时，query 合并为：
    # {"eo:cloud_cover":{"lt":20},"platform":{"eq":"sentinel-2a"}}
```

**实测事实与约束**

- `context.matched` 会返回总数（实测 32），可用于"共 N 景"文案；`limit` 上限 100，超出需翻页 `links[rel=next]`（首版只取第一页，够用且有 `+N` 提示）。
- **`sortby` 不可用**：实测 `?sortby=-datetime` 返回 `No mapping found for [datetime] in order to sort on`。→ **必须在客户端排序**（`datetime` 降序），不要反复试错。
- `datetime` 区间格式：`2026-08-08T00:00:00Z/2026-11-06T23:59:59Z`（闭区间）。
- 集合选择：`sentinel-2-c1-l2a`（COG，覆盖 2015→今，实测 2019/2023/2024/2025 均有数据）。`sentinel-2-pre-c1-l2a` 与旧 `sentinel-2-l2a` 资产是 **JP2**（非 COG），titiler 无法高效读取 → **不接入**，若某日 c1 缺数据则按"无影像"处理并提示。

### 归一化 `STAC Item → Scene`

```ts
type Scene = {
  id: string;                 // S2B_T50TMK_20261102T030954_L2A
  datetime: string;           // ISO UTC
  platform: 'sentinel-2a' | 'sentinel-2b' | 'sentinel-2c';
  cloudCover: number;         // eo:cloud_cover (%)
  thickCloud: number;         // s2:high_proba + s2:medium_proba（更贴近"能不能看见地面"）
  bbox: [number, number, number, number];      // 4326
  footprint: GeoJSON.Polygon;                  // geometry
  assets: {
    visual?: string;          // TCI.tif  (10 m RGB uint8)
    preview?: string;         // L2A_PVI.tif (320 m)
    thumbnail?: string;       // L2A_PVI.jpg  (~45 KB)
    analytic?: string;        // B04.tif (10 m uint16, scale 1e-4)
    scl?: string;             // SCL.tif
  };
  stacHref: string;           // rel=self → 详情页"原始 STAC JSON"
};
```

> 用 `thickCloud`（厚云占比）做默认排序的第二键：实测元数据里 `s2:high_proba_clouds_percentage`、`s2:medium_proba_clouds_percentage`、`s2:thin_cirrus_percentage` 均可用，比单一 `eo:cloud_cover` 更贴近"用户想看见地物"的诉求。排序：`datetime desc`，同日内 `thickCloud asc`。

### 有效性筛选（避免"最新=全云"的挫败）

- 首选 = 满足 `cloud ≤ 阈值` 的最新一景。
- 若一景都不满足，则回退为"时间窗内云量最低的一景"，并在 `StatusBanner` 明示"近期多云，展示最佳可用影像（云量 34%）"。
- UI 用两枚徽章区分：`最新` / `最佳`（同一景可同时命中）。

---

## 4.3 影像加载：渲染分级

> **核心技术决策**：**不使用交互式 XYZ 瓦片作为主路径**。实测 9 张并发瓦片 10.3 s，不可用于地图漫游。改为「一次交互 = 一次裁剪出图」，请求数恒定，延迟可控。

| 层级 | 缩放 | 端点 | 数据源 | 请求 | 实测体积/耗时 | 触发 |
|---|---|---|---|---|---|---|
| **T1 缩略图** | z ≤ 9 | 直接 `<img>` | `L2A_PVI.jpg` (S3) | 0 次渲染请求 | 45 KB / 0.3–0.8 s | 列表、场景条、地图缩略态 |
| **T2 整景预览** | 10–12 | `/cog/preview` | `L2A_PVI.tif` | 1 | 56 KB / **2.6 s** | 选中场景、地图停稳 |
| **T3 视口裁剪** | 13–14 | `/cog/bbox/{bbox}.jpg` | `TCI.tif`（10 m） | 1 | ~120–200 KB / 1–3 s | 停稳 400 ms 后 |
| **T4 细节裁剪** | ≥ 15 | `/cog/bbox/{bbox}.jpg` + `max_size=2048` | `TCI.tif` | 1 | ~300–500 KB / 2–5 s | 停稳 600 ms 后 |
| **T5 可选瓦片** | ≥ 15 且用户开启 | `/cog/tiles/WebMercatorQuad/{z}/{x}/{y}` | `TCI.tif` | N（队列 4） | 26 KB/张，0.4–3 s/张 | 默认关闭，P6 |

### URL 模板（已实测）

```http
# T2 整景预览（推荐，最省流）
GET {TITILER}/cog/preview?url={previewCog}&max_size=1024
    # 实测 200 / 56 KB / 2.57 s

# T3/T4 视口裁剪
GET {TITILER}/cog/bbox/{minx},{miny},{maxx},{maxy}.jpg
    ?url={visualCog}&bidx=1&bidx=2&bidx=3
    &dst_crs=EPSG:3857
    &max_size={1024|2048}
    # 实测同端点 .png 返回 200，但 1.94 MB ← 必须用 JPEG 后缀
    # ⚠ P2 首件事：验证 .jpg 后缀可用；不可用则退回 /cog/preview + max_size

# T5（可选）瓦片
GET {TITILER}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}?url={visualCog}&bidx=1&bidx=2&bidx=3
    # 实测 z12 单张 26–30 KB / 0.39 s(warm)
```

- `TCI.tif` 已是 **uint8 RGB**，`bidx=1,2,3` 即可，无需 `rescale`。
- 若改用 `B04/B03/B02`（uint16，`scale=1e-4`）需 `rescale=0,3000`，且三波段要合并成一次请求（titiler 支持多 `url` 或多 `bidx`，按 P6 假彩色再定）。
- **`url=` 参数必须整体 `encodeURIComponent`**（含 `&` 会被截断，这是最常见的踩坑点）。

### 放置到地图

```ts
// 请求用 3857 米制 bbox，回来用同一 bbox 的经纬度角点做 bounds
const overlay = L.imageOverlay(blobUrl, [
  [southWest.lat, southWest.lng],
  [northEast.lat, northEast.lng],
], { opacity: 0, className: 'gm-scene-img', interactive: false });
```
淡入 200 ms；`loading` 时叠一层骨架（`backdrop-filter` 在低端机要关）。

### 请求治理（防抖/取消/竞态）

| 场景 | 策略 |
|---|---|
| 地图 `moveend` | 400 ms 去抖后再决定是否重查/重绘 |
| 缩放档位跨级 | 250 ms 去抖；同档内只平移 → 仅更新影像层，不重新检索 |
| 每次新请求 | 递增 `requestToken`；响应回来 token 不匹配直接丢弃（**必须**，否则快速拖动会出"错图"） |
| 所有 `fetch` | `AbortController` + 8 s 超时；新请求发起时 `abort()` 旧的 |
| 并发上限 | 渲染 1（后到者取代前者）、检索 2 |
| 同一渲染 URL | 内存 LRU 命中即复用 `blob URL`，不再发请求 |

---

## 4.4 云量过滤的业务语义（必须写清，否则必然被投诉）

| 概念 | 含义 | 本项目用法 |
|---|---|---|
| `eo:cloud_cover` | **整景**平均云量（约 110 km × 110 km） | 服务端筛选 + 列表展示 |
| `s2:high_proba_clouds_percentage` / `medium` | 高/中概率云占比 | 计算 `thickCloud`，用于"最佳"排序与徽章 |
| `s2:thin_cirrus_percentage` | 薄卷云占比 | 仅展示，不参与筛选 |
| SCL 像元级掩膜 | 每像元分类（云/云影/雪/水） | **首版不做**；P6 通过客户端 SCL 叠加或 CDSE evalscript 实现 |

UI 强制文案：`云量 = 整景平均，目标区域仍可能被云遮挡`。这句话放在云量滑杆下方，字号不小于 12 px。

---

## 4.5 缓存策略（三级）

| 级 | 介质 | 键 | 容量/过期 | 目的 |
|---|---|---|---|---|
| L1 渲染结果 | 内存 `Map` + `URL.createObjectURL` | 完整渲染 URL | 24 条，LRU，`dispose()` 时 `revokeObjectURL` | 来回切换场景/缩放不重发请求 |
| L2 检索结果 | `localStorage` | `gm:q:{bboxRounded}:{from}:{to}:{cloud}:{platform}` | 8 条 LRU，TTL **10 min** | 平移回来秒出；刷新后"上次结果"直达 |
| L3 图片二进制 | IndexedDB（`idb-keyval`） | 渲染 URL | 80 MB 上限，LRU | 二次访问离线可用 |
| L4 HTTP | 浏览器缓存 / P5 Service Worker | 同上 | CacheFirst + 7 天 | 移动端反复打开免流量 |

**注意**：`localStorage` 单条 36 KB × 8 ≈ 288 KB，安全；但**不要**把 STAC 原始大 JSON（含全部 assets）整个存进去，只存 `Scene[]` 精简结构。

---

## 4.6 失败与降级（与 01 文档的 D0–D4 对应）

| 失败点 | 判定 | 处理 |
|---|---|---|
| STAC 4xx（bbox 非法） | `response.ok === false && status < 500` | 修正参数重试一次（裁 bbox），仍失败则提示"区域无效" |
| STAC 5xx / 超时 | > 8 s | 用 L2 缓存；无缓存则 D4 提示 |
| CORS 失败 | `TypeError: Failed to fetch` | 与网络失败同处理；文案"网络或服务不可达" |
| titiler 超时 | > 8 s | D1 重试 1 次（退避 1 s）→ D2 |
| titiler 429/5xx | — | 直接 D2（不重试，避免加剧限流） |
| 图片 `onerror` | — | D3：仅足迹 + 详情链接 |

---

## 4.7 下载与"去官网"入口

| 入口 | 形式 | 说明 |
|---|---|---|
| 原始 STAC JSON | 新窗口打开 `links[rel=self]` | 完整元数据，零成本 |
| 影像 COG 直链 | 新窗口 `assets.visual.href` / `assets.analytic.href` | 10 m GeoTIFF，浏览器可能直接下载（357 MB 级，需提示体积） |
| 缩略图 | `<a download>` | 45 KB，日常分享够用 |
| Copernicus Browser 深链 | `https://browser.dataspace.copernicus.eu/?zoom={z}&lat={lat}&lng={lng}&datasetId=S2_L2A_CDAS&fromTime={t}&toTime={t}` | 带时间与位置，一步到位看原站 |
| 单景 L2A 打包（ZIP） | 说明"需 CDSE 免费账号" | 纯前端无法代下载，明确告知 |

**体积提示**：COG 直链旁固定标注 `约 357 MB`（取 `file:size`），并给"仅下载预览 45 KB"的次级按钮——移动端误点大文件是真实痛点。

---

## 4.8 分辨率与"清晰度上限"的诚实表述

- 单景原生 **10 m**（B02/B03/B04/B08）、20 m（红边/SWIR）、60 m（海岸/卷云）。
- 主视图用 `TCI`（10 m 真彩）→ 屏幕上 1 px 对应地面 10 m 时最清晰（约 z14–15，视纬度）。
- z > 16 继续放大会**过采样**（马赛克感），UI 在 z ≥ 17 显示"已达原始分辨率上限"提示，避免用户以为是产品缺陷。
- EOX 底图为年度镶嵌（10 m），z > 15 同样过采样。

---

## 4.9 实施阶段的实测修正（代码已按此落地）

落地实现时又测出三条与本文件早期假设不符的事实，代码与结论以本节为准：

| # | 原方案 | 实测结果 | 已改为 |
|---|---|---|---|
| 1 | `/cog/bbox/{bbox}.jpg?dst_crs=EPSG:3857` | **500 `cannot convert float NaN to integer`**（该公共实例的 dst_crs 分支不可用） | **去掉 dst_crs，bbox 用 EPSG:4326**；叠加层用同一 bbox 的经纬度角点。视口级范围内墨卡托非线性误差远小于 1 像素 |
| 2 | z 10–12 用整景 320 m 预览（`L2A_PVI.tif`） | 整景 bbox 容易落在场景外（STAC 只要相交就命中），出图常是一片黑；且清晰度反而低于 10 m 裁剪 | **z ≤ 9 用缩略图；z ≥ 10 全部走视口裁剪 + TCI**，少一条失败路径、更清晰 |
| 3 | 渲染结果走 `fetch` → blob 缓存 | titiler 的**错误响应不带 `Access-Control-Allow-Origin`**，浏览器把 429/5xx 报成 CORS 失败，fetch 路径会整条挂掉 | **主路径直接用 `<img src>`**（图片加载不受 CORS 约束）；IndexedDB 缓存改为"已缓存则秒开"的旁路优化 |

另外两条实施细节：

- 自动选景必须**优先"覆盖视口中心"的景**（`pickScene(list, cloud, bbox)`）：否则会出现"最新一景只有边缘一小条落在地图里"。
- 足迹图层最多画 **24 个多边形**（含当前选中景）：几十个半透明多边形叠加会把整幅影像染成蓝色。

