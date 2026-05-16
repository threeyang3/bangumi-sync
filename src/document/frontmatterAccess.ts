function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripQuotedValue(value: string): string {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

function isTopLevelFrontmatterLine(line: string): boolean {
	return /^[^\s-][^:]*:\s*/.test(line);
}

function formatFrontmatterValue(value: unknown): string {
	if (typeof value === 'string') {
		if (value.includes('\n')) {
			return `|-\n${value.split('\n').map(line => `  ${line}`).join('\n')}`;
		}
		if (
			value.includes(':') || value.includes('#') ||
			value.includes('"') || value.includes("'") || value.includes('[') || value.includes('{')
		) {
			return `"${value.replace(/"/g, '\\"')}"`;
		}
		return value;
	}

	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}

	if (typeof value === 'number') {
		return String(value);
	}

	if (Array.isArray(value)) {
		return `\n${value.map(item => `  - ${formatFrontmatterValue(item)}`).join('\n')}`;
	}

	if (typeof value === 'object' && value !== null) {
		return JSON.stringify(value);
	}

	return String(value);
}

function serializeFrontmatterField(field: string, value: unknown): string[] {
	const formattedValue = formatFrontmatterValue(value);
	if (formattedValue.startsWith('|-\n')) {
		const [firstLine, ...restLines] = formattedValue.split('\n');
		return [`${field}: ${firstLine}`, ...restLines];
	}
	if (formattedValue.startsWith('\n')) {
		return [`${field}:`, ...formattedValue.slice(1).split('\n')];
	}
	return [`${field}: ${formattedValue}`];
}

function parseFrontmatterBlock(content: string): {
	prefix: string;
	frontmatter: string;
	suffix: string;
	rest: string;
	match: string;
} | null {
	const frontmatterMatch = content.match(/^(---\n)([\s\S]*?)(\n---)([\s\S]*)$/);
	if (!frontmatterMatch) {
		return null;
	}

	return {
		prefix: frontmatterMatch[1],
		frontmatter: frontmatterMatch[2],
		suffix: frontmatterMatch[3],
		rest: frontmatterMatch[4],
		match: frontmatterMatch[0],
	};
}

function upsertFrontmatterBody(frontmatter: string, field: string, value: unknown): string {
	const lines = frontmatter.split('\n');
	const startIndex = lines.findIndex(line => line.startsWith(`${field}:`));
	const fieldLines = serializeFrontmatterField(field, value);

	if (startIndex === -1) {
		return `${frontmatter}\n${fieldLines.join('\n')}`;
	}

	let endIndex = lines.length;
	for (let i = startIndex + 1; i < lines.length; i++) {
		if (isTopLevelFrontmatterLine(lines[i])) {
			endIndex = i;
			break;
		}
	}

	return [
		...lines.slice(0, startIndex),
		...fieldLines,
		...lines.slice(endIndex),
	].join('\n');
}

export function extractFrontmatter(content: string): string | null {
	const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
	return frontmatterMatch ? frontmatterMatch[1] : null;
}

export function hasFrontmatterField(content: string, field: string): boolean {
	const frontmatter = extractFrontmatter(content);
	if (!frontmatter) {
		return false;
	}

	const fieldRegex = new RegExp(`^${escapeRegExp(field)}:`, 'm');
	return fieldRegex.test(frontmatter);
}

export function getFrontmatterValue(content: string, field: string): string | undefined {
	const frontmatter = extractFrontmatter(content);
	if (!frontmatter) {
		return undefined;
	}

	const lines = frontmatter.split('\n');
	const fieldPrefix = `${field}:`;
	const startIndex = lines.findIndex(line => line.startsWith(fieldPrefix));
	if (startIndex === -1) {
		return undefined;
	}

	const inlineValue = lines[startIndex].slice(fieldPrefix.length).trim();
	if (inlineValue) {
		return stripQuotedValue(inlineValue);
	}

	const listItems: string[] = [];
	for (let i = startIndex + 1; i < lines.length; i++) {
		const line = lines[i];
		if (isTopLevelFrontmatterLine(line)) {
			break;
		}
		const listMatch = line.match(/^\s*-\s*(.*)$/);
		if (listMatch) {
			listItems.push(stripQuotedValue(listMatch[1].trim()));
			continue;
		}
		if (line.trim() && !/^\s/.test(line)) {
			break;
		}
	}

	return listItems.length > 0 ? listItems.join(', ') : '';
}

export function upsertFrontmatterField(content: string, field: string, value: unknown): string {
	const block = parseFrontmatterBlock(content);
	if (!block) {
		return content;
	}

	const nextFrontmatter = upsertFrontmatterBody(block.frontmatter, field, value);
	return block.prefix + nextFrontmatter + block.suffix + block.rest;
}

export function addFrontmatterField(content: string, field: string, value: unknown): string {
	const block = parseFrontmatterBlock(content);
	if (!block) {
		return content;
	}

	const entry = serializeFrontmatterField(field, value).join('\n');
	const newFrontmatter = `${block.frontmatter}\n${entry}`;
	return block.prefix + newFrontmatter + block.suffix + block.rest;
}

export function readTextField(content: string, fieldNames: string | string[]): string | null {
	const frontmatter = extractFrontmatter(content);
	if (!frontmatter) {
		return null;
	}

	const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
	for (const fieldName of names) {
		const escapedName = escapeRegExp(fieldName);
		const fieldRegex = new RegExp(`^${escapedName}:\\s*(.*)$`, 'm');
		const match = frontmatter.match(fieldRegex);
		if (!match) {
			continue;
		}

		const rawValue = match[1].trim();
		if (!rawValue) {
			return null;
		}

		const unquoted = rawValue.replace(/^["']|["']$/g, '').trim();
		return unquoted.length > 0 ? unquoted : null;
	}

	return null;
}

export function readNumberField(content: string, fieldNames: string | string[]): number | null {
	const value = readTextField(content, fieldNames);
	if (!value) {
		return null;
	}

	const numberMatch = value.match(/\d+/);
	if (!numberMatch) {
		return null;
	}

	const parsed = parseInt(numberMatch[0], 10);
	return Number.isFinite(parsed) ? parsed : null;
}

export function upsertQuotedTextField(
	content: string,
	fieldName: string,
	value: string | number | null | undefined,
): string {
	const block = parseFrontmatterBlock(content);
	if (!block) {
		return content;
	}

	const escapedName = escapeRegExp(fieldName);
	const fieldRegex = new RegExp(`^${escapedName}:.*$`, 'm');
	let frontmatter = block.frontmatter;

	if (value === null || value === undefined || String(value).trim() === '') {
		frontmatter = frontmatter.replace(fieldRegex, '').replace(/\n{3,}/g, '\n\n').trim();
		return block.prefix + frontmatter + block.suffix + block.rest;
	}

	const nextLine = `${fieldName}: "${String(value).replace(/"/g, '\\"')}"`;
	if (fieldRegex.test(frontmatter)) {
		frontmatter = frontmatter.replace(fieldRegex, nextLine);
	} else {
		frontmatter = `${frontmatter}\n${nextLine}`;
	}

	return block.prefix + frontmatter + block.suffix + block.rest;
}

function findYamlListBlock(lines: string[], key: string): { start: number; end: number } | null {
	const start = lines.findIndex(line => new RegExp(`^${escapeRegExp(key)}:\\s*$`).test(line));
	if (start === -1) {
		return null;
	}

	let end = start + 1;
	while (end < lines.length && /^\s*-\s+/.test(lines[end])) {
		end++;
	}

	return { start, end };
}

function replaceYamlBlock(lines: string[], key: string, replacement: string[]): string[] {
	const block = findYamlListBlock(lines, key);
	const inlineIndex = lines.findIndex(line => new RegExp(`^${escapeRegExp(key)}:\\s*.*$`).test(line));

	if (block) {
		return [...lines.slice(0, block.start), ...replacement, ...lines.slice(block.end)];
	}

	if (inlineIndex !== -1) {
		return [...lines.slice(0, inlineIndex), ...replacement, ...lines.slice(inlineIndex + 1)];
	}

	return [...lines, ...replacement];
}

function removeYamlBlock(lines: string[], key: string): string[] {
	const block = findYamlListBlock(lines, key);
	if (block) {
		return [...lines.slice(0, block.start), ...lines.slice(block.end)];
	}

	const inlineIndex = lines.findIndex(line => new RegExp(`^${escapeRegExp(key)}:\\s*.*$`).test(line));
	if (inlineIndex !== -1) {
		return [...lines.slice(0, inlineIndex), ...lines.slice(inlineIndex + 1)];
	}

	return lines;
}

export function upsertYamlListField(content: string, field: string, values: string[]): string {
	const block = parseFrontmatterBlock(content);
	if (!block) {
		return content;
	}

	const newTagLines = [`${field}:`, ...values.map(value => `  - ${value}`)];
	const updatedFrontmatter = replaceYamlBlock(block.frontmatter.split('\n'), field, newTagLines).join('\n');
	return block.prefix + updatedFrontmatter + block.suffix + block.rest;
}

export function removeYamlListField(content: string, field: string): string {
	const block = parseFrontmatterBlock(content);
	if (!block) {
		return content;
	}

	const updatedFrontmatter = removeYamlBlock(block.frontmatter.split('\n'), field).join('\n').trim();
	return block.prefix + updatedFrontmatter + block.suffix + block.rest;
}
