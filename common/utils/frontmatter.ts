/**
 * Frontmatter helpers
 */

export function getFrontmatterRecord(frontmatter: unknown): Record<string, unknown> | null {
	if (typeof frontmatter !== 'object' || frontmatter === null) {
		return null;
	}

	return frontmatter as Record<string, unknown>;
}

export function getFrontmatterString(frontmatter: Record<string, unknown> | null | undefined, key: string): string | undefined {
	const value = frontmatter?.[key];
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getFrontmatterNumber(frontmatter: Record<string, unknown> | null | undefined, key: string): number | undefined {
	const value = frontmatter?.[key];
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

export function getFrontmatterStringArray(frontmatter: Record<string, unknown> | null | undefined, key: string): string[] {
	const value = frontmatter?.[key];
	if (Array.isArray(value)) {
		return value.map(item => String(item).trim()).filter(Boolean);
	}
	if (typeof value === 'string' && value.trim()) {
		return value.split(',').map(item => item.trim()).filter(Boolean);
	}
	return [];
}
