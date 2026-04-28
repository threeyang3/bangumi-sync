/**
 * Shared value helpers
 */

/**
 * Safely convert any value to a string.
 * Avoids "[object Object]" surprises for structured data.
 */
export function safeStringify(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return JSON.stringify(value);
}
