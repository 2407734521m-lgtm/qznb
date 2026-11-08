// 保存/上传类请求的自动重试：网络抖动或服务器 5xx/429 时自动重试，
// 业务错误（权限不足、校验失败、唯一冲突等）不重试、原样返回给页面提示。
// 重试后仍失败且属于网络问题时，把错误信息换成中文提示，页面原样显示即可。
const HINT = '网络不稳定，没存上——换个 Wi-Fi 或用流量再试一次';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTransient(error: unknown): boolean {
  if (!isRecord(error)) return false;

  const status = error.status ?? error.statusCode;
  if (typeof status === 'number' && !Number.isNaN(status)) {
    return status >= 500 || status === 408 || status === 429;
  }
  if (typeof status === 'string' && /^\d+$/.test(status)) {
    const numericStatus = Number(status);
    return numericStatus >= 500 || numericStatus === 408 || numericStatus === 429;
  }

  // 带 Postgres/PostgREST 业务错误码的，是业务错误，不重试。
  if (typeof error.code === 'string' && error.code.length > 0) return false;
  const message = typeof error.message === 'string' ? error.message : '';
  return /fetch|network|timeout|timed out|abort|load failed/i.test(message);
}

function applyNetworkHint(error: unknown): void {
  if (error instanceof Error) {
    error.message = HINT;
    return;
  }
  if (isRecord(error)) error.message = HINT;
}

export async function withRetry<T extends { error?: unknown }>(
  fn: () => PromiseLike<T>,
  tries = 3,
): Promise<T> {
  let last: T | undefined;
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const result = await fn();
      if (!result?.error) return result;
      last = result;
      if (!isTransient(result.error)) return result;
    } catch (error: unknown) {
      // 抛出的异常多为网络层失败（fetch 没发出去/超时）。
      if (attempt === tries - 1) {
        applyNetworkHint(error);
        throw error;
      }
    }
    if (attempt < tries - 1) {
      await sleep(attempt === 0 ? 700 : 1800);
    }
  }

  if (last?.error) applyNetworkHint(last.error);
  return last!;
}
