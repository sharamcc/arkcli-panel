// 带稳定错误码的业务异常：前端按 code 做本地化，message 保留中文兜底
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorCodeOf(err: unknown, fallback = 'internal'): string {
  return err instanceof AppError ? err.code : fallback;
}
