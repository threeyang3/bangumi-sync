/**
 * 设置数据结构
 */

import { SubjectType, CollectionType } from '../../../common/api/types';
import {
	ANIME_TEMPLATE,
	NOVEL_TEMPLATE,
	COMIC_TEMPLATE,
	GAME_TEMPLATE,
	ALBUM_TEMPLATE,
	MUSIC_TEMPLATE,
	REAL_TEMPLATE,
} from '../../../common/template/defaultTemplates';

/**
 * 模板来源类型
 */
export type TemplateSource = 'default' | 'file' | 'custom';

/**
 * 模板配置
 */
export interface TemplateConfig {
	source: TemplateSource;        // 模板来源：默认/文件/自定义
	filePath?: string;             // 文件路径（当 source 为 'file' 时）
	customContent?: string;        // 自定义内容（当 source 为 'custom' 时）
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

	// 模板配置（新版：支持文件选择）
	animeTemplateConfig: TemplateConfig;
	novelTemplateConfig: TemplateConfig;
	comicTemplateConfig: TemplateConfig;
	gameTemplateConfig: TemplateConfig;
	albumTemplateConfig: TemplateConfig;
	musicTemplateConfig: TemplateConfig;
	realTemplateConfig: TemplateConfig;

	// 内容模板（旧版，保留兼容）
	animeTemplate: string;
	novelTemplate: string;
	comicTemplate: string;
	gameTemplate: string;
	albumTemplate: string;
	musicTemplate: string;
	realTemplate: string;

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
	syncedIds: number[];
}

/**
 * 默认模板配置
 */
const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
	source: 'default',
};

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: BangumiPluginSettings = {
	accessToken: '',
	syncPathTemplate: 'ACGN/{{type}}/{{name_cn}}.md',
	downloadImages: true,
	imagePathTemplate: 'ACGN/assets/{{id}}_cover.jpg',

	// 新版模板配置
	animeTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	novelTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	comicTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	gameTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	albumTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	musicTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },
	realTemplateConfig: { ...DEFAULT_TEMPLATE_CONFIG },

	// 旧版模板（保留兼容）
	animeTemplate: ANIME_TEMPLATE,
	novelTemplate: NOVEL_TEMPLATE,
	comicTemplate: COMIC_TEMPLATE,
	gameTemplate: GAME_TEMPLATE,
	albumTemplate: ALBUM_TEMPLATE,
	musicTemplate: MUSIC_TEMPLATE,
	realTemplate: REAL_TEMPLATE,

	defaultSubjectTypes: [SubjectType.Book, SubjectType.Anime, SubjectType.Music, SubjectType.Game, SubjectType.Real],
	defaultCollectionTypes: [CollectionType.Wish, CollectionType.Done, CollectionType.Doing, CollectionType.OnHold, CollectionType.Dropped],
	syncLimit: 50,

	autoSync: false,
	autoSyncInterval: 60,

	lastSyncTime: null,
	lastSyncCount: 0,
	syncedIds: [],
};
