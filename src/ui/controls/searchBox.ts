/** 地名 / 坐标搜索：Nominatim（零 Key），500 ms 防抖 + 键盘可达 + 结果缓存。 */
import type { Bbox } from '../../domain/types';
import { HttpError } from '../../services/http';
import { searchPlaces, shortLabel, type Place } from '../../services/geocode/nominatim';
import { h, icon, ICONS, replace } from '../dom';

export interface SearchBoxOptions {
  placeholder?: string;
  onPick: (target: { lat: number; lon: number; bbox: Bbox | null; label: string }) => void;
}

const COORD_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,，\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export function mountSearchBox(host: HTMLElement, opts: SearchBoxOptions): { focus(): void } {
  const input = h('input', {
    class: 'gm-search-input',
    type: 'search',
    placeholder: opts.placeholder ?? '搜索地名，或输入 39.90,116.40',
    'aria-label': '搜索地名或坐标',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const list = h('div', { class: 'gm-search-list', hidden: true, role: 'listbox' });
  const root = h(
    'div',
    { class: 'gm-search' },
    h('span', { class: 'gm-search-icon' }, icon(ICONS.search, 16)),
    input,
    list,
  );
  host.appendChild(root);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let places: Place[] = [];
  let cursor = -1;

  function close(): void {
    list.hidden = true;
    replace(list);
    places = [];
    cursor = -1;
  }

  function renderRows(): void {
    replace(list);
    if (!places.length) {
      list.appendChild(h('div', { class: 'gm-search-empty', text: '没有找到匹配的地点' }));
      list.hidden = false;
      return;
    }
    places.forEach((p, i) => {
      list.appendChild(
        h(
          'button',
          {
            class: `gm-search-row${i === cursor ? ' is-on' : ''}`,
            type: 'button',
            role: 'option',
            onclick: () => pick(p),
          },
          h('span', { class: 'gm-search-name', text: shortLabel(p.label.split(',')[0] ?? p.label, 40) }),
          h('span', { class: 'gm-search-meta', text: shortLabel(p.label, 64) }),
        ),
      );
    });
    list.hidden = false;
  }

  function pick(p: Place): void {
    opts.onPick({ lat: p.lat, lon: p.lon, bbox: p.bbox, label: p.label });
    input.value = shortLabel(p.label.split(',')[0] ?? p.label, 32);
    close();
  }

  async function run(text: string): Promise<void> {
    controller?.abort();
    controller = new AbortController();
    try {
      places = await searchPlaces(text, { signal: controller.signal });
      cursor = places.length ? 0 : -1;
      renderRows();
    } catch (err) {
      if (err instanceof HttpError && err.kind === 'abort') return;
      replace(list, h('div', { class: 'gm-search-empty', text: '搜索服务暂不可用' }));
      list.hidden = false;
    }
  }

  function schedule(): void {
    const text = input.value.trim();
    if (timer) clearTimeout(timer);

    const m = COORD_RE.exec(text);
    if (m) {
      places = [{ label: `坐标 ${m[1]}, ${m[2]}`, lat: Number(m[1]), lon: Number(m[2]), bbox: null }];
      cursor = 0;
      renderRows();
      return;
    }

    if (text.length < 2) {
      close();
      return;
    }
    timer = setTimeout(() => void run(text), 500);
  }

  input.addEventListener('input', schedule);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      input.blur();
      return;
    }
    if (!places.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      cursor = (cursor + 1) % places.length;
      renderRows();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      cursor = (cursor - 1 + places.length) % places.length;
      renderRows();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const p = places[cursor] ?? places[0];
      if (p) pick(p);
    }
  });
  input.addEventListener('blur', () => setTimeout(close, 160));

  return { focus: () => input.focus() };
}
