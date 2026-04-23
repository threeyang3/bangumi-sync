/**
 * 条目信息解析器
 * 从 Bangumi API 返回的 infobox 中解析各类型条目的特定字段
 */

import { InfoboxItem, SubjectType } from '../api/types';

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
 * 从 infobox 中获取指定 key 的值（支持多个备选 key）
 */
function getInfoboxValue(infobox: InfoboxItem[] | undefined, key: string, alternateKeys?: string[]): string | undefined {
	if (!infobox) return undefined;

	// 首先尝试主 key
	const item = infobox.find(i => i.key === key);
	if (item) {
		if (typeof item.value === 'string') {
			return item.value.trim();
		}

		// 处理数组类型的值
		if (Array.isArray(item.value)) {
			// 如果是 {k, v} 格式的数组
			if (item.value.length > 0 && typeof item.value[0] === 'object' && 'v' in item.value[0]) {
				return item.value.map(v => (v as { k: string; v: string }).v).join('、');
			}
			// 如果数组元素是字符串或数字，直接 join
			if (item.value.every(v => typeof v === 'string' || typeof v === 'number')) {
				return item.value.join('、');
			}
			// 其他情况，尝试提取 v 属性
			return item.value.map(v => {
				if (typeof v === 'object' && v !== null && 'v' in v) {
					return (v as { k: string; v: string }).v;
				}
				return String(v);
			}).join('、');
		}
	}

	// 尝试备选 key
	if (alternateKeys) {
		for (const altKey of alternateKeys) {
			const altItem = infobox.find(i => i.key === altKey);
			if (altItem) {
				if (typeof altItem.value === 'string') {
					return altItem.value.trim();
				}

				if (Array.isArray(altItem.value)) {
					if (altItem.value.length > 0 && typeof altItem.value[0] === 'object' && 'v' in altItem.value[0]) {
						return altItem.value.map(v => (v as { k: string; v: string }).v).join('、');
					}
					// Handle array of objects without 'v' property
					if (altItem.value.length > 0 && typeof altItem.value[0] === 'object') {
						return altItem.value.map(v => {
							if (typeof v === 'object' && v !== null && 'v' in v) {
								return (v as { k: string; v: string }).v;
							}
							return JSON.stringify(v);
						}).join('、');
					}
					return altItem.value.map(v => String(v)).join('、');
				}
			}
		}
	}

	return undefined;
}

/**
 * 从 infobox 中获取链接字段的 URL
 * 链接字段格式如: [{"k":"特设网站","v":"https://..."}]
 */
function getWebsiteValue(infobox: InfoboxItem[] | undefined, keys: string[]): string | undefined {
	if (!infobox) return undefined;

	for (const key of keys) {
		const item = infobox.find(i => i.key === key);
		if (item) {
			// 字符串类型直接返回
			if (typeof item.value === 'string') {
				return item.value.trim();
			}

			// 数组类型：提取 URL
			if (Array.isArray(item.value)) {
				if (item.value.length > 0 && typeof item.value[0] === 'object' && 'v' in item.value[0]) {
					// 提取所有 URL，用换行分隔
					return item.value.map(v => (v as { k: string; v: string }).v).join('\n');
				}
			}
		}
	}

	return undefined;
}

/**
 * 从版本信息数组中提取指定字段的值
 * 版本信息格式如: [{"k":"书系","v":"Kadokawa Fantastic Novels"},{"k":"册数","v":"2"}]
 */
function getValueFromVersion(infobox: InfoboxItem[] | undefined, versionKey: string, fieldKey: string): string | undefined {
	if (!infobox) return undefined;

	// 查找版本信息项
	const versionItem = infobox.find(i => i.key.includes(versionKey) || i.key === '版本');
	if (!versionItem || !Array.isArray(versionItem.value)) return undefined;

	// 从版本数组中查找指定字段
	const field = versionItem.value.find((item: { k: string; v: string }) => item.k === fieldKey);
	return field?.v;
}

/**
 * 从版本信息数组中提取指定字段的数值
 */
function getNumberFromVersion(infobox: InfoboxItem[] | undefined, versionKey: string, fieldKey: string): number | undefined {
	const value = getValueFromVersion(infobox, versionKey, fieldKey);
	if (value) {
		const num = parseInt(value, 10);
		return isNaN(num) ? undefined : num;
	}
	return undefined;
}

/**
 * 从 infobox 中获取指定 key 的数值（支持多个备选 key）
 */
function getInfoboxNumber(infobox: InfoboxItem[] | undefined, key: string, alternateKeys?: string[]): number | undefined {
	const value = getInfoboxValue(infobox, key, alternateKeys);
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
	// 首先尝试获取动画制作字段
	let animeMake = getInfoboxValue(infobox, '动画制作');

	// 如果没有动画制作字段，尝试从 Copyright 提取（针对吉卜力等作品）
	if (!animeMake) {
		animeMake = extractAnimeMakeFromCopyright(infobox);
	}

	return {
		category: getInfoboxValue(infobox, '类型', ['播放日期']) || 'TV',
		episode: getInfoboxNumber(infobox, '话数'),
		director: getInfoboxValue(infobox, '导演', ['监督', '总导演']),
		music: getInfoboxValue(infobox, '音乐', ['音乐制作', '音乐人']),
		animeMake: animeMake,
		musicMake: getInfoboxValue(infobox, '音乐制作', ['音乐']),
		staff: getInfoboxValue(infobox, '脚本', ['系列构成', '剧本']),
		audioDirector: getInfoboxValue(infobox, '音响监督', ['音响']),
		artDirector: getInfoboxValue(infobox, '美术监督', ['美术']),
		animeChief: getInfoboxValue(infobox, '总作画监督', ['作画监督']),
		from: getInfoboxValue(infobox, '原作', ['原案']),
		website: getWebsiteValue(infobox, ['官方网站', '官网', '网站', '链接']),
	};
}

/**
 * 从 Copyright 字段提取动画公司
 * 针对吉卜力等作品，格式如 "© 1989 角野栄子・Studio Ghibli・N"
 */
function extractAnimeMakeFromCopyright(infobox: InfoboxItem[] | undefined): string | undefined {
	if (!infobox) return undefined;

	const copyrightItem = infobox.find(i => i.key === 'Copyright');
	if (!copyrightItem || typeof copyrightItem.value !== 'string') return undefined;

	const copyright = copyrightItem.value;

	// 常见动画公司关键词（按优先级排序）
	const studioPatterns = [
		'Studio Ghibli', 'スタジオジブリ',
		'GHIBLI', 'ジブリ',
		'TOEI ANIMATION', '東映アニメーション',
		'MAPPA', 'WIT STUDIO', 'BONES',
		'A-1 Pictures', 'SHAFT', 'ufotable',
		'Kyoto Animation', '京都アニメーション', '京阿尼',
		'Production I.G', 'SUNRISE', 'SUNRISE BEYOND',
		'TRIGGER', 'CloverWorks', 'MADHOUSE',
		'SILVER LINK.', 'J.C.STAFF',
		'TMS Entertainment', 'シンエイ動画',
		'ピーエーワークス', 'P.A.WORKS',
		'Doga Kobo', '動画工房',
		'LIDENFILMS', 'SANZIGEN',
		'ORDET', '8bit',
		'Brain\'s Base', 'feel.',
		'白組', 'Shirogumi',
		'タイタン工業', // Titan Kogyo
	];

	for (const pattern of studioPatterns) {
		if (copyright.includes(pattern)) {
			return pattern;
		}
	}

	return undefined;
}

/**
 * 解析小说信息
 */
export function parseNovelInfo(infobox: InfoboxItem[] | undefined): ParsedInfo {
	const author = getInfoboxValue(infobox, '作者', ['原作']);
	const start = getInfoboxValue(infobox, '开始', ['连载开始']);
	const end = getInfoboxValue(infobox, '结束', ['连载结束']);

	const illustration = getInfoboxValue(infobox, '插图', ['插画']);
	const publish = getInfoboxValue(infobox, '出版社');

	// 书系：优先从版本信息中获取，否则使用顶层字段
	const seriesFromVersion = getValueFromVersion(infobox, '版本', '书系');
	const series = seriesFromVersion || getInfoboxValue(infobox, '书系', ['丛书', '系列', '文库', '图书品牌']);

	// 册数：优先从版本信息中获取，否则使用顶层字段
	const volumesFromVersion = getNumberFromVersion(infobox, '版本', '册数');
	const volumes = volumesFromVersion || getInfoboxNumber(infobox, '册数', ['卷数']);

	// 官网：使用专门的函数处理链接数组格式
	const website = getWebsiteValue(infobox, ['官方网站', '官网', '网站', '链接']);
	const journal = getInfoboxValue(infobox, '连载杂志');

	return {
		category: getInfoboxValue(infobox, '类型') || '小说',
		author,
		illustration,
		publish,
		series,
		volumes,
		status: end ? '已完结' : '连载中',
		progress: start ? `${start} - ${end || '连载中'}` : undefined,
		start,
		end,
		website,
		journal,
	};
}

/**
 * 解析漫画信息
 */
export function parseComicInfo(infobox: InfoboxItem[] | undefined): ParsedInfo {
	const author = getInfoboxValue(infobox, '作者', ['原作']);
	const start = getInfoboxValue(infobox, '开始', ['连载开始']);
	const end = getInfoboxValue(infobox, '结束', ['连载结束']);

	return {
		category: getInfoboxValue(infobox, '类型') || '漫画',
		author,
		staff2: getInfoboxValue(infobox, '作画'),
		publish: getInfoboxValue(infobox, '出版社'),
		journal: getInfoboxValue(infobox, '连载杂志', ['连载']),
		episode: getInfoboxNumber(infobox, '话数', ['册数']),
		status: end ? '已完结' : '连载中',
		progress: start ? `${start} - ${end || '连载中'}` : undefined,
		start,
		end,
		website: getWebsiteValue(infobox, ['官方网站', '官网', '网站', '链接']),
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
		website: getWebsiteValue(infobox, ['官方网站', '官网', '网站', '链接']),
	};
}

/**
 * 解析画集信息
 */
export function parseAlbumInfo(infobox: InfoboxItem[] | undefined): ParsedInfo {
	return {
		category: getInfoboxValue(infobox, '类型') || '画集',
		author: getInfoboxValue(infobox, '作者', ['原作', '插图', '插画']),
		publish: getInfoboxValue(infobox, '出版社'),
		pages: getInfoboxNumber(infobox, '页数'),
		isbn: getInfoboxValue(infobox, 'ISBN'),
		website: getWebsiteValue(infobox, ['官方网站', '官网', '网站', '链接']),
	};
}

/**
 * 根据条目类型解析信息
 */
export function parseInfoByType(
	infobox: InfoboxItem[] | undefined,
	subjectType: SubjectType,
	platform?: string
): ParsedInfo {
	// 先根据条目类型判断
	switch (subjectType) {
		case SubjectType.Anime:
			return parseAnimeInfo(infobox);

		case SubjectType.Game:
			return parseGameInfo(infobox);

		case SubjectType.Book:
			// 书籍类型需要根据 platform 或 infobox 区分
			// 首先检查 platform 字段
			if (platform) {
				if (platform.includes('小说') || platform.includes('轻小说')) {
					return parseNovelInfo(infobox);
				}
				if (platform.includes('漫画')) {
					return parseComicInfo(infobox);
				}
				if (platform.includes('画集') || platform.includes('画本') || platform.includes('画册')) {
					return parseAlbumInfo(infobox);
				}
			}
			// 尝试从 infobox 判断
			if (infobox) {
				const type = getInfoboxValue(infobox, '类型');
				if (type) {
					if (type.includes('小说')) {
						return parseNovelInfo(infobox);
					}
					if (type.includes('漫画')) {
						return parseComicInfo(infobox);
					}
					if (type.includes('画集') || type.includes('画本') || type.includes('画册')) {
						return parseAlbumInfo(infobox);
					}
				}
				// 检查是否有画集特征字段
				const pages = getInfoboxNumber(infobox, '页数');
				const isbn = getInfoboxValue(infobox, 'ISBN');
				if (pages || isbn) {
					// 有页数或 ISBN，可能是画集
					// 但需要排除小说（小说通常有作者、出版社等）
					const author = getInfoboxValue(infobox, '作者', ['原作']);
					if (!author && (pages || isbn)) {
						return parseAlbumInfo(infobox);
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
