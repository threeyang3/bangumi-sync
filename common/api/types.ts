/**
 * Bangumi API 类型定义
 * 基于 Bangumi OpenAPI 规范
 */

// ==================== 枚举类型 ====================

/**
 * 条目类型
 * - 1: 书籍 (Book)
 * - 2: 动画 (Anime)
 * - 3: 音乐 (Music)
 * - 4: 游戏 (Game)
 * - 6: 三次元 (Real)
 */
export enum SubjectType {
	Book = 1,
	Anime = 2,
	Music = 3,
	Game = 4,
	Real = 6
}

/**
 * 收藏类型
 * - 1: 想看 (Wish)
 * - 2: 看过 (Done)
 * - 3: 在看 (Doing)
 * - 4: 搁置 (OnHold)
 * - 5: 抛弃 (Dropped)
 */
export enum CollectionType {
	Wish = 1,
	Done = 2,
	Doing = 3,
	OnHold = 4,
	Dropped = 5
}

// ==================== 条目相关类型 ====================

export interface Images {
	small?: string;
	grid?: string;
	large?: string;
	medium?: string;
	common?: string;
}

export interface Rating {
	rank: number;
	total: number;
	count: {
		[key: number]: number;
	};
	score: number;
}

export interface Collection {
	wish: number;
	collect: number;
	doing: number;
	on_hold: number;
	dropped: number;
}

export interface Tag {
	name: string;
	count: number;
}

export interface InfoboxItem {
	key: string;
	value: string | Array<{ k: string; v: string }> | { k: string; v: string }[];
}

export interface Subject {
	id: number;
	type: SubjectType;
	name: string;
	name_cn: string;
	summary: string;
	date?: string;
	platform: string;
	images: Images;
	infobox?: InfoboxItem[];
	rating: Rating;
	collection: Collection;
	tags: Tag[];
	nsfw: boolean;
	locked: boolean;
	series: boolean;
	volumes: number;
	eps: number;
	total_episodes: number;
	meta_tags: string[];
}

export interface SlimSubject {
	id: number;
	type: SubjectType;
	name: string;
	name_cn: string;
	short_summary: string;
	date?: string;
	images: Images;
	volumes: number;
	eps: number;
	collection_total: number;
	score: number;
	rank: number;
	tags: Tag[];
}

// ==================== 用户收藏相关类型 ====================

export interface UserCollection {
	subject_id: number;
	subject_type: SubjectType;
	type: CollectionType;
	rate: number;
	comment?: string;
	tags: string[];
	ep_status: number;
	vol_status: number;
	updated_at: string;
	private: boolean;
	subject: SlimSubject;
}

export interface PagedResult<T> {
	total: number;
	limit: number;
	offset: number;
	data: T[];
}

// ==================== 角色相关类型 ====================

export interface RelatedCharacter {
	id: number;
	name: string;
	type: number;
	images: Images;
	relation: string;
	actors: Actor[];
}

export interface Actor {
	id: number;
	name: string;
	type: number;
	images: Images;
	short_summary: string;
}

export interface RelatedPerson {
	id: number;
	name: string;
	type: number;
	images: Images;
	relation: string;
	career: string[];
}

// ==================== 章节相关类型 ====================

export interface Episode {
	id: number;
	type: number;
	type_name: string;
	sort: number;
	name: string;
	name_cn: string;
	duration: string;
	airdate: string;
	comment: number;
	desc: string;
	status: string;
}

export interface PagedEpisodes {
	total: number;
	limit: number;
	offset: number;
	data: Episode[];
}

// ==================== 用户相关类型 ====================

export interface User {
	id: number;
	url: string;
	username: string;
	nickname: string;
	avatar: Images;
	sign: string;
	usergroup: number;
}

// ==================== 搜索相关类型 ====================

export interface SearchFilters {
	type?: SubjectType[];
	tag?: string[];
	air_date?: string[];
	rating?: string[];
	rating_count?: string[];
	rank?: string[];
	nsfw?: boolean;
}

export interface SearchParams {
	keyword: string;
	sort?: 'match' | 'heat' | 'rank' | 'score';
	filter?: SearchFilters;
}

// ==================== API 错误类型 ====================

export interface APIError {
	title: string;
	description?: string;
	details?: unknown;
}

// ==================== 辅助函数 ====================

/**
 * 获取条目类型的显示名称
 */
export function getSubjectTypeName(type: SubjectType): string {
	switch (type) {
		case SubjectType.Book:
			return '书籍';
		case SubjectType.Anime:
			return '动画';
		case SubjectType.Music:
			return '音乐';
		case SubjectType.Game:
			return '游戏';
		case SubjectType.Real:
			return '三次元';
		default:
			return '未知';
	}
}

/**
 * 获取条目类型的英文标识（用于路径模板）
 */
export function getSubjectTypeLabel(type: SubjectType): string {
	switch (type) {
		case SubjectType.Book:
			return 'book';
		case SubjectType.Anime:
			return 'anime';
		case SubjectType.Music:
			return 'music';
		case SubjectType.Game:
			return 'game';
		case SubjectType.Real:
			return 'real';
		default:
			return 'unknown';
	}
}

/**
 * 获取收藏类型的显示名称
 */
export function getCollectionTypeName(type: CollectionType): string {
	switch (type) {
		case CollectionType.Wish:
			return '想看';
		case CollectionType.Done:
			return '看过';
		case CollectionType.Doing:
			return '在看';
		case CollectionType.OnHold:
			return '搁置';
		case CollectionType.Dropped:
			return '抛弃';
		default:
			return '未知';
	}
}

/**
 * 获取收藏状态的表情符号
 */
export function getCollectionStatusEmoji(type: CollectionType): string {
	switch (type) {
		case CollectionType.Wish:
			return '想看🕒';
		case CollectionType.Done:
			return '已看✅';
		case CollectionType.Doing:
			return '在看▶️';
		case CollectionType.OnHold:
			return '搁置⏸️';
		case CollectionType.Dropped:
			return '放弃❌';
		default:
			return '';
	}
}
