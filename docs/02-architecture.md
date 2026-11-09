# 02 · 技术选型、整体架构与目录结构

---

## 2.1 技术选型（含放弃理由）

| 层 | 选择 | 版本 | 理由 | 放弃的方案 |
|---|---|---|---|---|
| 构建 | **Vite** | 6.x | 冷启动 <1 s、产物小、零配置静态部署 | Next.js（要 Node 运行时）、Webpack（重） |
| 语言 | **TypeScript**（strict） | 5.x | 与 STAC 的复杂 JSON 结构打交道的唯一可靠手段 | 纯 JS（STAC 字段拼错无人发现） |
| 地图 | **Leaflet** | 1.9.x | 42 KB gz；栅格 `<img>` 不强依赖 CORS；老 Android WebView 也能跑；API 心智负担低 | **MapLibre GL**：WebGL 必需、需要 CORS + 更重的样式系统、低端机 GPU 风险；本项目无矢量/倾斜需求，收益为零 |
| UI 框架 | **无框架（原生 TS + 自定义 `h()` 助手）** | — | 全站状态 < 20 个字段、组件 < 15 个，React 的 diff 收益抵不过 40 KB 运行时与构建复杂度 | **React**：仅当团队已有 React 工程规范时值回票价（见 ADR-003 的切换路径） |
| 样式 | **原生 CSS + CSS 变量 + `clamp()`** | — | 无 PostCSS/Tailwind 构建负担；断点只有 3 个 | Tailwind（产物/心智成本不划算） |
| 状态 | **微型 store（订阅式，~60 行）+ URL hash 同步** | — | 可分享、可前进后退、刷新不丢 | Redux/Zustand（过重） |
| 缓存 | **内存 LRU + `localStorage`（查询快照）+ IndexedDB（`idb-keyval`，渲染结果）** | — | 零依赖优先，IndexedDB 只在需要时引入 | Service Worker（P5 再上） |
| 测试 | Vitest（纯逻辑单测）+ Playwright（1 条冒烟） | — | 只测"日期/云量/缩放分级/URL 编解码"这些真正会错的地方 | 全量组件测试（收益低） |

**体积预算（硬指标）**

| 项 | 预算 | 说明 |
|---|---|---|
| JS（gz） | **≤ 90 KB** | Leaflet ~42 + 应用 ~20 + polyfill/杂项 |
| CSS（gz） | ≤ 12 KB | |
| 字体 | **0** | 只用系统字体栈，避免中国网络下 Google Fonts 超时 |
| 首屏请求数 | ≤ 8（不含底图瓦片） | preconnect 覆盖 4 个主机 |

---

## 2.2 整体架构

分层遵循"内层不知道外层"：`domain` 不 import 任何浏览器/网络 API，`services` 实现接口，`ui` 只做渲染与事件。

```
┌──────────────────────────────────────────────────────────────────────┐
│  浏览器（静态站点，无自建后端）                                        │
│                                                                      │
│  ┌──────────── ui/ (DOM only) ────────────────────────────────────┐  │
│  │ MapView   DateRail  CloudSlider  SearchBox  SceneStrip  Sheet  │  │
│  └───────────────┬────────────────────────────────────────────────┘  │
│                  │ props 下行 / 事件上行                               │
│  ┌───────────────▼──── app/ (编排) ───────────────────────────────┐  │
│  │   store.ts        单一状态 + 订阅                                │  │
│  │   urlState.ts     hash ↔ state（可分享链接）                      │  │
│  │   searchFlow.ts   "检索" 用例：视口→bbox→STAC→排序→选中           │  │
│  │   renderFlow.ts   "出图" 用例：zoom→策略→URL→请求→降级            │  │
│  └───────┬──────────────────────────────┬──────────────────────────┘  │
│          │ 只依赖 domain 类型            │ 只依赖 services 的接口         │
│  ┌───────▼──────────┐        ┌──────────▼──────────────────────────┐  │
│  │ domain/ 纯函数    │        │ services/ 适配器                     │  │
│  │ scene.ts          │        │ stac/earthSearch.ts  (fetch + 映射)  │  │
│  │ bbox.ts           │        │ render/titiler.ts    (URL 构造)      │  │
│  │ dates.ts          │        │ basemap/sources.ts   (L.tileLayer)   │  │
│  │ zoomTier.ts       │        │ geocode/nominatim.ts                 │  │
│  │ （零 I/O、可单测）  │        │ cache/*.ts                          │  │
│  └───────────────────┘        └──────────┬──────────────────────────┘  │
└───────────────────────────────────────────┼────────────────────────────┘
                                            │ HTTPS（CORS 全开）
        ┌───────────────┬───────────────────┼──────────────┬──────────────┐
        ▼               ▼                   ▼              ▼              ▼
  Earth Search     e84 S3 COG          titiler.xyz     EOX WMTS       Nominatim
  (STAC 检索)      (数据本体)          (渲染)          (底图)          (地名)
```

### 一次完整交互的数据流

```
用户平移/缩放地图
   │  debounce 400ms
   ▼
MapView ──bounds(3857)→ toBbox4326() ──► searchFlow
                                          │ 缓存命中？
                                          ├─ 否 → GET /collections/sentinel-2-c1-l2a/items
                                          │        ?bbox=…&datetime=…&query={eo:cloud_cover,platform}
                                          │        &limit=100  (AbortController 可取消)
                                          │      → normalize(Scene[]) → 按 datetime desc 排序
                                          ▼
                                     store.scenes = Scene[]
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              ▼                           ▼                           ▼
        FootprintLayer              SceneStrip(缩略图)          DateRail(可用成像日期)
              │                           │
              └──────── 用户点选某景 ──────┘
                                          ▼
                                    renderFlow(zoom)
                                          │ 选策略(见 04)
                                          ▼
                                  GET titiler /cog/{preview|bbox}
                                          │ 成功 → L.imageOverlay(bounds3857)
                                          └ 失败 → 缩略图 / 足迹 / 链接（降级链 D1–D4）
```

---

## 2.3 目录结构

```
E:\globlemap
├─ index.html                  # 唯一入口；含 preconnect / 骨架屏 / 版权角标
├─ package.json                # scripts: dev / build / preview / test / typecheck
├─ vite.config.ts              # base:'./'（可部署到子路径）、手动 chunk 拆分
├─ tsconfig.json               # strict, noUncheckedIndexedAccess
├─ public/
│  ├─ favicon.svg
│  └─ og.png                   # 分享图
├─ src/
│  ├─ main.ts                  # 仅做 bootstrap：createApp() + mount
│  ├─ config.ts                # 环境变量集中出口（见 2.5），唯一读 import.meta.env 的地方
│  ├─ app/
│  │  ├─ createApp.ts          # 装配：store + view + services，返回 dispose()
│  │  ├─ store.ts              # createStore()：state / set / subscribe / select
│  │  ├─ urlState.ts           # #z/x/y?d=2026-10-01..2026-11-06&c=20&p=2a&s=<sceneId>
│  │  ├─ searchFlow.ts         # 检索用例（含缓存、取消、错误态）
│  │  └─ renderFlow.ts         # 出图用例（含分级、去抖、降级、竞态防护）
│  ├─ domain/                  # 纯函数，零 I/O，可 100% 单测
│  │  ├─ types.ts              # Scene / Bbox / SearchQuery / RenderTier
│  │  ├─ bbox.ts               # 反算/取整/面积/包含/裁到中国及全球边界
│  │  ├─ dates.ts              # 区间预设、UTC→北京时间、日期轴分箱
│  │  ├─ scene.ts              # 归一化、排序、去重、云量/平台过滤
│  │  └─ zoomTier.ts           # zoom → 渲染策略与最大像素
│  ├─ services/
│  │  ├─ http.ts               # fetch 封装：超时、重试、AbortSignal、JSON 校验
│  │  ├─ stac/
│  │  │  ├─ earthSearch.ts     # 查询构造 + 分页 + 错误分类
│  │  │  └─ normalize.ts       # STAC Item → Scene（兼容 c1-l2a / pre-c1 / CDSE 字段差异）
│  │  ├─ render/
│  │  │  ├─ titiler.ts         # preview / bbox / tiles 三类 URL 构造
│  │  │  └─ fallback.ts        # 缩略图、直链、Browser 深链
│  │  ├─ basemap/sources.ts    # EOX / OSM / 纯色，含正确 attribution 字符串
│  │  ├─ geocode/nominatim.ts  # 防抖 + 缓存 + 政策约束
│  │  └─ cache/
│  │     ├─ lru.ts             # 内存 LRU（渲染结果 blob URL）
│  │     ├─ queryCache.ts      # localStorage 存最近 N 次查询
│  │     └─ imageCache.ts      # IndexedDB（P5）
│  ├─ ui/
│  │  ├─ dom.ts                # h(tag, props, children) 极简助手 + 事件绑定
│  │  ├─ map/
│  │  │  ├─ mapView.ts         # L.map 生命周期、bounds 变化、resize
│  │  │  ├─ footprintLayer.ts  # GeoJSON 足迹 + hover/选中态
│  │  │  ├─ imageOverlay.ts    # 单图覆盖（含淡入、占位、失败占位）
│  │  │  └─ drawBox.ts         # 矩形框选（自实现 drag-rect，不用 Leaflet.draw）
│  │  ├─ controls/
│  │  │  ├─ searchBox.ts       # 地名搜索（防抖、键盘可达）
│  │  │  ├─ dateRail.ts        # 时间轴 / 日期滑杆 / 区间预设
│  │  │  ├─ cloudSlider.ts     # 云量 0–100
│  │  │  └─ layerSwitch.ts     # 底图与叠加层
│  │  ├─ panels/
│  │  │  ├─ sceneStrip.ts      # 场景缩略图条（桌面底部 / 移动抽屉内）
│  │  │  ├─ sceneDetail.ts     # 详情抽屉（元数据 + 下载入口）
│  │  │  ├─ bottomSheet.ts     # 移动端可拖拽抽屉（peek / half / full）
│  │  │  └─ statusBanner.ts    # 空/错/慢/降级提示
│  │  └─ common/{toast,skeleton,icon}.ts
│  └─ styles/
│     ├─ tokens.css            # 颜色/间距/圆角/阴影/断点变量
│     ├─ base.css              # reset、字体栈、safe-area
│     ├─ layout.css            # 三套断点布局
│     └─ components.css        # 组件样式（BEM-ish 前缀 gm-）
└─ docs/                       # 本套规格文档
```

**测试与文档不进入构建产物**；`src/domain` 与 `src/services/*/normalize.ts` 是单测重点。

---

## 2.4 依赖方向规则（评审红线）

1. `domain/*` **不得** import `leaflet`、`fetch`、`window`、`document`、`localStorage`。违反即为架构分。例：不要在 `scene.ts` 里做 `new Date().toLocaleString('zh-CN')` 这种隐含时区逻辑。
2. `ui/*` **不得**直接调用 `services/*`；只能通过 `app/*` 传入的回调。这样换渲染器不动 UI。
3. `services/*` **不得** import `ui/*`。适配器不认识 DOM。
4. 只有 `config.ts` 读 `import.meta.env`；其余模块通过参数接收配置。
5. 任何 `fetch` 必须带 `AbortSignal` 与超时；任何直连第三方 URL 必须集中在 `services/`，禁止在 UI 里手写 URL（否则降级链会漏）。

---

## 2.5 配置项（`.env`）

```ini
# 数据与渲染（全部有默认值，缺省即"零 Key 可用"）
VITE_STAC_BASE=https://earth-search.aws.element84.com/v1
VITE_STAC_COLLECTION=sentinel-2-c1-l2a
VITE_TITILER_BASE=https://titiler.xyz          # 自建实例只需改这一行
VITE_BASEMAP=eox-cloudless-2025                # eox-cloudless-2025 | eox-cloudless-2024 | osm | none
VITE_GEOCODER=https://nominatim.openstreetmap.org

# 行为
VITE_DEFAULT_DATETIME_DAYS=90                  # 默认时间窗
VITE_DEFAULT_CLOUD=20                          # 默认云量上限
VITE_MAX_BBOX_DEG=1.5                          # 超过则提示放大或降采样
VITE_RENDER_MAX_PX=1024                        # 单次出图最大边
VITE_SEARCH_LIMIT=100
VITE_ALLOW_ADVANCED_INSTANCE=false             # 是否显示 CDSE 高级接入入口
```

---

## 2.6 URL 状态契约（可分享、可回退）

```
#z/x/y?d=<from>..<to>&c=<cloud>&p=<all|2a>&s=<sceneId>&m=<render|footprint>
```

| 参数 | 含义 | 缺省 |
|---|---|---|
| `z/x/y` | 地图视图（Leaflet 标准） | 北京 / z11 |
| `d` | 时间区间 `YYYY-MM-DD..YYYY-MM-DD` | 今天往前 90 天 |
| `c` | 云量上限 0–100 | 20 |
| `p` | `all` 或 `2a` | all |
| `s` | 选中场景 id | 无（自动选最新） |
| `m` | 查看模式：`render` 出图 / `footprint` 只看足迹 | render |

约定：`history.replaceState` 用于平移缩放（避免污染历史），`pushState` 仅用于"选中场景"。解析失败**一律回退默认值并静默**，不允许因 URL 畸形白屏。

---

## 2.7 构建与部署

- `npm run build` → `dist/`，纯静态；`vite.config.ts` 设 `base: './'` 以便部署在任意子路径。
- 无 SSR、无 Node 运行时；可托管于 GitHub Pages / Cloudflare Pages / OSS / 任意静态空间。
- **不要**把 `client_secret` 之类凭据打进构建产物（P6 高级模式也不得这样做，见 06 风险 R7）。
- 缓存头建议：`index.html` no-store；`assets/*`（带 hash）immutable 1 年。
