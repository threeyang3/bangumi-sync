/**
 * 路径模板处理
 * 支持变量替换生成文件路径
 */

import { Subject, UserCollection, getSubjectTypeLabel } from '../api/types';
import { parseInfoByType } from '../parser/infoboxParser';
import { limitPathLength, normalizePathValue, sanitizeFileName } from '../file/pathUtils';

/**
 * 路径模板变量
 */
export interface PathTemplateVars {
	type: string;      // 条目类型大类 (book/anime/music/game/real)
	category: string;  // 细分类别
	platform: string;  // 平台/具体类型 (如: 公式书、TV、电影)
	name: string;      // 原名
	name_cn: string;   // 中文名
	name_cn_with_type: string; // 中文名带类型后缀 (如: 金牌得主(动画))
	year: string;      // 年份
	author: string;    // 作者
	id: number;        // 条目 ID
}

/**
 * 从条目信息提取路径模板变量
 */
export function extractPathVars(
	subject: Subject,
	_collection?: UserCollection
): PathTemplateVars {
	// 解析 infobox 获取详细信息
	const parsedInfo = parseInfoByType(subject.infobox, subject.type, subject.platform);

	// 获取类型大类标签
	const typeLabel = getSubjectTypeLabel(subject.type);

	// 提取年份
	let year = '';
	if (subject.date) {
		const match = subject.date.match(/^(\d{4})/);
		if (match) {
			year = match[1];
		}
	}

	// 生成带类型后缀的文件名
	// 对于动画，使用具体类型（TV、OVA、剧场版等）
	// 对于其他类型，使用大类（小说、漫画等）
	// 当中文名为空时，依次回退到原名和 ID
	const effectiveNameCn = subject.name_cn || subject.name || String(subject.id);
	let nameCnWithType = effectiveNameCn;
	if (nameCnWithType) {
		const typeSuffix = getTypeSuffixForName(parsedInfo.category || '');
		if (typeSuffix) {
			nameCnWithType = `${nameCnWithType}(${typeSuffix})`;
		}
	}

	return {
		type: typeLabel,
		category: parsedInfo.category || '',
		platform: subject.platform || '',
		name: subject.name || '',
		name_cn: effectiveNameCn,
		name_cn_with_type: nameCnWithType,
		year,
		author: parsedInfo.author || '',
		id: subject.id,
	};
}

/**
 * 获取用于文件名的类型后缀
 * 直接使用 category（细分类别）
 */
export function getTypeSuffixForName(category: string): string {
	return category.trim() || '';
}

/**
 * 渲染路径模板
 * 使用单次正则匹配替换所有变量
 * @param template 模板字符串，如 "ACGN/{{type}}/{{name_cn}}.md"
 * @param vars 模板变量
 */
export function renderPathTemplate(template: string, vars: PathTemplateVars): string {
	const varMap: Record<string, string> = {
		type: sanitizeFileName(vars.type, ''),
		category: sanitizeFileName(vars.category, ''),
		platform: sanitizeFileName(vars.platform, ''),
		name: sanitizeFileName(vars.name, String(vars.id)),
		name_cn: sanitizeFileName(vars.name_cn, String(vars.id)),
		name_cn_with_type: sanitizeFileName(vars.name_cn_with_type, String(vars.id)),
		year: vars.year,
		author: sanitizeFileName(vars.author, ''),
		id: String(vars.id),
	};

	const unknownVariables = new Set<string>();
	let result = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
		if (!(key in varMap)) {
			unknownVariables.add(key);
			return '';
		}
		return varMap[key];
	});
	if (unknownVariables.size > 0) {
		throw new Error(`Unknown path template variable(s): ${Array.from(unknownVariables).join(', ')}`);
	}

	// 清理路径中的空目录部分
	result = limitPathLength(normalizePathValue(result
		.split('/')
		.map((part, index, parts) => {
			if (index !== parts.length - 1) return sanitizeFileName(part, '');
			if (part.toLocaleLowerCase('en-US').endsWith('.md')) {
				return `${sanitizeFileName(part.slice(0, -3), String(vars.id), 157)}.md`;
			}
			return sanitizeFileName(part, String(vars.id), 160);
		})
		.filter(part => part.length > 0)
		.join('/')));

	// 确保以 .md 结尾
	if (!result.toLocaleLowerCase('en-US').endsWith('.md')) {
		result += '.md';
	}

	return result;
}

/**
 * 生成文件路径
 */
export function generateFilePath(
	template: string,
	subject: Subject,
	collection?: UserCollection
): string {
	const vars = extractPathVars(subject, collection);
	return renderPathTemplate(template, vars);
}
