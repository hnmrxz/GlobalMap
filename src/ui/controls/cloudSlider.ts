/** 云量筛选：0–100 的滑杆 + 明确免责文案（整景平均 ≠ 目标区无云）。 */
import { h } from '../dom';

export interface CloudSliderOptions {
  value: number;
  onChange: (v: number) => void;
}

export function mountCloudSlider(host: HTMLElement, opts: CloudSliderOptions): { set(v: number): void } {
  const value = h('b', { class: 'gm-cloud-val', text: `${opts.value}%` });
  const range = h('input', {
    class: 'gm-range',
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
    value: String(opts.value),
    'aria-label': '云量上限',
    oninput: (e: Event) => {
      value.textContent = `${(e.target as HTMLInputElement).value}%`;
    },
    onchange: (e: Event) => {
      opts.onChange(Number((e.target as HTMLInputElement).value));
    },
  });

  const el = h(
    'div',
    { class: 'gm-sec' },
    h('div', { class: 'gm-sec-head' }, h('span', { text: '云量上限' }), value),
    range,
    h('p', {
      class: 'gm-hint',
      text: '云量是整景平均（约 110×110 km），目标区域仍可能被云遮挡。',
    }),
  );

  host.appendChild(el);

  return {
    set(v: number) {
      range.value = String(v);
      value.textContent = `${Math.round(v)}%`;
    },
  };
}
