/** 极简 DOM 助手：全站组件都用它建节点，避免手写 innerHTML 带来的注入与转义风险。 */

export type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

const EVENT_RE = /^on[a-z]/i;

export function append(el: Element | DocumentFragment, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** 清空后重新填充（允许 null 子节点） */
export function replace(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, ...children);
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') el.className = String(v);
      else if (k === 'text') el.textContent = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v as object);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v as Record<string, string>);
      else if (EVENT_RE.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, ...children);
  return el;
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  append(f, ...children);
  return f;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

/** 创建 SVG 图标（少量路径内联，避免引入图标库） */
export function icon(path: string, size = 16): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

export const ICONS = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2',
  close: 'M6 6l12 12M18 6L6 18',
  locate: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z M12 10a2 2 0 1 0 0 .01',
  download: 'M12 3v12m0 0l4-4m-4 4l-4-4M4 21h16',
  external: 'M14 4h6v6M20 4l-9 9M10 5H5v14h14v-5',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
} as const;
