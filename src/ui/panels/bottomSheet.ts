/** 移动端底部抽屉：三档高度（peek / half / full），点击手柄循环 + 上滑/下滑切换。 */
export type SheetState = 'peek' | 'half' | 'full';

const ORDER: SheetState[] = ['peek', 'half', 'full'];

export interface SheetOptions {
  app: HTMLElement;
  handle: HTMLElement;
  getState: () => SheetState;
  onChange: (s: SheetState) => void;
}

export function createSheet(opts: SheetOptions): { set(s: SheetState): void; cycle(): void; step(dir: 1 | -1): void } {
  let startY: number | null = null;
  let moved = 0;

  function isMobile(): boolean {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
  }

  function set(s: SheetState): void {
    opts.app.dataset.sheet = s;
    opts.onChange(s);
  }

  function step(dir: 1 | -1): void {
    const cur = ORDER.indexOf(opts.getState());
    const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, cur + dir))];
    if (next && next !== opts.getState()) set(next);
  }

  function cycle(): void {
    const cur = ORDER.indexOf(opts.getState());
    const next = ORDER[(cur + 1) % ORDER.length];
    if (next) set(next);
  }

  opts.handle.addEventListener('click', () => {
    if (!isMobile()) return;
    cycle();
  });

  opts.handle.addEventListener('pointerdown', (e) => {
    if (!isMobile()) return;
    startY = e.clientY;
    moved = 0;
    opts.handle.setPointerCapture(e.pointerId);
  });

  opts.handle.addEventListener('pointermove', (e) => {
    if (startY === null) return;
    moved = e.clientY - startY;
  });

  opts.handle.addEventListener('pointerup', () => {
    if (startY === null) return;
    const dy = moved;
    startY = null;
    moved = 0;
    if (Math.abs(dy) < 28) return; // 视为点击，交给 click 处理
    step(dy < 0 ? 1 : -1);
  });

  opts.handle.addEventListener('pointercancel', () => {
    startY = null;
    moved = 0;
  });

  set(opts.getState());
  return { set, cycle, step };
}
