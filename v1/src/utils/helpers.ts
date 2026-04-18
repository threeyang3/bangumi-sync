/**
 * 通用辅助函数
 */

/**
 * 延迟执行
 */
export function delay(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试函数
 */
export async function retry<T>(
	fn: () => Promise<T>,
	options?: {
		maxRetries?: number;
		delay?: number;
		onRetry?: (attempt: number, error: Error) => void;
	}
): Promise<T> {
	const maxRetries = options?.maxRetries ?? 3;
	const delayMs = options?.delay ?? 1000;

	let lastError: Error | null = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (options?.onRetry) {
				options.onRetry(attempt, lastError);
			}

			if (attempt < maxRetries) {
				await delay(delayMs * attempt);
			}
		}
	}

	throw lastError;
}

/**
 * 批量处理
 */
export async function batchProcess<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	options?: {
		batchSize?: number;
		delay?: number;
		onProgress?: (current: number, total: number) => void;
	}
): Promise<R[]> {
	const batchSize = options?.batchSize ?? 10;
	const delayMs = options?.delay ?? 100;
	const results: R[] = [];

	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.all(batch.map(fn));
		results.push(...batchResults);

		if (options?.onProgress) {
			options.onProgress(Math.min(i + batchSize, items.length), items.length);
		}

		if (i + batchSize < items.length && delayMs > 0) {
			await delay(delayMs);
		}
	}

	return results;
}

/**
 * 清理文件名
 */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[<>:"/\\|?*]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * 格式化日期
 */
export function formatDate(date: Date | string | null): string {
	if (!date) return '';

	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleString('zh-CN', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/**
 * 格式化持续时间
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}小时${minutes % 60}分钟`;
	}
	if (minutes > 0) {
		return `${minutes}分钟${seconds % 60}秒`;
	}
	return `${seconds}秒`;
}
