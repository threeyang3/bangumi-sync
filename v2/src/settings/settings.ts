/**
 * V2 设置数据结构
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
	source: TemplateSource;
	filePath?: string;
	customContent?: string;
}

/**
 * V2 插件设置
 */
export interface BangumiPluginSettingsV2 {
	// 认证
	accessToken: string;

	// 路径配置
	syncPathTemplate: string;
	downloadImages: boolean;
	imagePathTemplate: string;

	// V2 新增：扫描文件夹路径
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
}

/**
 * 默认模板配置
 */
const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
	source: 'default',
};

/**
 * V2 默认设置
 */
export const DEFAULT_SETTINGS_V2: BangumiPluginSettingsV2 = {
	accessToken: '',
	syncPathTemplate: 'ACGN/{{type}}/{{name_cn}}.md',
	downloadImages: true,
	imagePathTemplate: 'ACGN/assets/{{id}}_cover.jpg',

	// V2 新增
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
};
