/** "仅 Sentinel-2A" 开关。默认关闭：单星约 10 天重访，全星座约 2–3 天。 */
import type { PlatformFilter } from '../../domain/types';
import { h } from '../dom';

export interface PlatformToggleOptions {
  value: PlatformFilter;
  onChange: (v: PlatformFilter) => void;
}

export function mountPlatformToggle(
  host: HTMLElement,
  opts: PlatformToggleOptions,
): { set(v: PlatformFilter): void } {
  const btn = h(
    'button',
    {
      class: `gm-switch${opts.value === '2a' ? ' is-on' : ''}`,
      type: 'button',
      'aria-pressed': opts.value === '2a' ? 'true' : 'false',
      onclick: () => {
        const next: PlatformFilter = btn.classList.contains('is-on') ? 'all' : '2a';
        opts.onChange(next);
      },
    },
    h('i', {}),
    h('span', { text: '仅 Sentinel-2A' }),
  );

  host.appendChild(
    h(
      'div',
      { class: 'gm-sec' },
      h('div', { class: 'gm-sec-head' }, h('span', { text: '卫星平台' }), h('em', { class: 'gm-sec-sub', text: '2A/2B/2C 合计约 2–3 天重访' })),
      btn,
    ),
  );

  return {
    set(v: PlatformFilter) {
      const on = v === '2a';
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    },
  };
}
