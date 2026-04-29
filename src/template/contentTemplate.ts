/**
 * 内容模板处理
 * 改进：使用用户自己的标签，而非公共标签
 * 支持用户填写的评分明细
 * 支持章节显示
 */

import { Subject, UserCollection, getCollectionStatusLabel, Episode, UserEpisodeCollection, SubjectType } from '../../common/api/types';
import { parseInfoByType, parseDate, cleanSummary } from '../../common/parser/infoboxParser';
import { getCharacterTemplateVars, CharacterInfo } from '../../common/parser/characterParser';
import { getDefaultTemplate, getTypeLabel } from '../../common/template/defaultTemplates';
import { parseEpisodes, createUserStatusMap } from '../../common/parser/episodeParser';
import { CoverLinkType } from '../settings/settings';

export interface CustomTemplates {
	anime?: string;
	novel?: string;
	comic?: string;
	game?: string;
	album?: string;
	music?: string;
	real?: string;
}

export interface RatingDetails {
	music?: string;
	character?: string;
	story?: string;
	art?: string;
	illustration?: string;
	writing?: string;
	drawing?: string;
	fun?: string;
}

/**
 * 内容模板变量
 */
interface ContentTemplateVars {
	[key: string]: string;
}

/**
 * 从条目和收藏信息提取模板变量
 * 使用用户自己的标签
 * 支持用户填写的评分明细
 * 支持章节显示
 * 支持相关条目链接
 */
export function extractTemplateVars(
	subject: Subject,
	collection?: UserCollection,
	characters?: CharacterInfo[],
	ratingDetails?: RatingDetails,
	episodes?: Episode[],
	userEpisodeStatus?: UserEpisodeCollection[],
	_notePathTemplate?: string,
	coverLinkType?: CoverLinkType,
	localCoverPath?: string,
	relatedLinks?: string[],
	extraTemplateVars?: Record<string, string>
): ContentTemplateVars {
	// 解析 infobox 获取详细信息
	const parsedInfo = parseInfoByType(subject.infobox, subject.type, subject.platform);

	// 获取类型标签
	const typeLabel = getTypeLabel(subject.type, parsedInfo.category);

	// 解析日期
	const { year, month } = parseDate(subject.date);

	// V4.2: 使用 YAML 数组格式输出标签，兼容新版 Obsidian
	// 如果用户没有标签，输出空数组
	const my_tags_array = collection?.tags && collection.tags.length > 0
		? collection.tags
		: [];

		// 获取封面链接
		// 根据 coverLinkType 决定使用网络链接还是本地链接
		let cover = '';
		if (coverLinkType === 'local' && localCoverPath) {
		// 使用本地链接
		cover = localCoverPath;
		} else {
		// 使用网络链接（默认）
		cover = subject.images?.large || subject.images?.common || '';
		}

	// 收藏信息
	const my_rate = collection?.rate ? String(collection.rate) : '';
	// 短评保留原始换行（放在正文 callout 中）
	const my_comment = collection?.comment || '';
	const my_status = collection
		? getCollectionStatusLabel(collection.type, subject.type)
		: '';

	// V4: 生成章节显示内容
	let episodesContent = '';
	let volumesContent = '';
	if (episodes && episodes.length > 0) {
		const statusMap = userEpisodeStatus ? createUserStatusMap(userEpisodeStatus) : undefined;
		// 根据条目类型决定显示标题
		if (subject.type === SubjectType.Anime) {  // 动画
			episodesContent = parseEpisodes(episodes, statusMap);
		} else if (parsedInfo.category?.includes('小说')) {
			volumesContent = parseEpisodes(episodes, statusMap);
		} else if (parsedInfo.category?.includes('漫画')) {
			episodesContent = parseEpisodes(episodes, statusMap);
		}
	}

	const name_cn = subject.name_cn || '';

	// 相关条目链接（YAML 数组格式，用双引号包围）
	const related = relatedLinks && relatedLinks.length > 0
		? relatedLinks.map(l => `  - "${l}"`).join('\n')
		: '';

	// 构建变量对象
	const vars: ContentTemplateVars = {
		// 基础信息
		id: String(subject.id),
		name: subject.name || '',
		name_cn,
		alias: '',
		summary: cleanSummary(subject.summary),
		rating: subject.rating?.score ? String(subject.rating.score) : '',
		rank: subject.rating?.rank ? String(subject.rating.rank) : '',
		tags: my_tags_array.length > 0 ? my_tags_array.map(t => `  - ${t}`).join('\n') : '',
		tags_inline: my_tags_array.join(', '),  // 兼容旧模板的内联格式
		cover,
		bangumi_url: `https://bgm.tv/subject/${subject.id}`,

		// 类型信息
		type: String(subject.type),
		typeLabel,
		category: parsedInfo.category || '',

		// 日期
		date: subject.date || '',
		year,
		month,

		// 收藏信息
		my_rate,
		my_comment,
		my_status,
		my_tags: my_tags_array.join(', '),  // 兼容旧模板

		// 条目特定字段
		episode: parsedInfo.episode ? String(parsedInfo.episode) : '',
		director: parsedInfo.director || '',
		music: parsedInfo.music || '',
		animeMake: parsedInfo.animeMake || '',
		website: parsedInfo.website || '',
		author: parsedInfo.author || '',
		illustration: parsedInfo.illustration || '',
		publish: parsedInfo.publish || '',
		series: parsedInfo.series || '',
		journal: parsedInfo.journal || '',
		volumes: parsedInfo.volumes ? String(parsedInfo.volumes) : '',
		status: parsedInfo.status || '',
		progress: parsedInfo.progress || '',
		staff: parsedInfo.staff2 || parsedInfo.staff || '',
		platform: parsedInfo.platform || '',
		develop: parsedInfo.develop || '',
		playerNum: parsedInfo.playerNum || '',
		pages: parsedInfo.pages ? String(parsedInfo.pages) : '',
		isbn: parsedInfo.isbn || '',

		// V4: 章节显示
		episodes: episodesContent,
		volumes_display: volumesContent,

		// 评分明细
		rating_music: ratingDetails?.music || '',
		rating_character: ratingDetails?.character || '',
		rating_story: ratingDetails?.story || '',
		rating_art: ratingDetails?.art || '',
		rating_illustration: ratingDetails?.illustration || '',
		rating_writing: ratingDetails?.writing || '',
		rating_drawing: ratingDetails?.drawing || '',
		rating_fun: ratingDetails?.fun || '',

		// 为兼容旧模板保留变量，但默认不再自动生成笔记属性
		note_link: '',

		// 相关条目
		related,
	};

	// 添加角色变量
	if (characters && characters.length > 0) {
		const charVars = getCharacterTemplateVars(characters);
		Object.assign(vars, charVars);
	}

	if (extraTemplateVars) {
		Object.assign(vars, extraTemplateVars);
	}

	return vars;
}

/**
 * 渲染内容模板
 * V4.1 增强：支持条件渲染、默认值
 */
export function renderContentTemplate(template: string, vars: ContentTemplateVars): string {
	let result = template;

	// 1. 处理条件渲染 {{#if variable}}...{{/if}}
	result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_match: string, key: string, content: string) => {
		const value = vars[key];
		// 变量有值且不为空字符串时显示内容
		if (value !== undefined && value !== null && value !== '') {
			return content;
		}
		return '';
	});

	// 2. 处理默认值 {{variable|default}}
	result = result.replace(/\{\{(\w+)\|([^}]+)\}\}/g, (_match: string, key: string, defaultVal: string) => {
		const value = vars[key];
		if (value !== undefined && value !== null && value !== '') {
			return String(value);
		}
		return defaultVal;
	});

	// 3. 替换所有 {{variable}} 格式的变量
	result = result.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
		const value = vars[key];
		if (value === undefined || value === null) {
			return '';
		}
		return String(value);
	});

	return result;
}

/**
 * 生成 Markdown 内容
 */
export function generateContent(
	template: string,
	subject: Subject,
	collection?: UserCollection,
	characters?: CharacterInfo[],
	ratingDetails?: RatingDetails,
	episodes?: Episode[],
	userEpisodeStatus?: UserEpisodeCollection[],
	notePathTemplate?: string,
	coverLinkType?: CoverLinkType,
	localCoverPath?: string,
	relatedLinks?: string[],
	extraTemplateVars?: Record<string, string>
): string {
	const vars = extractTemplateVars(subject, collection, characters, ratingDetails, episodes, userEpisodeStatus, notePathTemplate, coverLinkType, localCoverPath, relatedLinks, extraTemplateVars);
	return renderContentTemplate(template, vars);
}

/**
 * 根据条目类型选择模板并生成内容
 */
export function generateContentByType(
	subject: Subject,
	collection?: UserCollection,
	characters?: CharacterInfo[],
	customTemplates?: CustomTemplates,
	ratingDetails?: RatingDetails,
	episodes?: Episode[],
	userEpisodeStatus?: UserEpisodeCollection[],
	notePathTemplate?: string,
	coverLinkType?: CoverLinkType,
	localCoverPath?: string,
	relatedLinks?: string[],
	extraTemplateVars?: Record<string, string>
): string {
	// 解析 infobox 获取详细信息以确定细分类别
	const parsedInfo = parseInfoByType(subject.infobox, subject.type, subject.platform);
	const category = parsedInfo.category || '';

	const template = resolveTemplateForSubject(subject, customTemplates, category);
	return generateContent(template, subject, collection, characters, ratingDetails, episodes, userEpisodeStatus, notePathTemplate, coverLinkType, localCoverPath, relatedLinks, extraTemplateVars);
}

export function resolveTemplateForSubject(
	subject: Subject,
	customTemplates?: CustomTemplates,
	resolvedCategory?: string
): string {
	const category = resolvedCategory || parseInfoByType(subject.infobox, subject.type, subject.platform).category || '';

	if (customTemplates) {
		if (category.includes('小说') && customTemplates.novel) {
			return customTemplates.novel;
		}

		if (category.includes('漫画') && customTemplates.comic) {
			return customTemplates.comic;
		}

		if ((category.includes('画集') || category.includes('画本')) && customTemplates.album) {
			return customTemplates.album;
		}

		switch (subject.type) {
			case SubjectType.Anime:
				return customTemplates.anime || getDefaultTemplate(subject.type, category);
			case SubjectType.Game:
				return customTemplates.game || getDefaultTemplate(subject.type, category);
			case SubjectType.Music:
				return customTemplates.music || getDefaultTemplate(subject.type, category);
			case SubjectType.Real:
				return customTemplates.real || getDefaultTemplate(subject.type, category);
			case SubjectType.Book:
			default:
				return customTemplates.novel || getDefaultTemplate(subject.type, category);
		}
	}

	return getDefaultTemplate(subject.type, category);
}

export function applyNamedPropertyValuesToContent(
	content: string,
	propertyValues: Record<string, string | boolean | string[]>
): string {
	let nextContent = content;
	for (const [propertyName, value] of Object.entries(propertyValues)) {
		nextContent = replacePropertyValue(nextContent, `${propertyName}:`, value);
	}
	return nextContent;
}

/**
 * 替换属性值
 */
function replacePropertyValue(content: string, propertyName: string, value: string | boolean | string[]): string {
	const escapedName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(`^${escapedName}\\s*.*(?:\\n  - .*?)*$`, 'm');
	return content.replace(regex, `${propertyName} ${formatPropertyValue(value)}`);
}

function formatPropertyValue(value: string | boolean | string[]): string {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			return '[]';
		}
		return `\n${value.map(item => `  - ${item}`).join('\n')}`;
	}

	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}

	return value;
}

// 兼容旧版本的类型别名
