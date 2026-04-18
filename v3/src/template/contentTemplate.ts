/**
 * V2 内容模板处理
 * 改进：使用用户自己的标签，而非公共标签
 * 支持用户填写的评分明细
 */

import { Subject, UserCollection, getCollectionStatusEmoji, Tag } from '../../../common/api/types';
import { parseInfoByType, parseDate, cleanSummary, cleanMultilineText } from '../../../common/parser/infoboxParser';
import { parseCharacters, getCharacterTemplateVars, CharacterInfo } from '../../../common/parser/characterParser';
import { getDefaultTemplate, getTypeLabel } from '../../../common/template/defaultTemplates';
import { RatingDetails } from '../ui/syncPreviewModal';

/**
 * 内容模板变量
 */
interface ContentTemplateVars {
	[key: string]: string;
}

/**
 * 从条目和收藏信息提取模板变量
 * V2 改进：使用用户自己的标签
 * 支持用户填写的评分明细
 */
export function extractTemplateVarsV3(
	subject: Subject,
	collection?: UserCollection,
	characters?: CharacterInfo[],
	ratingDetails?: RatingDetails
): ContentTemplateVars {
	// 解析 infobox 获取详细信息
	const parsedInfo = parseInfoByType(subject.infobox, subject.type);

	// 获取类型标签
	const typeLabel = getTypeLabel(subject.type, parsedInfo.category);

	// 解析日期
	const { year, month } = parseDate(subject.date);

	// V2 改进：使用用户自己的标签，如果没有则留空
	// 不再使用公共标签 subject.tags
	const my_tags = collection?.tags && collection.tags.length > 0
		? collection.tags.join(', ')
		: '';  // 如果用户没有标签，留空

	// 获取封面
	const cover = subject.images?.large || subject.images?.common || '';

	// 收藏信息
	const my_rate = collection?.rate ? String(collection.rate) : '';
	const my_comment = cleanMultilineText(collection?.comment);
	const my_status = collection
		? getCollectionStatusEmoji(collection.type)
		: '';

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
		tags: my_tags,  // V2: 使用用户自己的标签
		cover,

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
		my_tags,

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
 */
export function renderContentTemplate(template: string, vars: ContentTemplateVars): string {
	let result = template;

	// 替换所有 {{variable}} 格式的变量
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
export function generateContentV2(
	template: string,
	subject: Subject,
	collection?: UserCollection,
	characters?: CharacterInfo[],
	ratingDetails?: RatingDetails
): string {
	const vars = extractTemplateVarsV3(subject, collection, characters, ratingDetails);
	return renderContentTemplate(template, vars);
}

/**
 * 根据条目类型选择模板并生成内容
 */
export function generateContentByTypeV3(
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
	ratingDetails?: RatingDetails
): string {
	// 解析 infobox 获取详细信息以确定细分类别
	const parsedInfo = parseInfoByType(subject.infobox, subject.type);
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

	return generateContentV2(template, subject, collection, characters, ratingDetails);
}
