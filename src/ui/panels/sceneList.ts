/** 结果列表：缩略图卡片 + 日期 + 云量 + 平台徽章。桌面在左栏，移动端在抽屉内。 */
import type { QueryState } from '../../app/state';
import { beijingClock, beijingDayKey, dayLabel } from '../../domain/dates';
import { cloudText, platformName, platformTag } from '../../domain/scene';
import type { Scene } from '../../domain/types';
import { thumbSrc } from '../../services/render/fallback';
import { h, replace } from '../dom';

export interface SceneListDeps {
  getScenes(): Scene[];
  getSelectedId(): string | null;
  getQuery(): QueryState;
  /** 阈值内"最佳"一景（用于徽章） */
  getBestId(): string | null;
  onPick(id: string): void;
  onDetail(id: string): void;
  onRetry(): void;
}

const MAX_CARDS = 60;

/** 从 STAC item id 里取 MGRS 图幅号：S2B_T50TMK_20261102T030954_L2A → T50TMK */
function tileOf(id: string): string {
  const m = /_(T\d{2}[A-Z]{3})_/.exec(id);
  return m?.[1] ?? id.slice(0, 12);
}

export function mountSceneList(host: HTMLElement, deps: SceneListDeps): { update(): void } {
  const head = h('div', { class: 'gm-list-head' });
  const body = h('div', { class: 'gm-cards' });
  host.appendChild(h('div', { class: 'gm-list-root' }, head, body));

  let lastKey = '';

  function card(scene: Scene, index: number, selected: boolean, best: boolean): HTMLElement {
    const thumb = thumbSrc(scene);
    const day = beijingDayKey(scene.datetime);
    const img = thumb
      ? h('img', {
          class: 'gm-card-img',
          src: thumb,
          loading: index < 8 ? 'eager' : 'lazy',
          decoding: 'async',
          alt: `${dayLabel(day)} 影像缩略图`,
        })
      : h('span', { class: 'gm-card-img gm-card-img-empty', text: '无缩略图' });

    return h(
      'article',
      { class: `gm-card${selected ? ' is-on' : ''}`, dataset: { id: scene.id } },
      h(
        'button',
        {
          class: 'gm-card-hit',
          type: 'button',
          'aria-pressed': selected ? 'true' : 'false',
          onclick: () => deps.onPick(scene.id),
        },
        h('span', { class: 'gm-card-thumb' }, img),
        h(
          'span',
          { class: 'gm-card-main' },
          h(
            'span',
            { class: 'gm-card-row' },
            h('b', { class: 'gm-card-day', text: dayLabel(day) }),
            h('span', { class: 'gm-card-time', text: beijingClock(scene.datetime) }),
            h('i', { class: 'gm-badge', text: platformTag(scene.platform), title: platformName(scene.platform) }),
            best ? h('i', { class: 'gm-badge is-best', text: '最佳' }) : null,
          ),
          h(
            'span',
            { class: 'gm-card-row gm-card-sub' },
            h('span', {
              class: `gm-cloud${scene.cloudCover > 40 ? ' is-high' : ''}`,
              text: `云量 ${cloudText(scene.cloudCover)}`,
            }),
            h('span', { class: 'gm-card-id', text: `${tileOf(scene.id)} · 10 m` }),
          ),
        ),
      ),
      h('button', {
        class: 'gm-card-info',
        type: 'button',
        title: '查看详情与下载',
        'aria-label': '查看详情与下载',
        text: 'i',
        onclick: (e: Event) => {
          e.stopPropagation();
          deps.onDetail(scene.id);
        },
      }),
    );
  }

  function render(): void {
    const scenes = deps.getScenes();
    const selectedId = deps.getSelectedId();
    const query = deps.getQuery();
    const bestId = deps.getBestId();

    const key = `${scenes.map((s) => s.id).join(',')}|${selectedId}|${query.status}|${bestId}|${query.fromCache}`;
    if (key === lastKey) return;
    lastKey = key;

    const count = scenes.length;
    replace(
      head,
      h('span', { class: 'gm-list-title', text: count ? `共 ${count} 景` : '检索结果' }),
      query.fromCache ? h('i', { class: 'gm-tag', text: '缓存' }) : null,
      query.truncated ? h('i', { class: 'gm-tag', text: '仅显示首 100 景' }) : null,
      query.status === 'loading' ? h('i', { class: 'gm-tag is-loading', text: '检索中…' }) : null,
    );

    replace(body);

    if (query.status === 'loading' && count === 0) {
      for (let i = 0; i < 4; i += 1) body.appendChild(h('div', { class: 'gm-card gm-card-skeleton' }));
      return;
    }

    if (query.status === 'error' && count === 0) {
      body.appendChild(
        h(
          'div',
          { class: 'gm-list-empty' },
          h('p', { text: '检索失败，可能是网络波动。' }),
          h('button', { class: 'gm-btn', type: 'button', text: '重试', onclick: () => deps.onRetry() }),
        ),
      );
      return;
    }

    if (!count) {
      body.appendChild(
        h(
          'div',
          { class: 'gm-list-empty' },
          h('p', { text: '该区域在所选条件内没有影像。' }),
          h('p', { class: 'gm-hint', text: '试试：放宽云量 · 扩大时间范围 · 缩小地图范围' }),
        ),
      );
      return;
    }

    const visible = scenes.slice(0, MAX_CARDS);
    const fragment = document.createDocumentFragment();
    let lastDay = '';
    for (const [index, s] of visible.entries()) {
      const day = beijingDayKey(s.datetime);
      if (day !== lastDay) {
        lastDay = day;
        fragment.appendChild(h('div', { class: 'gm-day-sep', text: `${dayLabel(day)} · ${day.slice(0, 4)}` }));
      }
      fragment.appendChild(card(s, index, s.id === selectedId, s.id === bestId));
    }
    body.appendChild(fragment);

    // 让选中项进入视野（列表可能很长）
    const on = body.querySelector<HTMLElement>('.gm-card.is-on');
    if (on && typeof on.scrollIntoView === 'function') {
      on.scrollIntoView({ block: 'nearest' });
    }
  }

  render();
  return { update: render };
}
