/** 唯一的 HTTP 出口：超时、取消、错误分类。所有网络请求都必须经过这里。 */

export type HttpErrorKind = 'network' | 'http' | 'timeout' | 'abort' | 'parse';

export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  readonly status?: number;

  constructor(kind: HttpErrorKind, message: string, status?: number) {
    super(message);
    this.name = 'HttpError';
    this.kind = kind;
    this.status = status;
  }

  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || (this.kind === 'http' && (this.status ?? 0) >= 500);
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

interface Ctx {
  ctrl: AbortController;
  timedOut: boolean;
  cleanup: () => void;
}

function begin(opts: RequestOptions, timeoutMs: number): Ctx {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  return {
    ctrl,
    get timedOut() {
      return timedOut;
    },
    cleanup: () => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    },
  } as Ctx;
}

function toHttpError(err: unknown, ctx: Ctx, ext: AbortSignal | undefined): HttpError {
  if (err instanceof HttpError) return err;
  const name = (err as { name?: string })?.name;
  if (name === 'AbortError') {
    if (ext?.aborted) return new HttpError('abort', '请求已取消');
    return new HttpError('timeout', ctx.timedOut ? '请求超时' : '请求被中断');
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new HttpError('network', msg);
}

export async function getJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const ctx = begin(opts, opts.timeoutMs ?? 8000);
  try {
    const res = await fetch(url, {
      signal: ctx.ctrl.signal,
      headers: { Accept: 'application/json', ...opts.headers },
      mode: 'cors',
      credentials: 'omit',
    });
    if (!res.ok) throw new HttpError('http', `HTTP ${res.status}`, res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new HttpError('parse', '响应不是合法 JSON');
    }
  } catch (err) {
    throw toHttpError(err, ctx, opts.signal);
  } finally {
    ctx.cleanup();
  }
}

export async function getBlob(url: string, opts: RequestOptions = {}): Promise<Blob> {
  const ctx = begin(opts, opts.timeoutMs ?? 12000);
  try {
    const res = await fetch(url, {
      signal: ctx.ctrl.signal,
      mode: 'cors',
      credentials: 'omit',
    });
    if (!res.ok) throw new HttpError('http', `HTTP ${res.status}`, res.status);
    return await res.blob();
  } catch (err) {
    throw toHttpError(err, ctx, opts.signal);
  } finally {
    ctx.cleanup();
  }
}

export function isAbort(err: unknown): boolean {
  return err instanceof HttpError && err.kind === 'abort';
}
