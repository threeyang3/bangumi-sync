/**
 * 内容模板处理
 * 改进：使用用户自己的标签，而非公共标签
 * 支持用户填写的评分明细
 * 支持章节显示
 */

import { Subject, UserCollection, getCollectionStatusLabel, Episode, UserEpisodeCollection, SubjectType, RelatedPerson, getSubjectTypeLabel } from '../../common/api/types';
import { parseInfoByType, parseDate, cleanSummary } from '../../common/parser/infoboxParser';
import { getCharacterTemplateVars, CharacterInfo } from '../../common/parser/characterParser';
import { getDefaultTemplate, getTypeLabel } from '../../common/template/defaultTemplates';
import { getTypeSuffixForName } from '../../common/template/pathTemplate';
import { parseEpisodes, createUserStatusMap } from '../../common/parser/episodeParser';
import { CoverLinkType } from '../settings/settings';

export interface CustomTemplates {
	[category: string]: string | undefined;
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
/**
 * 转义字符串以放入 YAML 双引号值中
 * 保留信息以便云端对比时还原
 */
function escapeForYamlDoubleQuoted(value: string): string {
	if (!value) { return ''; }
	return value
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\r\n?/g, '\n')
		.replace(/\n/g, '\\n');
}

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
	extraTemplateVars?: Record<string, string>,
	persons?: RelatedPerson[]
): ContentTemplateVars {
	// 解析 infobox 获取详细信息
	const parsedInfo = parseInfoByType(subject.infobox, subject.type, subject.platform, persons);

	// 从 infobox 提取别名
	const aliasItem = subject.infobox?.find(i => i.key === '别名');
	let alias = '';
	if (aliasItem) {
		if (typeof aliasItem.value === 'string') {
			alias = aliasItem.value;
		} else if (Array.isArray(aliasItem.value)) {
			alias = aliasItem.value
				.map(v => typeof v === 'object' && v !== null && 'v' in v ? String(v.v) : String(v))
				.join('、');
		}
	}

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
		// 短评：my_comment 用于 frontmatter（renderContentTemplate 统一转义），my_comment_raw 用于正文 callout
		// Bangumi API 用 \n 分段，Markdown 需要 \n\n 才能渲染为段落，因此 my_comment_raw 需要转换
		const my_comment_raw = collection?.comment
			? collection.comment
				.replace(/\r\n?/g, '\n')
				.split('\n\n')
				.map(para => para.replace(/\n/g, '\n\n'))
				.join('\n\n')
			: '';
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
		} else if (subject.type === SubjectType.Real) {  // 三次元
			episodesContent = parseEpisodes(episodes, statusMap);
		} else if (parsedInfo.category?.includes('小说')) {
			volumesContent = parseEpisodes(episodes, statusMap);
		} else if (parsedInfo.category?.includes('漫画')) {
			episodesContent = parseEpisodes(episodes, statusMap);
		}
	}

	const name_cn = subject.name_cn || '';

	// 生成带类型后缀的名称
	const typeSuffix = getTypeSuffixForName(parsedInfo.category || '');
	const name_cn_with_type = name_cn ? (typeSuffix ? `${name_cn}(${typeSuffix})` : name_cn) : '';

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
		name_cn_with_type,
		alias,
		summary: cleanSummary(subject.summary),
		rating: subject.rating?.score ? String(subject.rating.score) : '',
		rank: subject.rating?.rank ? String(subject.rating.rank) : '',
		tags: my_tags_array.length > 0 ? my_tags_array.map(t => `  - ${t}`).join('\n') : '',
		tags_inline: my_tags_array.join(', '),  // 兼容旧模板的内联格式
		cover,
		bangumi_url: `https://bgm.tv/subject/${subject.id}`,

		// 类型信息
		type: getSubjectTypeLabel(subject.type),
		typeLabel,
		typeId: String(subject.type),
		category: parsedInfo.category || '',

		// 日期
		date: subject.date || '',
		year,
		month,

		// 收藏信息
		my_rate,
		my_comment,
		my_comment_raw,
		my_status,
		my_tags: my_tags_array.join(', '),  // 兼容旧模板

		// 条目特定字段
		episode: parsedInfo.episode ? String(parsedInfo.episode) : '',
		director: parsedInfo.director || '',
		music: parsedInfo.music || '',
		animeMake: parsedInfo.animeMake || '',
		from: parsedInfo.from || '',
		musicMake: parsedInfo.musicMake || '',
		audioDirector: parsedInfo.audioDirector || '',
		artDirector: parsedInfo.artDirector || '',
		animeChief: parsedInfo.animeChief || '',
		website: parsedInfo.website || '',
		author: parsedInfo.author || '',
		illustration: parsedInfo.illustration || '',
		publish: parsedInfo.publish || '',
		series: parsedInfo.series || '',
		journal: parsedInfo.journal || '',
		volumes: parsedInfo.volumes ? String(parsedInfo.volumes) : '',
		status: parsedInfo.status || '',
		progress: parsedInfo.progress || '',
		start: parsedInfo.start || '',
		end: parsedInfo.end || '',
		staff: parsedInfo.staff2 || parsedInfo.staff || '',
		platform: subject.platform || '',
		develop: parsedInfo.develop || '',
		playerNum: parsedInfo.playerNum || '',
		script: parsedInfo.script || '',
		art: parsedInfo.art || '',
		producer: parsedInfo.producer || '',
		price: parsedInfo.price || '',
		pages: parsedInfo.pages ? String(parsedInfo.pages) : '',
		isbn: parsedInfo.isbn || '',

		// 三次元字段
		actor: parsedInfo.actor || '',
		country: parsedInfo.country || '',
		language: parsedInfo.language || '',
		episodeLength: parsedInfo.episodeLength || '',
		tvStation: parsedInfo.tvStation || '',
		imdbId: parsedInfo.imdbId || '',

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
 * 优化：使用单次遍历处理所有模板语法，减少正则匹配次数
 */
// 已格式化的多行 YAML 值、HTML 内容、正文专用值，不做 YAML 转义
const UNESCAPED_TEMPLATE_VARS = new Set(['related', 'tags', 'my_comment_raw', 'episodes', 'volumes_display', 'summary']);

export function renderContentTemplate(template: string, vars: ContentTemplateVars): string {
	// 使用统一的正则表达式匹配所有模板语法
	// 匹配顺序：条件渲染 > 带默认值的变量 > 普通变量
	const templateRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}|\{\{(\w+)\|([^}]+)\}\}|\{\{(\w+)\}\}/g;

	return template.replace(templateRegex, (
		_match: string,
		ifKey: string | undefined,
		ifContent: string | undefined,
		defaultKey: string | undefined,
		defaultVal: string | undefined,
		simpleKey: string | undefined
	) => {
		// 处理条件渲染 {{#if variable}}...{{/if}}
		if (ifKey !== undefined && ifContent !== undefined) {
			const value = vars[ifKey];
			if (value !== undefined && value !== null && value !== '') {
				return renderContentTemplate(ifContent, vars);
			}
			return '';
		}

		// 处理带默认值的变量 {{variable|default}}
		if (defaultKey !== undefined && defaultVal !== undefined) {
			const value = vars[defaultKey];
			if (value !== undefined && value !== null && value !== '') {
				const str = String(value);
				return UNESCAPED_TEMPLATE_VARS.has(defaultKey) ? str : escapeForYamlDoubleQuoted(str);
			}
			return defaultVal;
		}

		// 处理普通变量 {{variable}}
		if (simpleKey !== undefined) {
			const value = vars[simpleKey];
			if (value === undefined || value === null) {
				return '';
			}
			const str = String(value);
			return UNESCAPED_TEMPLATE_VARS.has(simpleKey) ? str : escapeForYamlDoubleQuoted(str);
		}

		return _match;
	});
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
	extraTemplateVars?: Record<string, string>,
	persons?: RelatedPerson[]
): string {
	const vars = extractTemplateVars(subject, collection, characters, ratingDetails, episodes, userEpisodeStatus, notePathTemplate, coverLinkType, localCoverPath, relatedLinks, extraTemplateVars, persons);
	return renderContentTemplate(template, vars);
}

/**
 * 根据条目类型选择模板并生成内容
 * 优化：避免重复解析 infobox，将 category 传递给 resolveTemplateForSubject
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
	extraTemplateVars?: Record<string, string>,
	persons?: RelatedPerson[]
): string {
	// 解析 infobox 获取详细信息以确定细分类别
	const parsedInfo = parseInfoByType(subject.infobox, subject.type, subject.platform, persons);
	const category = parsedInfo.category || '';

	// 将 category 传递给 resolveTemplateForSubject，避免重复解析
	const template = resolveTemplateForSubject(subject, customTemplates, category);
	return generateContent(template, subject, collection, characters, ratingDetails, episodes, userEpisodeStatus, notePathTemplate, coverLinkType, localCoverPath, relatedLinks, extraTemplateVars, persons);
}

export function resolveTemplateForSubject(
	subject: Subject,
	customTemplates?: CustomTemplates,
	resolvedCategory?: string
): string {
	const category = resolvedCategory || parseInfoByType(subject.infobox, subject.type, subject.platform).category || '';

	if (customTemplates) {
		// 直接按 category 查找
		const template = customTemplates[category];
		if (template) return template;
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
