const FILE_NAME_REPLACEMENTS: Readonly<Record<string, string>> = {
	'<': '＜',
	'>': '＞',
	':': '：',
	'"': '＂',
	'/': '／',
	'\\': '＼',
	'|': '｜',
	'?': '？',
	'*': '＊',
};

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const DEFAULT_MAX_SEGMENT_LENGTH = 120;

function stableHash(value: string): string {
	let hash = 0x811c9dc5;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

function truncateSegment(value: string, maxLength: number): string {
	if (value.length <= maxLength) {
		return value;
	}

	const suffix = `［${stableHash(value)}］`;
	const budget = Math.max(1, maxLength - suffix.length);
	let prefix = '';
	for (const character of value) {
		if ((prefix + character).length > budget) break;
		prefix += character;
	}
	return prefix + suffix;
}

export function limitPathLength(path: string, maxLength = 240): string {
	const normalized = normalizePathValue(path);
	if (normalized.length <= maxLength) return normalized;
	const slash = normalized.lastIndexOf('/');
	const directory = slash >= 0 ? normalized.slice(0, slash + 1) : '';
	const filename = slash >= 0 ? normalized.slice(slash + 1) : normalized;
	const extensionIndex = filename.lastIndexOf('.');
	const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : '';
	const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
	let safeDirectory = directory;
	if ((safeDirectory + extension).length > maxLength - 16) {
		const root = normalized.split('/')[0];
		safeDirectory = root && root !== filename
			? `${root}/＿路径［${stableHash(directory)}］/`
			: '';
	}
	const available = Math.max(1, maxLength - (safeDirectory + extension).length);
	return `${safeDirectory}${truncateSegment(stem, available)}${extension}`;
}

export function sanitizeFileName(
	name: string,
	fallback = 'untitled',
	maxLength = DEFAULT_MAX_SEGMENT_LENGTH,
): string {
	let sanitized = name.normalize('NFC')
		.replace(/[<>:"/\\|?*]/g, character => FILE_NAME_REPLACEMENTS[character])
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.replace(/[. ]+$/g, suffix => suffix
			.replace(/\./g, '．')
			.replace(/ /g, '　'));

	if (!sanitized || /^[.\s　．]+$/u.test(sanitized)) {
		const normalizedFallback = fallback.normalize('NFC').trim();
		if (!normalizedFallback && fallback === '') {
			return '';
		}
		sanitized = normalizedFallback || 'untitled';
	}

	if (WINDOWS_RESERVED_NAME.test(sanitized)) {
		sanitized = `${sanitized}＿`;
	}

	return truncateSegment(sanitized, maxLength);
}

export function normalizePathValue(path: string): string {
	return path
		.normalize('NFC')
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/')
		.replace(/^\.\//, '')
		.replace(/\/$/, '');
}

export function normalizePathCollisionKey(path: string): string {
	return normalizePathValue(path)
		.normalize('NFKC')
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/')
		.split('/')
		.map(segment => segment.replace(/[. ]+$/g, '').toLocaleLowerCase('en-US'))
		.join('/');
}

export function isDescendantPath(filePath: string, folderPath: string): boolean {
	const normalizedFile = normalizePathValue(filePath);
	const normalizedFolder = normalizePathValue(folderPath);
	if (!normalizedFolder) {
		return true;
	}
	return normalizedFile === normalizedFolder || normalizedFile.startsWith(`${normalizedFolder}/`);
}
