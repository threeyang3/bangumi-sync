export function parseYaml(input: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const lines = input.split('\n');
	let currentListKey: string | null = null;

	for (const rawLine of lines) {
		if (!rawLine.trim()) {
			continue;
		}

		const listItemMatch = rawLine.match(/^\s*-\s*(.+)$/);
		if (listItemMatch && currentListKey) {
			const current = result[currentListKey];
			if (Array.isArray(current)) {
				current.push(listItemMatch[1].trim().replace(/^"|"$/g, ''));
			}
			continue;
		}

		const fieldMatch = rawLine.match(/^([^:]+):\s*(.*)$/);
		if (!fieldMatch) {
			currentListKey = null;
			continue;
		}

		const key = fieldMatch[1].trim();
		const value = fieldMatch[2].trim();
		if (!value) {
			result[key] = [];
			currentListKey = key;
			continue;
		}

		currentListKey = null;
		if (/^\d+$/.test(value)) {
			result[key] = Number(value);
		} else if (value === 'true' || value === 'false') {
			result[key] = value === 'true';
		} else {
			result[key] = value.replace(/^"|"$/g, '');
		}
	}

	return result;
}
