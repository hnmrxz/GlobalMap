# 05 · 响应式断点与移动端交互

---

## 5.1 断点与布局

| 断点 | 视口 | 布局 | 地图占比 | 检索控件位置 |
|---|---|---|---|---|
| **XS 手机** | < 480 px | 全屏地图 + 底部抽屉（peek 88 px） | **≥ 62 vh** | 抽屉内（半屏/全屏） |
| **S 大手机** | 480–767 px | 同上，抽屉 peek 96 px，缩略图 2 列 | ≥ 64 vh | 抽屉内 |
| **M 平板** | 768–1023 px | 左侧固定 300 px 面板 + 地图；无抽屉 | ~ 100 % | 左侧面板 |
| **L 桌面** | ≥ 1024 px | 左面板 360 px + 地图 + 底部时间轴 + 场景条 | 剩余全高 | 左侧 + 底部 |

CSS 只用两个 `@media`（`max-width: 767px`、`min-width: 1024px`），中间态继承桌面并收窄面板宽度；用 `clamp()` 处理字号与间距，避免为每个断点写一套。

```css
/* 高度：iOS 地址栏必须用 dvh，带 vh 回退 */
.gm-app { height: 100vh; height: 100dvh; }
.gm-sheet { max-height: min(92dvh, calc(100dvh - env(safe-area-inset-top) - 8px)); }
```

**移动端地图占屏口径**：抽屉 peek 状态下，`地图高度 = 100dvh − 顶栏 52px − peek 88px − 时间轴 44px ≈ 62–66 vh`（iPhone 13 实测 63 vh）——符合"地图占屏合理、单手可控"的目的：既不挡地图，又能一拇指碰到全部控件。

---

## 5.2 桌面 / 移动的差异清单

| 能力 | 桌面 | 移动 |
|---|---|---|
| 地名搜索 | 顶栏常驻输入框 | 顶栏图标 → 展开为整行输入（自动聚焦、`inputmode=search`） |
| 时间轴 | 底部常驻滑杆 + 刻度 | 抽屉内横向可滑动 chip 行 + 日期滑杆（`touch-action: pan-x`） |
| 场景列表 | 左侧纵向列表 + 底部横向条 | 抽屉内 2 列网格，点开 → 详情全屏 |
| 详情 | 右侧浮层（360 px） | 底部抽屉推到 full |
| 框选 | 鼠标 drag 矩形 | 长按 300 ms 后拖（避免误触），或先点 `▣` 进入框选模式 |
| 悬停预览 | 足迹 hover 高亮 | 无 hover，改 `pointerdown` 高亮 |
| 地图版权 | 右下角单行 | 右下角两行小字（不可隐藏） |

---

## 5.3 移动端交互细节（逐条可验收）

1. **触控目标 ≥ 44×44 px**，相邻目标间距 ≥ 8 px；滑杆 thumb 视觉 20 px、命中区 44 px（用 `::before` 撑开）。
2. **单手可达**：所有可点控件位于视口下 2/3；顶栏只放"搜索"和"菜单"两个入口。
3. **抽屉手势**：`pointerdown → pointermove` 跟手位移，松手按速度/位移吸附到最近档（peek / half / full）；拖到 `full` 时地图 `disable` 拖动避免穿透。
4. **不阻塞滚动**：地图容器 `touch-action: pan-x pan-y` 会让 Leaflet 手势失效，正确做法是容器 `touch-action: none` + 抽屉手柄单独 `touch-action: pan-y`。
5. **双击缩放保留**（Leaflet 默认），但 `tap` 与 `dblclick` 冲突用 `tapTolerance: 12`。
6. **`safe-area-inset-*`** 全量适配刘海/圆角屏；抽屉底部 padding 加 34 px 兜底。
7. **键盘弹出**：搜索框聚焦时抽屉自动推到 full，并 `scrollIntoView`；关闭键盘回 half。
8. **横屏**：地图保持全宽，抽屉改为右侧 45 % 侧栏（`@media (orientation: landscape) and (max-height: 500px)`）。
9. **不吃流量**：缩略图 `loading="lazy"` + `decoding="async"`；T3/T4 大图仅在 `z ≥ 13` 且停稳后请求；列表首屏只加载前 12 张缩略图。
10. **弱网提示**：`navigator.connection.saveData === true` 或 `effectiveType` 为 `2g/3g` → 默认关闭"高清裁剪"，只走 T1/T2，并在设置里给开关。

---

## 5.4 首屏 3 秒预算（基于本机实测）

| 阶段 | 预算 | 实测依据 | 优化手段 |
|---|---|---|---|
| DNS + TLS（4 主机） | 与后续并行 | 首包 RTT 高（实测 EOX 0.7–2.3 s/瓦片，含建连） | `<link rel="preconnect">` × 4，`dns-prefetch` 兜底 |
| HTML + CSS（内联关键样式） | 0.15 s | 单文件 < 8 KB | 关键 CSS 内联，其余 `media` 延迟 |
| JS 解析执行 | 0.4–0.8 s | ≤ 90 KB gz | Leaflet 单独 chunk；非首屏组件（详情/地名）动态 `import()` |
| 地图初始化 | 0.1 s | — | 先建容器与底图，后挂图层 |
| **底图首批瓦片** | 1.2–2.2 s | EOX 单瓦片 0.7–2.2 s（HTTP/2 并发 6–8 张） | 首屏 `zoom` 取整避免二次加载；瓦片 `keepBuffer: 2` |
| ⤷ **可交互（"3 s 可用"）** | **≈ 2.0–2.5 s** | — | 底图出来即可拖动/缩放 |
| STAC 首次检索（与底图并行） | 1.0–3.0 s | 实测 1.0 s(warm)–3.0 s(cold) | 本地缓存上次结果 → **0 ms 命中** |
| 首景影像（T2 预览） | +2.6 s | 实测 2.57 s | 用 `L2A_PVI.jpg`（45 KB）先出图，再异步换 `preview` |

**结论**：满足"首屏 3 秒内可用（可拖动 + 有卫星底图）"；"看到最新一景 10 m 影像"目标 4–6 s，用缩略图占位把感知压到 3 s 内。

**兜底开关**（若验收被判不达标）：
- `VITE_BASEMAP=osm`（实测单瓦片 0.36 s，比 EOX 快 2–3 倍）；
- 首屏不发起 STAC，改为"上次位置 + 缓存结果"，检索由 `requestIdleCallback` 触发。

---

## 5.5 性能守则（防止后期劣化）

- 禁止在 `scroll`/`pointermove` 里读取布局属性（强制同步布局）；抽屉位移用 `transform: translate3d()`。
- 影像层切换用"新 overlay 淡入 → 移除旧 overlay"，不要反复改同一 `<img>` 的 `src`（会闪白）。
- `imageOverlay` 的 `className` 固定，避免每次重建 `<img>` 触发重排。
- 移动端禁用 `backdrop-filter`（`@supports` + `prefers-reduced-motion` 双闸）。
- 任何 > 100 ms 的计算（如大到 100 景的排序/去重）放进 `requestAnimationFrame` 后的微任务，避免掉帧。
- 上线前用 Lighthouse mobile（4G 节流）跑一次，记录 LCP/CLS/TBT 到 `docs/perf.md` 作为基线。
