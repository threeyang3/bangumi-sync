/**
 * 用户数据保护功能类型定义
 *
 * 导出/继承只保留三部分：
 * - identifier: 用于识别条目的属性
 * - customProperties: 所有本地自定义属性
 * - bodySections: 正文中的记录/感想两部分
 */

import { SubjectType } from '../../common/api/types';

export enum UserDataType {
	USER_PROPERTIES = 'userProperties',
	CUSTOM_PROPERTIES = 'customProperties',
	BODY_CONTENT = 'bodySections',
	ALL = 'all'
}

export const IDENTIFIER_FIELDS = new Set([
	'id', 'ID',
	'中文名', 'name_cn',
	'作品大类', 'type',
]);

export const USER_PROPERTY_FIELDS = new Set([
	'观看状态', '阅读状态', '游玩状态', '收藏状态',
	'评分', '短评',
	'tags', 'Tags',
	'进度',
]);

export const BANGUMI_FIELDS = new Set([
	'id', 'ID',
	'中文名', '原名', '别名',
	'作品大类', '具体类型',
	'Bangumi评分', 'Bangumi链接', '封面',
	'观看状态', '阅读状态', '游玩状态', '收藏状态',
	'评分', '短评',
	'tags', 'Tags',
	'开播时间', '集数', '动画公司', '导演', '音乐', '官方网站',
	'作者', '插画', '书系', '册数', '发行日期', '出版社', '官网',
	'话数', '杂志', '作画',
	'开发', '发行', '游玩人数',
	'页数', 'ISBN',
	'上映日期',
	'进度',
	'相关',
	'平台',
	'开始',
	'国家', '语言', '每集长', '电视台', '主演', '编剧',
]);

export function hasUserDataType(dataTypes: UserDataType[], target: UserDataType): boolean {
	return dataTypes.includes(UserDataType.ALL) || dataTypes.includes(target);
}

export function isUserPropertyField(fieldName: string): boolean {
	return USER_PROPERTY_FIELDS.has(fieldName);
}

export function isCustomPropertyField(fieldName: string): boolean {
	return !IDENTIFIER_FIELDS.has(fieldName)
		&& !BANGUMI_FIELDS.has(fieldName)
		&& !USER_PROPERTY_FIELDS.has(fieldName);
}

export interface SubjectIdentifier {
	id: number;
	name_cn: string;
	type: number;
	workType?: string;
}

export interface SubjectUserData {
	identifier: SubjectIdentifier;
	legacy?: {
		tags?: string[];
		rate?: number;
		comment?: string;
		storage?: string | string[] | null;
		ratingDetails?: Record<string, string>;
	};
	customProperties?: Record<string, unknown>;
	bodySections?: {
		record?: string;
		thoughts?: string;
	};
}

export interface UserDataExport {
	version: string;
	exportTime: string;
	subjectType: string;
	totalCount: number;
	items: Record<number, SubjectUserData>;
}

export interface ImportOptions {
	mergeStrategy: 'prefer_local' | 'prefer_import' | 'smart';
	dataTypes: UserDataType[];
	propertyManage?: PropertyManageMap;
}

export interface MissingFieldDecision {
	subjectId: number;
	subjectName: string;
	fieldName: string;
	fieldValue: unknown;
	decision: 'add' | 'skip' | null;
}

export interface ImportResult {
	success: number;
	skipped: number;
	autoImported: number;
	errors: Array<{ id: number; name_cn: string; error: string; }>;
	missingFields: MissingFieldDecision[];
}

export interface PropertyManageDecision {
	ignore: boolean;
	aliasTo?: string;
}

export type PropertyManageMap = Record<string, PropertyManageDecision>;

export interface PropertyDiff {
	fieldName: string;
	localValue: unknown;
	importValue: unknown;
	fieldType?: 'frontmatter' | 'section';
	decision: 'local' | 'import' | 'merge' | 'skip' | null;
}

export interface ImportItemDiff {
	subjectId: number;
	name_cn: string;
	diffs: PropertyDiff[];
	hasDiff: boolean;
}

export interface DataProtectionSettings {
	preserveRatingDetails: boolean;
	preserveCustomProperties: boolean;
	preserveRecord: boolean;
	preserveThoughts: boolean;
}

export const DEFAULT_DATA_PROTECTION_SETTINGS: DataProtectionSettings = {
	preserveRatingDetails: true,
	preserveCustomProperties: true,
	preserveRecord: true,
	preserveThoughts: true,
};

export const SUBJECT_TYPE_LABELS: Record<number, string> = {
	[SubjectType.Anime]: 'anime',
	[SubjectType.Book]: 'novel',
	[SubjectType.Music]: 'music',
	[SubjectType.Game]: 'game',
	[SubjectType.Real]: 'real',
};
