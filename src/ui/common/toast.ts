/** 轻量土司提示（只用于"已复制链接"这类一次性反馈）。 */
import { h } from '../dom';

export function createToast(host: HTMLElement): { show(msg: string, kind?: 'ok' | 'warn' | 'error'): void } {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function show(msg: string, kind: 'ok' | 'warn' | 'error' = 'ok'): void {
    if (timer) clearTimeout(timer);
    host.replaceChildren(h('div', { class: `gm-toast gm-toast-${kind}`, text: msg }));
    timer = setTimeout(() => {
      host.replaceChildren();
      timer = null;
    }, 2600);
  }

  return { show };
}
