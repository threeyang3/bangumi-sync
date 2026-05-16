import { SubjectType } from '../../common/api/types';
import { normalizeShortComment } from '../comment/shortComment';
import { SubjectIdentifier } from './types';

const LIST_LIKE_FIELDS = new Set([
	'tags', 'Tags',
	'版本', '格式', '平台', '存储', '渠道',
	'改编类别', '资源', '收藏来源',
]);

export function mapLegacyRatingField(identifier: SubjectIdentifier, legacyKey: string): string | null {
	const type = identifier.type;
	const workType = identifier.workType?.toLowerCase() ?? '';

	if (type === SubjectType.Anime) {
		return mapRatingFieldByTable(legacyKey, {
			music: '音乐评分',
			character: '人设评分',
			story: '剧情评分',
			art: '美术评分',
		});
	}

	if (type === SubjectType.Game) {
		return mapRatingFieldByTable(legacyKey, {
			story: '剧情评分',
			fun: '趣味评分',
			music: '音乐评分',
			art: '美术评分',
		});
	}

	if (type === SubjectType.Real) {
		return mapRatingFieldByTable(legacyKey, {
			story: '剧情评分',
			character: '演技评分',
			art: '制作评分',
		});
	}

	if (type === SubjectType.Book && workType === 'comic') {
		return mapRatingFieldByTable(legacyKey, {
			story: '剧情评分',
			drawing: '画工评分',
			character: '人设评分',
		});
	}

	if (type === SubjectType.Book && workType === 'album') {
		return mapRatingFieldByTable(legacyKey, {
			story: '剧情评分',
			drawing: '画工评分',
			character: '人设评分',
		});
	}

	return mapRatingFieldByTable(legacyKey, {
		story: '剧情评分',
		illustration: '插画评分',
		writing: '文笔评分',
		character: '人设评分',
	});
}

export function smartMergeImportValues(localValue: unknown, importValue: unknown, fieldName: string): unknown {
	if (isEmptyImportValue(localValue)) {
		return normalizeImportValueForWrite(importValue, fieldName);
	}
	if (isEmptyImportValue(importValue)) {
		return normalizeImportValueForWrite(localValue, fieldName);
	}

	const localArray = toImportArray(localValue, fieldName);
	const importArray = toImportArray(importValue, fieldName);
	if (localArray && importArray) {
		return Array.from(new Set([...localArray, ...importArray]));
	}

	if (typeof localValue === 'string' && typeof importValue === 'string') {
		return mergeSectionValues(localValue, importValue);
	}

	return normalizeImportValueForWrite(importValue, fieldName);
}

export function mergeSectionValues(localValue: string | null | undefined, importValue: string | undefined): string {
	const localText = (localValue ?? '').trim();
	const importText = (importValue ?? '').trim();
	if (!localText) return importText;
	if (!importText) return localText;
	if (localText === importText) return localText;
	return `${localText}\n\n---\n\n${importText}`;
}

export function importValuesEqual(left: unknown, right: unknown, fieldName?: string): boolean {
	return stableStringify(normalizeComparableImportValue(left, fieldName))
		=== stableStringify(normalizeComparableImportValue(right, fieldName));
}

export function normalizeImportValueForWrite(value: unknown, fieldName: string): unknown {
	const arrayValue = toImportArray(value, fieldName);
	if (arrayValue) {
		return Array.from(new Set(arrayValue));
	}
	return value;
}

function mapRatingFieldByTable(legacyKey: string, table: Record<string, string>): string | null {
	if (table[legacyKey]) {
		return table[legacyKey];
	}

	return mapGenericRatingField(legacyKey);
}

function mapGenericRatingField(legacyKey: string): string | null {
	const genericMap: Record<string, string> = {
		music: '音乐评分',
		character: '人设评分',
		story: '剧情评分',
		art: '美术评分',
		illustration: '插画评分',
		writing: '文笔评分',
		drawing: '画工评分',
		fun: '趣味评分',
	};

	return genericMap[legacyKey] || null;
}

function isEmptyImportValue(value: unknown): boolean {
	if (value === null || value === undefined) return true;
	if (typeof value === 'string') return value.trim() === '';
	if (Array.isArray(value)) return value.length === 0;
	if (typeof value === 'object') return Object.keys(value).length === 0;
	return false;
}

function toImportArray(value: unknown, fieldName?: string): string[] | null {
	if (Array.isArray(value)) {
		return normalizeListValues(value);
	}

	if (typeof value === 'string' && fieldName && LIST_LIKE_FIELDS.has(fieldName)) {
		const parsed = splitListString(value);
		return parsed.length > 0 ? parsed : null;
	}

	return null;
}

function normalizeComparableImportValue(value: unknown, fieldName?: string): unknown {
	if (fieldName === '短评' && typeof value === 'string') {
		return normalizeShortComment(value);
	}

	const arrayValue = toImportArray(value, fieldName);
	if (arrayValue) {
		return Array.from(new Set(arrayValue)).sort((left, right) => left.localeCompare(right, 'zh-CN'));
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			return String(Number(trimmed));
		}
		return trimmed.replace(/\r\n/g, '\n');
	}

	if (value && typeof value === 'object') {
		return stableNormalize(value);
	}

	return value;
}

function stableStringify(value: unknown): string {
	if (value === null || value === undefined) return '';
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'symbol') return value.description ?? 'symbol';
	if (typeof value === 'function') return '[function]';
	if (Array.isArray(value)) return JSON.stringify(value.map(item => stableNormalize(item)));
	if (typeof value === 'object') return JSON.stringify(stableNormalize(value));
	return '';
}

function stableNormalize(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(item => stableNormalize(item));
	}
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return Object.keys(record)
			.sort()
			.reduce<Record<string, unknown>>((acc, key) => {
				acc[key] = stableNormalize(record[key]);
				return acc;
			}, {});
	}
	return value;
}

function normalizeListValues(values: unknown[]): string[] {
	return values
		.flatMap(item => typeof item === 'string' ? splitListString(item) : [stringifyImportValue(item)])
		.map(item => item.trim())
		.filter(Boolean);
}

function splitListString(value: string): string[] {
	return value
		.split(/[,\n，、；;｜|]/)
		.map(item => item.trim())
		.filter(Boolean);
}

function stringifyImportValue(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}
	if (typeof value === 'symbol') {
		return value.description ?? 'symbol';
	}
	if (typeof value === 'function') {
		return '[function]';
	}
	try {
		return JSON.stringify(stableNormalize(value));
	} catch {
		return '[object]';
	}
}
