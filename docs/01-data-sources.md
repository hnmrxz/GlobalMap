# 01 · 数据源对比与最终推荐

> 所有"实测"数据为 2026-11-06 从本机（中国大陆网络）直接测量的结果，非文档抄录。
> 网络位置会显著影响延迟，因此延迟列只用于**相对排序**，不用于绝对值承诺。

---

## 1.1 候选源对比表

| # | 数据源 | 提供能力 | 最新时效性（实测/文档） | 需 Key / 账号 | 清晰度上限 | CORS | 本项目角色 |
|---|---|---|---|---|---|---|---|
| A | **AWS Earth Search STAC**<br>`earth-search.aws.element84.com/v1` | 元数据检索（bbox / 时间 / 云量 / 平台），9 个集合，`sentinel-2-c1-l2a` 覆盖 2015→今 | 成像到入库 **≈3 小时**（实测 T50TMK） | 否 | — | `*` | **主检索** |
| B | **AWS S3 公开 COG**<br>`e84-earth-search-sentinel-data`，us-west-2 | 资产本体：`TCI.tif`(10 m RGB)、`B02/B03/B04/B08`(10 m)、`B05-B07/B8A/B11/B12/SCL`(20 m)、`L2A_PVI.tif`(320 m 预览)、`L2A_PVI.jpg`(缩略图) | 同上 | 否（`requester_pays=false`） | **10 m** | `*`，**支持 Range 206** | **主体数据** |
| C | **titiler 公共实例** `titiler.xyz` | COG → 瓦片 / 裁剪 / 预览（`/cog/tiles`、`/cog/bbox`、`/cog/preview`） | 取决于 B | 否 | 原值 10 m | 回显 `Origin` | **主渲染**（单请求模式） |
| D | **EOX s2cloudless**<br>WMTS/WMS/ZXY `tiles.maps.eox.at` | 全球年度无云镶嵌，2016–**2025** 分年图层，`overlay`/`terrain` 辅助层 | **年度**（非最新单景） | 否 | 10 m（z>15 为过采样） | 回显 | **底图**（常驻视觉底座） |
| E | **CDSE STAC v1** `stac.dataspace.copernicus.eu/v1` | 官方目录检索（L1C/L2A） | 官方口径最快 | 否（检索匿名） | — | 是 | 备选检索（国内实测 3.0 s，较慢） |
| F | **CDSE Sentinel Hub** `sh.dataspace.copernicus.eu` | WMS/WMTS 即时瓦片 + **evalscript**（真彩/假彩色/云掩膜/指数/按 TIME 取单景） | **最快可用**（官方近实时） | **要免费账号**（OAuth `client_id`/`client_secret`，非付费 Key） | 10 m | 是 | **可选增强 P6**，默认隐藏 |
| G | **Microsoft Planetary Computer STAC** | STAC 匿名检索 + COG（需 SAS 签名 URL） | 官方 | 检索免 Key | 10 m | 是 | 备选；浏览器端读 COG 需 `geotiff.js`，成本高 |
| H | **NASA GIBS** | 每日真彩（MODIS/VIIRS，250–500 m） | **每日**（含当天） | 否 | 250 m | `*` | 可选补充层："今天的卫星图" |
| I | **Nominatim（OSM）** | 地名 → 坐标 | 静态 | 否（须守 1 req/s + UA 政策） | — | 是 | **地名搜索** |
| J | **OSM 栅格瓦片** | 通用底图（非卫星） | 静态 | 否 | 19 | 图片直连 | 底图备选（实测最快 0.36 s） |

### 参考链接

- Earth Search：[element84/earth-search](https://earth-search.aws.element84.com/v1)（`/collections` 实测 9 个集合）
- EOX 授权与产品：[EOxCloudless](https://cloudless.eox.at/) · [License Legal](https://cloudless.eox.at/license-legal) · [产品列表](https://cloudless.eox.at/documentation/product-list)
- titiler：[developmentseed/titiler](https://github.com/developmentseed/titiler)

---

## 1.2 逐项判断（为什么不是别的）

**为什么不用 CDSE Sentinel Hub 做主路径？**
它能一次解决"最新 + 10 m + 云掩膜 + 按日期取单景"，技术上是最优解，但需要注册免费账号并携带 OAuth 凭据；在纯前端里凭据必然暴露在浏览器端，等于把配额交给任何访客。**违反"零 Key"约束，且构成配额滥用风险**，所以只做可选增强。

**为什么不用 Sentinel Hub 的"公共演示 instance"？**
社区流传的公开 instance id 不受任何 SLA/授权约束，随时失效，且可能违反服务条款。**不采用**。

**为什么 titiler 只做"单请求渲染"？**
实测：单瓦片 warm 0.39 s，但 9 张并发总计 10.3 s（上游排队/冷启动放大）。地图平移一次就要几十张瓦片，交互瓦片在这种公共实例上不可用。详见 [ADR-002](<07-adr.md#adr-002-放弃交互式-xyz-瓦片改视口裁剪单图>)。

**为什么还要 EOX 底图？**
用户打开页面的第一秒必须"看到东西"。年度镶嵌是**真 Sentinel-2 数据**、零 Key、覆盖全球、无水印，z≤15 内视觉可用；它把"首屏可用"与"STAC/titiler 是否慢"彻底解耦。

**为什么保留 NASA GIBS？**
当目标区域连续两周被云覆盖、用户又只想"看一眼今天"时，250 m 的每日真彩比"没有 S2 影像"更有用。定位为**可选补充层**，非默认。

---

## 1.3 最终推荐：三层 + 一条降级链

```
┌─ L0 视觉底座（永远可用，<2 s）
│   EOX s2cloudless-2025 年度镶嵌（JMTS 3857，z 3–16）
│   备用：OSM 栅格（更快）/ 纯色底板
│
├─ L1 检索层（零 Key）
│   Earth Search STAC  →  bbox + datetime + eo:cloud_cover + platform
│   产出：Scene[]（id / 时间 / 云量 / 平台 / 足迹 / 缩略图 / 资产 URL）
│   备用：CDSE STAC v1（同构 STAC，换 base URL 即可）
│
└─ L2 渲染层（零 Key，单请求模式）
    ① z ≤ 12   : /cog/preview  on L2A_PVI.tif（320 m，≤1024 px）
    ② z 13–14  : /cog/bbox     on TCI.tif（10 m，≤1024 px，JPEG）
    ③ z ≥ 15   : /cog/bbox     on TCI.tif（≤2048 px）或 /cog/tiles（队列≤4）
```

### 降级链（每一级都能独立出图）

| 级别 | 触发条件 | 行为 | 用户感知 |
|---|---|---|---|
| D0 | 正常 | titiler 单请求出图 | 图 |
| D1 | titiler 超时（>8 s）/ 5xx / 429 | 重试 1 次（指数退避）后切 D2 | 轻微延迟 |
| D2 | D1 失败 | 直接用 **S3 缩略图 `L2A_PVI.jpg`（45 KB）** 作整景底图 + 提示"当前为低清预览" | 有图但模糊 |
| D3 | 连缩略图也失败 | 只画足迹 + 详情卡（含 COG 直链、Copernicus Browser 深链） | 无图，但有全部链接 |
| D4 | STAC 检索失败 | 底图仍在 + "检索服务暂不可用，点击重试" + 使用上次缓存结果 | 站点可用 |

> **关键设计**：任何一级失败都不会出现白屏。底图与检索是两条独立链路。

---

## 1.4 授权与署名（必须写进 UI）

| 数据 | 授权 | UI 要求 |
|---|---|---|
| Copernicus Sentinel 数据 | Copernicus Sentinel Data Terms（免费，含商业用途） | 署名 `Contains modified Copernicus Sentinel data 2026` |
| Earth Search / S3 | 同上（数据本身） | 可在"关于"页说明处理来源 Element 84 |
| **EOX s2cloudless** | **免费瓦片为非商业许可；商业需付费**（[License Legal](https://cloudless.eox.at/license-legal) 明确以 license fee 为前提） | 底图角标必须原样保留：`EOxCloudless — cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)` |
| OSM | ODbL | `© OpenStreetMap contributors` |
| Nominatim | 使用政策：≤1 req/s、须标识 UA、结果须缓存 | 前端 500 ms 防抖 + 最少 3 字符 + 本地缓存 |
| titiler.xyz | 演示实例，无 SLA | "关于"页声明；生产建议自建（见 1.5） |

**结论**：若本站预期商业化，把默认底图切到 **OSM**，或接入 CDSE 免费账号 WMS（Sentinel 数据本身允许商业使用），并保留 EOX 图层为"可选/需授权"。

---

## 1.5 生产化可选项（不改变"纯前端"形态）

| 可选增强 | 做法 | 收益 | 成本 |
|---|---|---|---|
| 自建渲染 | Cloudflare Worker / Deno Deploy 反代 titiler，`VITE_TITILER_BASE` 指向它 | 消除演示实例风险、可加缓存与限流 | 一个边缘函数（~50 行） |
| 客户端渲染 | `geotiff.js` + canvas 直接读 S3 COG（Range 已实测可用） | 彻底零第三方依赖，10 m 像素 | +30 KB gz，P6 实现 |
| 边缘缓存 | CF Cache API 缓存 `/cog/bbox` 结果（按 URL 键） | 二次访问秒开 | 同上 |
| 官方瓦片 | CDSE Sentinel Hub 免费账号 → evalscript 云掩膜/假彩色 | 真正的"每景云掩膜" | 需账号，凭据暴露风险 |
