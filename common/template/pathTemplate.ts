/**
 * 路径模板处理
 * 支持变量替换生成文件路径
 */

import { Subject, UserCollection, SubjectType, getSubjectTypeLabel } from '../api/types';
import { parseInfoByType } from '../parser/infoboxParser';

/**
 * 路径模板变量
 */
interface PathTemplateVars {
	type: string;      // 条目类型 (anime/game/novel/comic/album/music/real)
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
 * 获取类型的中文标签
 */
function getTypeLabelChinese(type: string): string {
	const typeLabels: Record<string, string> = {
		'anime': '动画',
		'novel': '小说',
		'comic': '漫画',
		'album': '画集',
		'music': '音乐',
		'game': '游戏',
		'real': '三次元',
		'book': '书籍',
	};
	return typeLabels[type] || '';
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

	// 生成带类型后缀的文件名
	// 对于动画，使用具体类型（TV、OVA、剧场版等）
	// 对于其他类型，使用大类（小说、漫画等）
	// 当中文名为空时，依次回退到原名和 ID
	const effectiveNameCn = subject.name_cn || subject.name || String(subject.id);
	let nameCnWithType = effectiveNameCn;
	if (nameCnWithType) {
		const typeSuffix = getTypeSuffixForName(subject.type, parsedInfo.category, subject.platform);
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
 * 动画使用具体类型（TV、OVA、剧场版），其他类型优先使用细分类别
 */
function getTypeSuffixForName(subjectType: SubjectType, category: string, platform?: string): string {
	// 对于动画，优先使用 platform（包含具体类型如 TV、OVA、剧场版）
	if (subjectType === SubjectType.Anime) {
		if (platform && platform.trim()) {
			return platform.trim();
		}
		// 如果 platform 为空，使用 category
		if (category && category.trim()) {
			return category.trim();
		}
		// 默认返回"动画"
		return '动画';
	}

	// 对于书籍类型，优先使用细分类别（小说、漫画、画集等）
	if (subjectType === SubjectType.Book) {
		if (category && category.trim()) {
			return category.trim();
		}
		// 默认返回"书籍"
		return '书籍';
	}

	// 对于其他类型，优先使用细分类别，如果没有则使用大类
	if (category && category.trim()) {
		return category.trim();
	}

	return getTypeLabelChinese(getSubjectTypeLabel(subjectType));
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
 * 使用单次正则匹配替换所有变量
 * @param template 模板字符串，如 "ACGN/{{type}}/{{name_cn}}.md"
 * @param vars 模板变量
 */
export function renderPathTemplate(template: string, vars: PathTemplateVars): string {
	const varMap: Record<string, string> = {
		type: sanitizeFileName(vars.type),
		category: sanitizeFileName(vars.category),
		platform: sanitizeFileName(vars.platform),
		name: sanitizeFileName(vars.name),
		name_cn: sanitizeFileName(vars.name_cn),
		name_cn_with_type: sanitizeFileName(vars.name_cn_with_type),
		year: vars.year,
		author: sanitizeFileName(vars.author),
		id: String(vars.id),
	};

	let result = template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
		return key in varMap ? varMap[key] : `{{${key}}}`;
	});

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
