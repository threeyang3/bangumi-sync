/**
 * 路径模板处理
 * 支持变量替换生成文件路径
 */

import { Subject, UserCollection, getSubjectTypeLabel } from '../api/types';
import { parseInfoByType } from '../parser/infoboxParser';

/**
 * 路径模板变量
 */
interface PathTemplateVars {
	type: string;      // 条目类型 (anime/game/novel/comic/album/music/real)
	category: string;  // 细分类别
	name: string;      // 原名
	name_cn: string;   // 中文名
	year: string;      // 年份
	author: string;    // 作者
	id: number;        // 条目 ID
}

/**
 * 从条目信息提取路径模板变量
 */
export function extractPathVars(
	subject: Subject,
	collection?: UserCollection
): PathTemplateVars {
	// 解析 infobox 获取详细信息
	const parsedInfo = parseInfoByType(subject.infobox, subject.type);

	// 获取类型标签
	let typeLabel = getSubjectTypeLabel(subject.type);

	// 根据细分类别调整类型标签
	if (parsedInfo.category) {
		if (parsedInfo.category.includes('小说')) {
			typeLabel = 'novel';
		} else if (parsedInfo.category.includes('漫画')) {
			typeLabel = 'comic';
		} else if (parsedInfo.category.includes('画集') || parsedInfo.category.includes('画本')) {
			typeLabel = 'album';
		}
	}

	// 提取年份
	let year = '';
	if (subject.date) {
		const match = subject.date.match(/^(\d{4})/);
		if (match) {
			year = match[1];
		}
	}

	return {
		type: typeLabel,
		category: parsedInfo.category || '',
		name: subject.name || '',
		name_cn: subject.name_cn || '',
		year,
		author: parsedInfo.author || '',
		id: subject.id,
	};
}

/**
 * 清理文件名中的非法字符
 */
function sanitizeFileName(name: string): string {
	// 移除 Windows 文件名非法字符
	return name
		.replace(/[<>:"/\\|?*]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * 渲染路径模板
 * @param template 模板字符串，如 "ACGN/{{type}}/{{name_cn}}.md"
 * @param vars 模板变量
 */
export function renderPathTemplate(template: string, vars: PathTemplateVars): string {
	let result = template;

	// 替换变量
	result = result.replace(/\{\{type\}\}/g, sanitizeFileName(vars.type));
	result = result.replace(/\{\{category\}\}/g, sanitizeFileName(vars.category));
	result = result.replace(/\{\{name\}\}/g, sanitizeFileName(vars.name));
	result = result.replace(/\{\{name_cn\}\}/g, sanitizeFileName(vars.name_cn));
	result = result.replace(/\{\{year\}\}/g, vars.year);
	result = result.replace(/\{\{author\}\}/g, sanitizeFileName(vars.author));
	result = result.replace(/\{\{id\}\}/g, String(vars.id));

	// 清理路径中的空目录部分
	result = result
		.split('/')
		.filter(part => part.length > 0)
		.join('/');

	// 确保以 .md 结尾
	if (!result.endsWith('.md')) {
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
