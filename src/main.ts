import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import { createApp } from './app/createApp';

function dismissBoot(): void {
  const bootEl = document.getElementById('boot');
  if (!bootEl) return;
  bootEl.style.opacity = '0';
  window.setTimeout(() => bootEl.remove(), 280);
}

function fail(err: unknown): void {
  console.error('[globlemap] init failed', err);
  const bootEl = document.getElementById('boot');
  if (!bootEl) return;
  bootEl.replaceChildren();
  const box = document.createElement('div');
  box.style.cssText = 'padding:24px;max-width:420px;font-size:13px;line-height:1.7;color:#f87171';
  box.textContent = `页面初始化失败：${err instanceof Error ? err.message : String(err)}`;
  bootEl.appendChild(box);
}

try {
  const app = createApp();
  dismissBoot();
  if (import.meta.hot) import.meta.hot.dispose(() => app.destroy());
} catch (err) {
  fail(err);
}
