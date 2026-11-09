/** 场景详情抽屉：元数据 + 四个出口（STAC JSON / COG 直链 / 缩略图 / 官方看图）。 */
import { beijingClock, formatBeijing } from '../../domain/dates';
import { cloudText, platformName } from '../../domain/scene';
import type { Scene } from '../../domain/types';
import { browserDeepLink, cogUrl, stacJsonUrl, thumbSrc } from '../../services/render/fallback';
import { h, replace } from '../dom';

export interface DetailDeps {
  onClose: () => void;
}

export function mountDetail(host: HTMLElement, deps: DetailDeps): { update(scene: Scene | null): void } {
  const panel = h('section', { class: 'gm-detail', hidden: true, role: 'dialog', 'aria-label': '影像详情' });
  const backdrop = h('div', { class: 'gm-scrim', hidden: true, onclick: () => deps.onClose() });
  host.append(backdrop, panel);

  let closable = false;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && closable) deps.onClose();
  });

  function row(label: string, value: Node | string): HTMLElement {
    const wrap = h('span', { class: 'gm-dvalue' });
    if (typeof value === 'string') wrap.textContent = value;
    else wrap.appendChild(value);
    return h('div', { class: 'gm-drow' }, h('span', { class: 'gm-dlabel', text: label }), wrap);
  }

  function link(label: string, href: string | null, hint?: string): Node {
    if (!href) return h('span', { class: 'gm-hint', text: '不可用' });
    return h(
      'a',
      { class: 'gm-link', href, target: '_blank', rel: 'noopener noreferrer' },
      h('span', { text: label }),
      hint ? h('em', { class: 'gm-link-hint', text: hint }) : null,
    );
  }

  function update(scene: Scene | null): void {
    closable = Boolean(scene);
    if (!scene) {
      panel.hidden = true;
      backdrop.hidden = true;
      replace(panel);
      return;
    }

    const thumb = thumbSrc(scene);
    replace(
      panel,
      h(
        'header',
        { class: 'gm-dhead' },
        h(
          'div',
          {},
          h('b', { text: formatBeijing(scene.datetime) }),
          h('span', { class: 'gm-hint', text: `UTC ${scene.datetime.slice(11, 16)}` }),
        ),
        h('button', {
          class: 'gm-icon',
          type: 'button',
          'aria-label': '关闭',
          text: '×',
          onclick: () => deps.onClose(),
        }),
      ),
      h(
        'div',
        { class: 'gm-dbody' },
        row('卫星', platformName(scene.platform)),
        row('整景云量', cloudText(scene.cloudCover)),
        row('厚云占比', cloudText(scene.thickCloud)),
        row('北京时区', `${formatBeijing(scene.datetime)} ${beijingClock(scene.datetime)}`),
        row('景编号', h('code', { class: 'gm-code', text: scene.id })),
        row('范围', h('code', { class: 'gm-code', text: scene.bbox.map((v) => v.toFixed(3)).join(', ') })),
        row('分辨率', '真彩 10 m · 预览 320 m'),
      ),
      h(
        'div',
        { class: 'gm-dactions' },
        link('在 Copernicus Browser 查看', browserDeepLink(scene)),
        link('原始 STAC 元数据', stacJsonUrl(scene)),
        thumb
          ? h(
              'a',
              { class: 'gm-link', href: thumb, download: `${scene.id}.jpg`, target: '_blank', rel: 'noopener' },
              h('span', { text: '下载缩略图' }),
              h('em', { class: 'gm-link-hint', text: '约 45 KB' }),
            )
          : null,
        link('下载 10 m 真彩 COG', cogUrl(scene, 'visual'), '约 300 MB+'),
      ),
      h('p', {
        class: 'gm-hint gm-dnote',
        text: '单景完整 L2A 打包下载需要在 Copernicus Dataspace 注册免费账号，本站在浏览器端不代为下载。',
      }),
    );
    panel.hidden = false;
    backdrop.hidden = false;
  }

  return { update };
}
