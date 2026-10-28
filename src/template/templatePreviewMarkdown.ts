import { parseYaml } from 'obsidian';

/** Display-only projection: never evaluates Dataview queries or writes a preview note. */
export function prepareTemplatePreviewMarkdown(content: string) {
	let properties: Record<string, unknown> = {};
	let yamlError = false;
	const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (frontmatter) {
		try {
			const parsed: unknown = parseYaml(frontmatter[1]);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) properties = parsed as Record<string, unknown>;
		} catch { yamlError = true; }
	}
	let resolved = 0; let unsupported = 0;
	const display = (value: unknown): string => {
		if (Array.isArray(value)) return value.map(display).join(', ') || '—';
		if (value === null || value === undefined || value === '') return '—';
		if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return '—';
		return String(value).replace(/[&<>|`\[\]*_\\]/g, character => `&#${character.charCodeAt(0)};`).replace(/\r?\n/g, '<br>');
	};
	// Keep fenced examples intact, but disable executable Dataview fences in this isolated view.
	let fence: string | undefined;
	const markdown = content.slice(frontmatter?.[0].length ?? 0).split('\n').map(line => {
		const marker = line.match(/^\s*(?:>\s*)*(`{3,}|~{3,})(.*)$/);
		if (marker) {
			if (!fence) {
				fence = marker[1];
				if (/^dataview(?:js)?\s*$/i.test(marker[2].trim())) { unsupported++; return line.replace(/dataview(?:js)?\s*$/i, 'text'); }
			} else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
			return line;
		}
		if (fence) return line;
		return line.replace(/(`+)([^`]*?)\1/g, (whole: string, ticks: string, expression: string) => {
			if (!/^\s*\$?=/.test(expression)) return whole;
			const simple = expression.match(/^\s*=\s*this\.([\p{L}\p{N}_-]+)\s*$/u);
			if (simple && !yamlError) {
				resolved++;
				return display(Object.prototype.hasOwnProperty.call(properties, simple[1]) ? properties[simple[1]] : undefined);
			}
			unsupported++;
			return `${ticks}Dataview: ${expression.trim()}${ticks}`;
		});
	}).join('\n');
	return { markdown, resolved, unsupported, yamlError };
}
