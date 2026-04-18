/**
 * 条目信息解析器
 * 从 Bangumi API 返回的 infobox 中解析各类型条目的特定字段
 */

import { InfoboxItem, SubjectType } from '../../../common/api/types';

/**
 * 解析后的条目信息
 */
export interface ParsedInfo {
	// 通用字段
	category: string;         // 细分类别 (TV/OVA/小说/漫画 等)

	// 动画字段
	episode?: number;         // 话数
	director?: string;        // 导演
	music?: string;           // 音乐
	animeMake?: string;       // 动画制作
	musicMake?: string;       // 音乐制作
	staff?: string;           // 脚本
	audioDirector?: string;   // 音响监督
	artDirector?: string;     // 美术监督
	animeChief?: string;      // 总作画监督
	from?: string;            // 原作
	website?: string;         // 官方网站

	// 书籍字段（小说/漫画）
	author?: string;          // 作者
	illustration?: string;    // 插画
	publish?: string;         // 出版社
	series?: string;          // 书系
	journal?: string;         // 连载杂志
	volumes?: number;         // 册数
	status?: string;          // 连载状态
	progress?: string;        // 进度
	start?: string;           // 开始日期
	end?: string;             // 结束日期

	// 漫画字段
	staff2?: string;          // 作画

	// 游戏字段
	platform?: string;        // 平台
	develop?: string;         // 开发
	playerNum?: string;       // 游玩人数
	script?: string;          // 剧本
	art?: string;             // 原画
	producer?: string;        // 制作人
	price?: string;           // 售价

	// 画集字段
	pages?: number;           // 页数
	isbn?: string;            // ISBN

	// 其他
	[key: string]: unknown;
}

/**
 * 从 infobox 中获取指定 key 的值
 */
function getInfoboxValue(infobox: InfoboxItem[] | undefined, key: string): string | undefined {
	if (!infobox) return undefined;

	const item = infobox.find(i => i.key === key);
	if (!item) return undefined;

	if (typeof item.value === 'string') {
		return item.value.trim();
	}

	// 处理数组类型的值
	if (Array.isArray(item.value)) {
		// 如果是 {k, v} 格式的数组
		if (item.value.length > 0 && typeof item.value[0] === 'object' && 'v' in item.value[0]) {
			return item.value.map(v => (v as { k: string; v: string }).v).join('、');
		}
		return item.value.join('、');
	}

	return undefined;
}

/**
 * 从 infobox 中获取指定 key 的数值
 */
function getInfoboxNumber(infobox: InfoboxItem[] | undefined, key: string): number | undefined {
	const value = getInfoboxValue(infobox, key);
	if (value) {
		const num = parseInt(value, 10);
		return isNaN(num) ? undefined : num;
	}
	return undefined;
}

/**
 * 解析动画信息
 */
export function parseAnimeInfo(infobox: InfoboxItem[] | undefined): ParsedInfo {
	return {
		category: getInfoboxValue(infobox, '类型') || 'TV',
		episode: getInfoboxNumber(infobox, '话数'),
		director: getInfoboxValue(infobox, '导演'),
		music: getInfoboxValue(infobox, '音乐'),
		animeMake: getInfoboxValue(infobox, '动画制作'),
		musicMake: getInfoboxValue(infobox, '音乐制作'),
		staff: getInfoboxValue(infobox, '脚本'),
		audioDirector: getInfoboxValue(infobox, '音响监督'),
		artDirector: getInfoboxValue(infobox, '美术监督'),
		animeChief: getInfoboxValue(infobox, '总作画监督'),
		from: getInfoboxValue(infobox, '原作'),
		website: getInfoboxValue(infobox, '官方网站'),
	};
}

/**
 * 解析小说信息
 */
export function parseNovelInfo(infobox: InfoboxItem[] | undefined): ParsedInfo {
	const author = getInfoboxValue(infobox, '作者') || getInfoboxValue(infobox, '原作');
	const start = getInfoboxValue(infobox, '开始');
	const end = getInfoboxValue(infobox, '结束');

	return {
		category: getInfoboxValue(infobox, '类型') || '小说',
		author,
		illustration: getInfoboxValue(infobox, '插图'),
		publish: getInfoboxValue(infobox, '出版社'),
		series: getInfoboxValue(infobox, '书系'),
		volumes: getInfoboxNumber(infobox, '册数'),
		status: end ? '已完结' : '连载中',
		progress: start ? `${start} - ${end || '连载中'}` : undefined,
		start,
		end,
		website: getInfoboxValue(infobox, '官方网站'),
	};
}

/**
 * 解析漫画信息
 */
export function parseComicInfo(infobox: InfoboxItem[] | undefined): ParsedInfo {
	const author = getInfoboxValue(infobox, '作者') || getInfoboxValue(infobox, '原作');
	const start = getInfoboxValue(infobox, '开始');
	const end = getInfoboxValue(infobox, '结束');

	return {
		category: getInfoboxValue(infobox, '类型') || '漫画',
		author,
		staff2: getInfoboxValue(infobox, '作画'),
		publish: getInfoboxValue(infobox, '出版社'),
		journal: getInfoboxValue(infobox, '连载杂志'),
		episode: getInfoboxNumber(infobox, '话数'),
		status: end ? '已完结' : '连载中',
		progress: start ? `${start} - ${end || '连载中'}` : undefined,
		start,
		end,
	};
}

/**
 * 解析游戏信息
 */
export function parseGameInfo(infobox: InfoboxItem[] | undefined): ParsedInfo {
	return {
		category: getInfoboxValue(infobox, '游戏类型') || '游戏',
		platform: getInfoboxValue(infobox, '平台'),
		develop: getInfoboxValue(infobox, '开发'),
		publish: getInfoboxValue(infobox, '发行'),
		playerNum: getInfoboxValue(infobox, '游玩人数'),
		script: getInfoboxValue(infobox, '剧本'),
		music: getInfoboxValue(infobox, '音乐'),
		art: getInfoboxValue(infobox, '原画'),
		director: getInfoboxValue(infobox, '导演'),
		producer: getInfoboxValue(infobox, '制作人'),
		price: getInfoboxValue(infobox, '售价'),
		website: getInfoboxValue(infobox, '官方网站'),
	};
}

/**
 * 解析画集信息
 */
export function parseAlbumInfo(infobox: InfoboxItem[] | undefined): ParsedInfo {
	return {
		category: getInfoboxValue(infobox, '类型') || '画集',
		author: getInfoboxValue(infobox, '作者') || getInfoboxValue(infobox, '插图'),
		publish: getInfoboxValue(infobox, '出版社'),
		pages: getInfoboxNumber(infobox, '页数'),
		isbn: getInfoboxValue(infobox, 'ISBN'),
	};
}

/**
 * 根据条目类型解析信息
 */
export function parseInfoByType(
	infobox: InfoboxItem[] | undefined,
	subjectType: SubjectType,
	typeLabel?: string
): ParsedInfo {
	// 先根据条目类型判断
	switch (subjectType) {
		case SubjectType.Anime:
			return parseAnimeInfo(infobox);

		case SubjectType.Game:
			return parseGameInfo(infobox);

		case SubjectType.Book:
			// 书籍类型需要根据细分类别区分
			if (typeLabel) {
				if (typeLabel.includes('小说')) {
					return parseNovelInfo(infobox);
				}
				if (typeLabel.includes('漫画')) {
					return parseComicInfo(infobox);
				}
				if (typeLabel.includes('画集') || typeLabel.includes('画本')) {
					return parseAlbumInfo(infobox);
				}
			}
			// 默认尝试从 infobox 判断
			if (infobox) {
				const type = getInfoboxValue(infobox, '类型');
				if (type) {
					if (type.includes('小说')) {
						return parseNovelInfo(infobox);
					}
					if (type.includes('漫画')) {
						return parseComicInfo(infobox);
					}
				}
			}
			// 默认返回小说解析
			return parseNovelInfo(infobox);

		case SubjectType.Music:
			return {
				category: getInfoboxValue(infobox, '类型') || '音乐',
			};

		case SubjectType.Real:
			return {
				category: getInfoboxValue(infobox, '类型') || '三次元',
			};

		default:
			return { category: '未知' };
	}
}

/**
 * 解析日期字符串，提取年份和月份
 */
export function parseDate(dateStr: string | undefined): { year: string; month: string } {
	if (!dateStr) {
		return { year: '', month: '' };
	}

	// 尝试匹配 "YYYY年MM月" 格式
	const match1 = dateStr.match(/(\d{4})年(\d{1,2})月/);
	if (match1) {
		return { year: match1[1], month: match1[2] };
	}

	// 尝试匹配 "YYYY-MM-DD" 格式
	const match2 = dateStr.match(/(\d{4})-(\d{2})/);
	if (match2) {
		return { year: match2[1], month: match2[2] };
	}

	// 尝试匹配 "YYYY/MM/DD" 格式
	const match3 = dateStr.match(/(\d{4})\/(\d{1,2})/);
	if (match3) {
		return { year: match3[1], month: match3[2] };
	}

	// 只提取年份
	const yearMatch = dateStr.match(/(\d{4})/);
	if (yearMatch) {
		return { year: yearMatch[1], month: '' };
	}

	return { year: '', month: '' };
}

/**
 * 清理简介文本（去除多余空白和换行）
 */
export function cleanSummary(summary: string | undefined): string {
	if (!summary) return '';

	return summary
		.replace(/&nbsp;/g, '\n')
		.replace(/\s{4,}/g, '\n')
		.trim();
}

/**
 * 清理多行文本，使其适合作为 YAML 字符串值
 * 将换行替换为空格，并移除多余空白
 */
export function cleanMultilineText(text: string | undefined): string {
	if (!text) return '';

	return text
		.replace(/\r\n/g, ' ')  // Windows 换行
		.replace(/\n/g, ' ')    // Unix 换行
		.replace(/\s+/g, ' ')   // 多个空格合并为一个
		.trim();
}
