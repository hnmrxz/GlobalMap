/** 关于 / 数据来源 / 本地缓存管理。 */
import { clearQueryCache } from '../../services/cache/queryCache';
import { clearImageCache, imageCacheStats } from '../../services/cache/imageCache';
import { humanBytes } from '../../services/render/fallback';
import { BASEMAPS } from '../../services/basemap/sources';
import { h } from '../dom';

export function openAbout(host: HTMLElement): void {
  const scrim = h('div', { class: 'gm-scrim', onclick: () => close() });
  const stats = h('span', { class: 'gm-hint', text: '统计中…' });

  const dialog = h(
    'section',
    { class: 'gm-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '关于' },
    h(
      'header',
      { class: 'gm-dhead' },
      h('b', { text: '关于 GlobeMap' }),
      h('button', { class: 'gm-icon', type: 'button', 'aria-label': '关闭', text: '×', onclick: () => close() }),
    ),
    h(
      'div',
      { class: 'gm-dbody' },
      h('p', {
        text: '免费查看哨兵二号（Sentinel-2）最新卫星影像。选好区域与时间即可浏览 10 米分辨率真彩影像，无需注册、无需 API Key。',
      }),
      h('h4', { text: '数据来源与授权' }),
      h(
        'ul',
        { class: 'gm-ul' },
        h('li', {}, h('b', { text: 'Sentinel-2 L2A（ESA / Copernicus）' }), ' — 检索 ', h('a', { class: 'gm-link', href: 'https://earth-search.aws.element84.com/v1', target: '_blank', rel: 'noopener' }, 'AWS Earth Search'), '，影像托管于 AWS Open Data（us-west-2）。'),
        h('li', {}, h('b', { text: '渲染' }), ' — 公共 ', h('a', { class: 'gm-link', href: 'https://titiler.xyz', target: '_blank', rel: 'noopener' }, 'titiler'), '（演示实例，无 SLA；可替换为自建实例）。'),
        h('li', {}, h('b', { text: '底图' }), ' — EOxCloudless 年度无云镶嵌，按 EOX 非商业许可使用（商业部署请购买许可或改用其它底图）。'),
      ),
      h('h4', { text: '可选底图' }),
      h('p', { class: 'gm-hint', text: BASEMAPS.filter((b) => b.url).map((b) => b.label).join(' · ') }),
      h('h4', { text: '隐私' }),
      h('p', {
        class: 'gm-hint',
        text: '本站没有后端、没有账号、没有 Cookie，也不接入第三方埋点。检索条件与影像会缓存在你自己的浏览器里，用于加速与离线查看。',
      }),
      h('h4', { text: '本地缓存' }),
      h(
        'div',
        { class: 'gm-cache-row' },
        stats,
        h('button', {
          class: 'gm-btn gm-btn-ghost',
          type: 'button',
          text: '清空缓存',
          onclick: async () => {
            clearQueryCache();
            await clearImageCache();
            await refreshStats();
          },
        }),
      ),
      h('p', { class: 'gm-hint', text: '影像数据版权归 Copernicus / ESA 所有；本站仅做浏览与检索，不重新分发原始产品。' }),
    ),
  );

  host.append(scrim, dialog);

  async function refreshStats(): Promise<void> {
    try {
      const s = await imageCacheStats();
      stats.textContent = `影像 ${s.count} 张，约 ${humanBytes(s.bytes)}`;
    } catch {
      stats.textContent = '缓存不可用';
    }
  }

  function close(): void {
    scrim.remove();
    dialog.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  document.addEventListener('keydown', onKey);
  void refreshStats();
}
