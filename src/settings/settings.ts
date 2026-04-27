/**
 * 设置数据结构
 */

import { SubjectType, CollectionType } from '../../common/api/types';
import { ImageQuality } from '../../common/file/imageHandler';
import { DataProtectionSettings, DEFAULT_DATA_PROTECTION_SETTINGS } from '../userData/types';

/**
 * 模板来源类型
 * - standard: 标准模板（只含 Bangumi 数据）
 * - author: 作者自用模板（含自定义变量）
 * - file: 从文件选择
 * - custom: 自定义内容
 */
export type TemplateSource = 'standard' | 'author' | 'file' | 'custom';

/**
 * 模板配置
 */
export interface TemplateConfig {
	source: TemplateSource;
	filePath?: string;
	customContent?: string;
}

/**
 * 控制面板筛选条件
 */
export interface PanelFilters {
	subjectType: SubjectType | 'all';          // 条目类型筛选
	collectionType: CollectionType | 'all';    // 收藏状态筛选
	syncStatus: 'synced' | 'unsynced' | 'all'; // 同步状态筛选
	keyword: string;                           // 关键词搜索
}

/**
 * 默认属性值配置
 * 用于批量同步时自动填充空属性
 */
export interface DefaultPropertyValues {
	// 动画默认值
	anime_storage?: string;        // 存储
	anime_resourceAttr?: string;   // 资源属性
	anime_slogan?: string;         // 标语
	anime_related?: string;        // 相关

	// 小说默认值
	novel_version?: string;        // 版本
	novel_kindle?: boolean;        // Kindle
	novel_saved?: boolean;         // 保存
	novel_related?: string;        // 相关
	novel_channel?: string;        // 渠道
	novel_purchased?: boolean;     // 已购

	// 漫画默认值
	comic_version?: string;        // 版本
	comic_format?: string;         // 格式
	comic_kindle?: boolean;        // Kindle
	comic_related?: string;        // 相关
	comic_channel?: string;        // 渠道
	comic_purchased?: boolean;     // 已购

	// 游戏默认值
	game_platform?: string;        // 平台
	game_storage?: string;         // 存储
	game_related?: string;         // 相关
	game_slogan?: string;          // 标语
}

/**
 * 封面链接类型
 * - network: 网络链接（Bangumi CDN 地址）
 * - local: 本地链接（下载到本地的相对路径）
 */
export type CoverLinkType = 'network' | 'local';

/**
 * 插件设置
 */
export interface BangumiPluginSettings {
	// 认证
	accessToken: string;

	// 路径配置
	syncPathTemplate: string;
	downloadImages: boolean;
	imagePathTemplate: string;
	notePathTemplate: string; // 笔记链接路径模板

	// 图片设置
	imageQuality: ImageQuality;
	imageUpdateExisting: boolean;
	coverLinkType: CoverLinkType; // 封面链接类型

	// 扫描文件夹路径
	scanFolderPath: string;

	// 模板配置
	animeTemplateConfig: TemplateConfig;
	novelTemplateConfig: TemplateConfig;
	comicTemplateConfig: TemplateConfig;
	gameTemplateConfig: TemplateConfig;
	albumTemplateConfig: TemplateConfig;
	musicTemplateConfig: TemplateConfig;
	realTemplateConfig: TemplateConfig;

	// 同步选项
	defaultSubjectTypes: SubjectType[];
	defaultCollectionTypes: CollectionType[];
	syncLimit: number;

	// 自动同步
	autoSync: boolean;
	autoSyncInterval: number;

	// 同步状态
	lastSyncTime: string | null;
	lastSyncCount: number;

	// 控制面板筛选条件持久化
	panelFilters: PanelFilters;

	// 默认属性值配置
	defaultPropertyValues: DefaultPropertyValues;

	// 相关条目链接
	enableRelatedLinks: boolean;  // 是否自动处理关联条目链接

	// 数据保护设置
	dataProtection: DataProtectionSettings;
}

/**
 * 默认模板配置
 */
const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
	source: 'standard',
};

/**
 * 默认面板筛选条件
 */
export const DEFAULT_PANEL_FILTERS: PanelFilters = {
	subjectType: 'all',
	collectionType: 'all',
	syncStatus: 'all',
	keyword: '',
};

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: BangumiPluginSettings = {
	accessToken: '',
	syncPathTemplate: 'ACGN/{{type}}/{{name_cn_with_type}}.md',
	downloadImages: true,
	imagePathTemplate: 'ACGN/assets/{{id}}_cover.jpg',
	notePathTemplate: '收集箱/笔记/ACGN',

	// 图片设置
	imageQuality: 'large',
	imageUpdateExisting: false,
	coverLinkType: 'network',

	scanFolderPath: 'ACGN',

	// 模板配置
	animeTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	novelTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	comicTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	gameTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	albumTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	musicTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	realTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },

	defaultSubjectTypes: [SubjectType.Book, SubjectType.Anime, SubjectType.Music, SubjectType.Game, SubjectType.Real],
	defaultCollectionTypes: [CollectionType.Wish, CollectionType.Done, CollectionType.Doing, CollectionType.OnHold, CollectionType.Dropped],
	syncLimit: 50,

	autoSync: false,
	autoSyncInterval: 60,

	lastSyncTime: null,
	lastSyncCount: 0,

	// 控制面板筛选条件
	panelFilters: { ...DEFAULT_PANEL_FILTERS },

	// 默认属性值
	defaultPropertyValues: {},

	// 相关条目链接
	enableRelatedLinks: true,

	// 数据保护设置
	dataProtection: { ...DEFAULT_DATA_PROTECTION_SETTINGS },
};

// 兼容旧版本的类型别名
export type BangumiPluginSettingsV3 = BangumiPluginSettings;
export const DEFAULT_SETTINGS_V3 = DEFAULT_SETTINGS;
