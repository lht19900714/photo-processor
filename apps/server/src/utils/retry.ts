/**
 * 重试工具函数
 */

/**
 * 计算指数退避延迟（毫秒）
 * @param attempt 当前尝试次数（从1开始）
 * @param baseDelay 基础延迟（毫秒，默认1000ms）
 * @param maxDelay 最大延迟（毫秒，默认30000ms）
 * @returns 延迟时间（毫秒）
 */
export function calculateDelay(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000
): number {
  // 指数退避: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

  // 添加随机抖动（±20%）以避免雷鸣群效应
  const jitter = exponentialDelay * (0.8 + Math.random() * 0.4);

  // 限制最大延迟
  return Math.min(Math.floor(jitter), maxDelay);
}

/**
 * 睡眠函数
 * @param ms 毫秒数
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
