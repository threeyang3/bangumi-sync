/**
 * 内容模板处理
 * 改进：使用用户自己的标签，而非公共标签
 * 支持用户填写的评分明细
 * 支持章节显示
 */

import { Subject, UserCollection, getCollectionStatusEmoji, Tag, Episode, UserEpisodeCollection } from '../../common/api/types';
import { parseInfoByType, parseDate, cleanSummary, cleanMultilineText } from '../../common/parser/infoboxParser';
import { parseCharacters, getCharacterTemplateVars, CharacterInfo } from '../../common/parser/characterParser';
import { getDefaultTemplate, getTypeLabel } from '../../common/template/defaultTemplates';
import { parseEpisodes, createUserStatusMap } from '../../common/parser/episodeParser';
import { RatingDetails } from '../ui/syncPreviewModal';
import { DefaultPropertyValues } from '../settings/settings';

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
 */
export function extractTemplateVars(
	subject: Subject,
	collection?: UserCollection,
	characters?: CharacterInfo[],
	ratingDetails?: RatingDetails,
	episodes?: Episode[],
	userEpisodeStatus?: UserEpisodeCollection[]
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

	// 获取封面
	const cover = subject.images?.large || subject.images?.common || '';

	// 收藏信息
	const my_rate = collection?.rate ? String(collection.rate) : '';
	// 短评保留原始换行（放在正文 callout 中）
	const my_comment = collection?.comment || '';
	const my_status = collection
		? getCollectionStatusEmoji(collection.type)
		: '';

	// V4: 生成章节显示内容
	let episodesContent = '';
	let volumesContent = '';
	if (episodes && episodes.length > 0) {
		const statusMap = userEpisodeStatus ? createUserStatusMap(userEpisodeStatus) : undefined;
		// 根据条目类型决定显示标题
		if (subject.type === 2) {  // 动画
			episodesContent = parseEpisodes(episodes, statusMap);
		} else if (parsedInfo.category?.includes('小说')) {
			volumesContent = parseEpisodes(episodes, statusMap);
		} else if (parsedInfo.category?.includes('漫画')) {
			episodesContent = parseEpisodes(episodes, statusMap);
		}
	}

	// 构建变量对象
	const vars: ContentTemplateVars = {
		// 基础信息
		id: String(subject.id),
		name: subject.name || '',
		name_cn: subject.name_cn || '',
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
	};

	// 添加角色变量
	if (characters && characters.length > 0) {
		const charVars = getCharacterTemplateVars(characters);
		Object.assign(vars, charVars);
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
	result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, key, content) => {
		const value = vars[key];
		// 变量有值且不为空字符串时显示内容
		if (value !== undefined && value !== null && value !== '') {
			return content;
		}
		return '';
	});

	// 2. 处理默认值 {{variable|default}}
	result = result.replace(/\{\{(\w+)\|([^}]+)\}\}/g, (match, key, defaultVal) => {
		const value = vars[key];
		if (value !== undefined && value !== null && value !== '') {
			return String(value);
		}
		return defaultVal;
	});

	// 3. 替换所有 {{variable}} 格式的变量
	result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
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
	userEpisodeStatus?: UserEpisodeCollection[]
): string {
	const vars = extractTemplateVars(subject, collection, characters, ratingDetails, episodes, userEpisodeStatus);
	return renderContentTemplate(template, vars);
}

/**
 * 根据条目类型选择模板并生成内容
 */
export function generateContentByType(
	subject: Subject,
	collection?: UserCollection,
	characters?: CharacterInfo[],
	customTemplates?: {
		anime?: string;
		novel?: string;
		comic?: string;
		game?: string;
		album?: string;
		music?: string;
		real?: string;
	},
	ratingDetails?: RatingDetails,
	episodes?: Episode[],
	userEpisodeStatus?: UserEpisodeCollection[],
	defaultPropertyValues?: DefaultPropertyValues
): string {
	// 解析 infobox 获取详细信息以确定细分类别
	const parsedInfo = parseInfoByType(subject.infobox, subject.type, subject.platform);
	const category = parsedInfo.category || '';

	// 获取模板
	let template: string;

	// 首先检查自定义模板
	if (customTemplates) {
		if (category.includes('小说') && customTemplates.novel) {
			template = customTemplates.novel;
		} else if (category.includes('漫画') && customTemplates.comic) {
			template = customTemplates.comic;
		} else if ((category.includes('画集') || category.includes('画本')) && customTemplates.album) {
			template = customTemplates.album;
		} else {
			switch (subject.type) {
				case 2: // Anime
					template = customTemplates.anime || getDefaultTemplate(subject.type, category);
					break;
				case 4: // Game
					template = customTemplates.game || getDefaultTemplate(subject.type, category);
					break;
				case 3: // Music
					template = customTemplates.music || getDefaultTemplate(subject.type, category);
					break;
				case 6: // Real
					template = customTemplates.real || getDefaultTemplate(subject.type, category);
					break;
				case 1: // Book
				default:
					template = customTemplates.novel || getDefaultTemplate(subject.type, category);
					break;
			}
		}
	} else {
		template = getDefaultTemplate(subject.type, category);
	}

	let content = generateContent(template, subject, collection, characters, ratingDetails, episodes, userEpisodeStatus);

	// 应用默认属性值
	if (defaultPropertyValues) {
		content = applyDefaultPropertyValues(content, subject.type, category, defaultPropertyValues);
	}

	return content;
}

/**
 * 应用默认属性值到内容中
 */
function applyDefaultPropertyValues(
	content: string,
	subjectType: number,
	category: string,
	defaultValues: DefaultPropertyValues
): string {
	// 根据条目类型应用对应的默认值
	if (subjectType === 2) {  // 动画
		if (defaultValues.anime_storage) {
			content = replaceEmptyProperty(content, '存储:', defaultValues.anime_storage);
		}
		if (defaultValues.anime_resourceAttr) {
			content = replaceEmptyProperty(content, '资源属性:', defaultValues.anime_resourceAttr);
		}
		if (defaultValues.anime_slogan) {
			content = replaceEmptyProperty(content, '标语:', defaultValues.anime_slogan);
		}
	} else if (category.includes('小说')) {
		if (defaultValues.novel_version) {
			content = replaceEmptyProperty(content, '版本:', defaultValues.novel_version);
		}
		if (defaultValues.novel_kindle !== undefined) {
			content = replaceEmptyProperty(content, 'Kindle:', String(defaultValues.novel_kindle));
		}
		if (defaultValues.novel_saved !== undefined) {
			content = replaceEmptyProperty(content, '保存:', String(defaultValues.novel_saved));
		}
	} else if (category.includes('漫画')) {
		if (defaultValues.comic_version) {
			content = replaceEmptyProperty(content, '版本:', defaultValues.comic_version);
		}
		if (defaultValues.comic_format) {
			content = replaceEmptyProperty(content, '格式:', defaultValues.comic_format);
		}
	} else if (subjectType === 4) {  // 游戏
		if (defaultValues.game_platform) {
			content = replaceEmptyProperty(content, '平台:', defaultValues.game_platform);
		}
		if (defaultValues.game_storage) {
			content = replaceEmptyProperty(content, '存储:', defaultValues.game_storage);
		}
	}

	return content;
}

/**
 * 替换空属性值
 */
function replaceEmptyProperty(content: string, propertyName: string, defaultValue: string): string {
	// 匹配属性: 后面为空或只有空白的情况
	const regex = new RegExp(`(${propertyName}\\s*)(\\n|$)`, 'g');
	return content.replace(regex, `$1${defaultValue}$2`);
}

// 兼容旧版本的类型别名
export const extractTemplateVarsV3 = extractTemplateVars;
export const generateContentV3 = generateContent;
export const generateContentByTypeV3 = generateContentByType;
