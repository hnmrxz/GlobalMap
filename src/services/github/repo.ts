/** GitHub 仓库元信息：给"关于"面板提供 stars / forks / 最近更新。任一失败都静默降级。 */
import { config } from '../../config';

export interface RepoInfo {
  stars: number;
  forks: number;
  /** 最近一次 push 的 ISO 时间 */
  pushedAt: string;
  url: string;
  description: string;
}

interface RawRepo {
  stargazers_count?: number;
  forks_count?: number;
  pushed_at?: string;
  html_url?: string;
  description?: string | null;
}

export const REPO_URL = config.repoUrl;

/** 免登录读取公开仓库信息；60 次/小时限流，仅打开关于面板时调用 */
export async function fetchRepoInfo(signal?: AbortSignal): Promise<RepoInfo> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(config.repoApi, {
      signal: ctrl.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as RawRepo;
    return {
      stars: j.stargazers_count ?? 0,
      forks: j.forks_count ?? 0,
      pushedAt: j.pushed_at ?? '',
      url: j.html_url || REPO_URL,
      description: j.description || '',
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
