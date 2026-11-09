/** 时间控件：区间预设 + 自定义日期 + 底部时间轴（滑杆 + 成像日期密度）。 */
import { addDaysISO, formatBeijing, todayISO, uniqueDays } from '../../domain/dates';
import { cloudText } from '../../domain/scene';
import type { Scene } from '../../domain/types';
import { h } from '../dom';

const PRESETS = [7, 30, 90, 365] as const;

export interface RangeFilterOptions {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

export function mountRangeFilter(host: HTMLElement, opts: RangeFilterOptions): { set(from: string, to: string): void } {
  const label = h('em', { class: 'gm-sec-sub' });
  const fromInput = h('input', { class: 'gm-date', type: 'date', value: opts.from, 'aria-label': '起始日期' });
  const toInput = h('input', { class: 'gm-date', type: 'date', value: opts.to, 'aria-label': '结束日期' });
  const chips: HTMLButtonElement[] = [];

  function paint(): void {
    label.textContent = `${fromInput.value} → ${toInput.value}`;
    const days =
      Math.round(
        (Date.parse(`${toInput.value}T00:00:00Z`) - Date.parse(`${fromInput.value}T00:00:00Z`)) / 86400000,
      ) + 1;
    for (const [i, p] of PRESETS.entries()) {
      const chip = chips[i];
      if (chip) chip.classList.toggle('is-on', days === p);
    }
  }

  function emit(): void {
    let from = fromInput.value;
    let to = toInput.value;
    if (!from || !to) return;
    if (from > to) [from, to] = [to, from];
    fromInput.value = from;
    toInput.value = to;
    paint();
    opts.onChange(from, to);
  }

  const chipRow = h('div', { class: 'gm-chips' });
  for (const p of PRESETS) {
    const chip = h('button', {
      class: 'gm-chip',
      type: 'button',
      text: p === 365 ? '近一年' : `近 ${p} 天`,
      onclick: () => {
        const to = todayISO();
        const from = addDaysISO(to, -(p - 1));
        fromInput.value = from;
        toInput.value = to;
        emit();
      },
    });
    chips.push(chip);
    chipRow.appendChild(chip);
  }

  fromInput.addEventListener('change', emit);
  toInput.addEventListener('change', emit);

  host.appendChild(
    h(
      'div',
      { class: 'gm-sec' },
      h('div', { class: 'gm-sec-head' }, h('span', { text: '时间范围' }), label),
      chipRow,
      h('div', { class: 'gm-dates' }, fromInput, h('span', { class: 'gm-dash', text: '→' }), toInput),
    ),
  );
  paint();

  return {
    set(from, to) {
      fromInput.value = from;
      toInput.value = to;
      paint();
    },
  };
}

export interface TimelineDeps {
  getScenes(): Scene[];
  getSelectedId(): string | null;
  onPick(sceneId: string): void;
}

export function mountTimeline(host: HTMLElement, deps: TimelineDeps): { update(): void } {
  const title = h('b', { class: 'gm-rail-title', text: '时间轴' });
  const value = h('span', { class: 'gm-rail-val', text: '暂无影像' });
  const slider = h('input', {
    class: 'gm-range gm-range-rail',
    type: 'range',
    min: '0',
    max: '0',
    step: '1',
    value: '0',
    'aria-label': '按时间选择影像',
  });
  const density = h('div', { class: 'gm-rail-density', 'aria-hidden': 'true' });
  const root = h(
    'div',
    { class: 'gm-rail-inner' },
    h('div', { class: 'gm-rail-head' }, title, value),
    h('div', { class: 'gm-rail-track' }, slider, density),
  );
  host.appendChild(root);

  let scenes: Scene[] = [];

  function pickIndex(i: number): void {
    // 滑杆左→右 = 旧→新（符合直觉），scenes 是降序，因此倒序取
    const idx = scenes.length - 1 - i;
    const scene = scenes[idx];
    if (scene) deps.onPick(scene.id);
  }

  function paintDensity(): void {
    density.replaceChildren();
    if (!scenes.length) return;
    const n = Math.min(60, scenes.length);
    for (let k = 0; k < n; k += 1) {
      const s = scenes[Math.round((k / Math.max(1, n - 1)) * (scenes.length - 1))];
      if (!s) continue;
      // 柱高与透明度同时表达"这一景有多干净"，云越多越矮越淡
      const clarity = Math.max(0.16, 1 - s.cloudCover / 100);
      density.appendChild(
        h('i', {
          class: 'gm-rail-bar',
          style: {
            height: `${Math.round(28 + clarity * 72)}%`,
            opacity: String(0.3 + clarity * 0.7),
          },
        }),
      );
    }
  }

  function update(): void {
    scenes = deps.getScenes();
    const days = uniqueDays(scenes);
    const selectedId = deps.getSelectedId();
    const idx = scenes.findIndex((s) => s.id === selectedId);
    const n = scenes.length;
    slider.disabled = n === 0;
    slider.max = String(Math.max(0, n - 1));
    slider.value = String(idx >= 0 ? n - 1 - idx : Math.max(0, n - 1));
    const cur = idx >= 0 ? scenes[idx] : scenes[0];
    const compact = typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
    value.textContent = cur
      ? compact
        ? `${formatBeijing(cur.datetime).slice(5)} · 云量 ${cloudText(cur.cloudCover)}`
        : `${formatBeijing(cur.datetime)} · 云量 ${cloudText(cur.cloudCover)}${days.length > 1 ? ` · 共 ${n} 景` : ''}`
      : '暂无影像';
    paintDensity();
  }

  slider.addEventListener('input', () => pickIndex(Number(slider.value)));
  update();

  return { update };
}
