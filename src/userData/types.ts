/**
 * 用户数据保护功能类型定义
 *
 * 区分两类数据：
 * - 可从 Bangumi 获取的数据：不应继承/导出
 * - 用户自定义数据：应继承/导出
 */

import { SubjectType } from '../../common/api/types';

/**
 * 用户数据类型枚举
 */
export enum UserDataType {
    RATING_DETAILS = 'ratingDetails',     // 评分明细
    CUSTOM_PROPERTIES = 'customProperties', // 自定义属性
    RECORD = 'record',                     // 记录
    THOUGHTS = 'thoughts',                 // 感想
    ALL = 'all'
}

/**
 * 可从 Bangumi 获取的字段列表（用于过滤）
 * 这些字段不应被继承或导出
 */
export const BANGUMI_FIELDS = new Set([
    // 标识字段（保留，不导出但用于匹配）
    'id', 'ID',

    // 基本信息（从 Subject 获取）
    '中文名', '原名', '别名',
    'Bangumi评分', 'Bangumi链接', '封面',

    // 用户收藏信息（从 UserCollection 获取）
    '观看状态', '阅读状态', '游玩状态', '收藏状态',
    '评分', '短评',
    'tags', 'Tags',

    // 动画特有字段
    '开播时间', '集数', '动画公司', '导演', '音乐', '官方网站',

    // 小说特有字段
    '作者', '插画', '书系', '册数', '发行日期', '出版社', '官网',

    // 漫画特有字段
    '话数', '杂志', '作画',

    // 游戏特有字段
    '开发', '发行', '游玩人数',

    // 画集特有字段
    '页数', 'ISBN',

    // 三次元特有字段
    '上映日期',

    // 通用字段
    '进度',      // 连载状态，从 infobox 获取
    '相关',      // related subject links
    '作品大类',  // type label
    '具体类型',  // category
]);

/**
 * 评分明细字段名称映射
 */
export const RATING_DETAIL_FIELDS: Record<string, { key: keyof RatingDetails; frontmatterField: string }[]> = {
    // 动画
    [SubjectType.Anime]: [
        { key: 'music', frontmatterField: '音乐评分' },
        { key: 'character', frontmatterField: '人设评分' },
        { key: 'story', frontmatterField: '剧情评分' },
        { key: 'art', frontmatterField: '美术评分' },
    ],
    // 小说
    [SubjectType.Book]: [
        { key: 'story', frontmatterField: '剧情评分' },
        { key: 'illustration', frontmatterField: '插画评分' },
        { key: 'writing', frontmatterField: '文笔评分' },
        { key: 'character', frontmatterField: '人设评分' },
    ],
    // 漫画
    // 注意：漫画的 SubjectType 与小说相同，需要通过 category 区分
    // 这里使用字符串 'comic' 作为漫画的标识
    'comic': [
        { key: 'story', frontmatterField: '剧情评分' },
        { key: 'drawing', frontmatterField: '画工评分' },
        { key: 'character', frontmatterField: '人设评分' },
    ],
    // 游戏
    [SubjectType.Game]: [
        { key: 'story', frontmatterField: '剧情评分' },
        { key: 'fun', frontmatterField: '趣味评分' },
        { key: 'music', frontmatterField: '音乐评分' },
        { key: 'art', frontmatterField: '美术评分' },
    ],
};

/**
 * 评分明细
 */
export interface RatingDetails {
    music?: string;        // 音乐评分
    character?: string;    // 人设评分
    story?: string;        // 剧情评分
    art?: string;          // 美术评分
    illustration?: string; // 插画评分
    writing?: string;      // 文笔评分
    drawing?: string;      // 画工评分
    fun?: string;          // 趣味评分
}

/**
 * 单个条目的用户数据
 */
export interface SubjectUserData {
    id: number;                    // 条目 ID（用于匹配）
    name_cn: string;               // 中文名称（用于显示）
    type: number;                  // 条目类型
    workType?: string;             // 作品大类，用于区分 Book 下的小说、漫画、画集

    // 评分明细（按条目类型）
    ratingDetails?: RatingDetails;

    // 其他自定义属性（动态，包含所有非 Bangumi 字段）
    customProperties?: Record<string, unknown>;

    // 正文中的用户内容
    recordContent?: string;        // 记录部分内容
    thoughtsContent?: string;      // 感想部分内容
}

/**
 * 导出文件结构
 */
export interface UserDataExport {
    version: string;               // 导出格式版本
    exportTime: string;            // 导出时间
    subjectType: string;           // 条目类型（anime/novel/comic/game/music/real）
    totalCount: number;            // 总条目数
    items: Record<number, SubjectUserData>;
}

/**
 * 导入选项
 */
export interface ImportOptions {
    mergeStrategy: 'prefer_local' | 'prefer_import' | 'smart';
    dataTypes: UserDataType[];
}

/**
 * 缺失字段决策
 */
export interface MissingFieldDecision {
    subjectId: number;
    subjectName: string;
    fieldName: string;
    fieldValue: unknown;
    decision: 'add' | 'skip' | null;  // null 表示未决定
}

/**
 * 导入结果
 */
export interface ImportResult {
    success: number;
    skipped: number;
    errors: Array<{ id: number; name_cn: string; error: string; }>;
    missingFields: MissingFieldDecision[];
}

/**
 * 数据保护设置
 */
export interface DataProtectionSettings {
    preserveRatingDetails: boolean;    // 强制同步时保留评分明细
    preserveCustomProperties: boolean; // 强制同步时保留自定义属性
    preserveRecord: boolean;           // 强制同步时保留记录
    preserveThoughts: boolean;         // 强制同步时保留感想
}

/**
 * 默认数据保护设置
 */
export const DEFAULT_DATA_PROTECTION_SETTINGS: DataProtectionSettings = {
    preserveRatingDetails: true,
    preserveCustomProperties: true,
    preserveRecord: true,
    preserveThoughts: true,
};
