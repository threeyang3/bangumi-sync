/**
 * 设置数据结构
 */

import { SubjectType, CollectionType } from '../../common/api/types';
import {
	ANIME_TEMPLATE,
	NOVEL_TEMPLATE,
	COMIC_TEMPLATE,
	GAME_TEMPLATE,
	ALBUM_TEMPLATE,
	MUSIC_TEMPLATE,
	REAL_TEMPLATE,
} from '../../common/template/defaultTemplates';
import { ImageQuality } from '../../common/file/imageHandler';

/**
 * 模板来源类型
 */
export type TemplateSource = 'default' | 'file' | 'custom';

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
 * 插件设置
 */
export interface BangumiPluginSettings {
	// 认证
	accessToken: string;

	// 路径配置
	syncPathTemplate: string;
	downloadImages: boolean;
	imagePathTemplate: string;

	// 图片设置
	imageQuality: ImageQuality;
	imageUpdateExisting: boolean;

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
}

/**
 * 默认模板配置
 */
const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
	source: 'default',
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
	syncPathTemplate: 'ACGN/{{type}}/{{name_cn}}.md',
	downloadImages: true,
	imagePathTemplate: 'ACGN/assets/{{id}}_cover.jpg',

	// 图片设置
	imageQuality: 'large',
	imageUpdateExisting: false,

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
};

// 兼容旧版本的类型别名
export type BangumiPluginSettingsV3 = BangumiPluginSettings;
export const DEFAULT_SETTINGS_V3 = DEFAULT_SETTINGS;
