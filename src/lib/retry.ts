// 保存/上传类请求的自动重试：网络抖动或服务器 5xx/429 时自动重试，
// 业务错误（权限不足、校验失败、唯一冲突等）不重试、原样返回给页面提示。
// 重试后仍失败且属于网络问题时，把错误信息换成中文提示，页面原样显示即可。
const HINT = '网络不稳定，没存上——换个 Wi-Fi 或用流量再试一次';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isTransient(e: any): boolean {
  if (!e) return false;
  const st = (e as any).status ?? (e as any).statusCode;
  if (typeof st === 'number' && !Number.isNaN(st)) return st >= 500 || st === 408 || st === 429;
  if (typeof st === 'string' && /^\d+$/.test(st)) {
    const n = Number(st);
    return n >= 500 || n === 408 || n === 429;
  }
  // 带 Postgres/PostgREST 业务错误码的，是业务错误，不重试
  if (typeof (e as any).code === 'string' && (e as any).code.length > 0) return false;
  const msg = String((e as any).message ?? '');
  return /fetch|network|timeout|timed out|abort|load failed/i.test(msg);
}

export async function withRetry<T extends { error?: any }>(
  fn: () => PromiseLike<T>,
  tries = 3,
): Promise<T> {
  let last: T | undefined;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fn();
      if (!r?.error) return r;
      last = r;
      if (!isTransient(r.error)) return r;
    } catch (e: any) {
      // 抛出的异常多为网络层失败（fetch 没发出去/超时）
      if (i === tries - 1) {
        if (e && typeof e === 'object') e.message = HINT;
        throw e;
      }
    }
    if (i < tries - 1) await sleep(i === 0 ? 700 : 1800);
  }
  if (last?.error) last.error.message = HINT;
  return last!;
}
