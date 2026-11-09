/** 统一提示条：所有提示都从这里出，避免 toast 满天飞。 */
import type { Banner } from '../../domain/types';
import { h, replace } from '../dom';

export function mountBanner(host: HTMLElement): { update(banner: Banner | null): void } {
  const root = h('div', { class: 'gm-banner', hidden: true });

  function update(banner: Banner | null): void {
    if (!banner) {
      root.hidden = true;
      replace(root);
      return;
    }
    root.className = `gm-banner gm-banner-${banner.kind}`;
    replace(
      root,
      h('span', { class: 'gm-banner-msg', text: banner.msg }),
      banner.actionLabel && banner.action
        ? h('button', {
            class: 'gm-banner-act',
            type: 'button',
            text: banner.actionLabel,
            onclick: (e: Event) => {
              e.stopPropagation();
              banner.action?.();
            },
          })
        : null,
      h('button', {
        class: 'gm-banner-x',
        type: 'button',
        'aria-label': '关闭提示',
        text: '×',
        onclick: () => update(null),
      }),
    );
    root.hidden = false;
  }

  host.appendChild(root);
  return { update };
}
