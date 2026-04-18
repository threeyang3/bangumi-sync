/**
 * Bangumi Sync V1 插件入口
 */

import { Plugin, Notice, TFile } from 'obsidian';
import { BangumiPluginSettings, DEFAULT_SETTINGS, TemplateConfig } from './src/settings/settings';
import { BangumiSettingTab } from './src/settings/settingsTab';
import { BangumiClient } from './src/api/client';
import { SyncManager, SyncManagerConfig } from './src/sync/syncManager';
import { SyncModal } from './src/ui/syncModal';
import { SyncOptionsModal, SyncOptions } from './src/ui/syncOptionsModal';
import { SyncProgress } from './src/sync/syncStatus';
import {
	ANIME_TEMPLATE,
	NOVEL_TEMPLATE,
	COMIC_TEMPLATE,
	GAME_TEMPLATE,
	ALBUM_TEMPLATE,
	MUSIC_TEMPLATE,
	REAL_TEMPLATE,
} from '../common/template/defaultTemplates';

/**
 * 模板类型键名
 */
type TemplateKey = 'animeTemplateConfig' | 'novelTemplateConfig' | 'comicTemplateConfig' | 'gameTemplateConfig' | 'albumTemplateConfig' | 'musicTemplateConfig' | 'realTemplateConfig';

/**
 * 模板集合类型
 */
interface TemplatesMap {
	anime: string;
	novel: string;
	comic: string;
	game: string;
	album: string;
	music: string;
	real: string;
}

const TEMPLATE_CONFIG_MAP: Record<TemplateKey, string> = {
	animeTemplateConfig: ANIME_TEMPLATE,
	novelTemplateConfig: NOVEL_TEMPLATE,
	comicTemplateConfig: COMIC_TEMPLATE,
	gameTemplateConfig: GAME_TEMPLATE,
	albumTemplateConfig: ALBUM_TEMPLATE,
	musicTemplateConfig: MUSIC_TEMPLATE,
	realTemplateConfig: REAL_TEMPLATE,
};

export class BangumiPlugin extends Plugin {
	settings: BangumiPluginSettings;
	client: BangumiClient;
	syncManager: SyncManager | null = null;
	private autoSyncIntervalId: number | null = null;
	private syncModal: SyncModal | null = null;

	async onload() {
		await this.loadSettings();

		// 初始化 API 客户端
		this.client = new BangumiClient(this.settings.accessToken);

		// 初始化同步管理器
		await this.initSyncManager();

		// 添加命令：打开同步选项弹窗
		this.addCommand({
			id: 'sync-collections',
			name: '同步 Bangumi 收藏',
			callback: () => this.openSyncOptions(),
		});

		// 添加命令：快速同步（使用默认设置）
		this.addCommand({
			id: 'quick-sync-collections',
			name: '快速同步（使用默认设置）',
			callback: () => this.syncCollections(),
		});

		// 添加 Ribbon 图标
		this.addRibbonIcon('refresh-cw', '同步 Bangumi', () => {
			this.openSyncOptions();
		});

		// 添加设置面板
		this.addSettingTab(new BangumiSettingTab(this.app, this));

		// 设置自动同步
		if (this.settings.autoSync) {
			this.setupAutoSync();
		}
	}

	onunload() {
		// 清除自动同步定时器
		if (this.autoSyncIntervalId !== null) {
			window.clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = null;
		}

		// 关闭同步弹窗
		if (this.syncModal) {
			this.syncModal.close();
			this.syncModal = null;
		}
	}

	/**
	 * 加载设置
	 */
	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * 保存设置
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 更新客户端配置
	 */
	async updateClient() {
		this.client.setAccessToken(this.settings.accessToken);
		await this.initSyncManager();
	}

	/**
	 * 初始化同步管理器
	 */
	private async initSyncManager() {
		// 获取各类型模板
		const templates = await this.getTemplates();

		const config: SyncManagerConfig = {
			accessToken: this.settings.accessToken,
			pathTemplate: this.settings.syncPathTemplate,
			imagePathTemplate: this.settings.imagePathTemplate,
			downloadImages: this.settings.downloadImages,
			customTemplates: templates,
		};

		this.syncManager = new SyncManager(this.app, config);
	}

	/**
	 * 获取各类型模板（支持从文件读取）
	 */
	private async getTemplates(): Promise<TemplatesMap> {
		const templateKeys: TemplateKey[] = [
			'animeTemplateConfig',
			'novelTemplateConfig',
			'comicTemplateConfig',
			'gameTemplateConfig',
			'albumTemplateConfig',
			'musicTemplateConfig',
			'realTemplateConfig',
		];

		const templateNames: (keyof TemplatesMap)[] = [
			'anime', 'novel', 'comic', 'game', 'album', 'music', 'real'
		];

		const templates: TemplatesMap = {
			anime: '',
			novel: '',
			comic: '',
			game: '',
			album: '',
			music: '',
			real: '',
		};

		for (let i = 0; i < templateKeys.length; i++) {
			const key = templateKeys[i];
			const name = templateNames[i];
			templates[name] = await this.resolveTemplate(key);
		}

		return templates;
	}

	/**
	 * 解析单个模板配置，返回实际模板内容
	 */
	private async resolveTemplate(configKey: TemplateKey): Promise<string> {
		const config = this.settings[configKey] as TemplateConfig;
		const defaultTemplate = TEMPLATE_CONFIG_MAP[configKey];

		switch (config.source) {
			case 'file':
				if (config.filePath) {
					try {
						const file = this.app.vault.getAbstractFileByPath(config.filePath);
						if (file instanceof TFile) {
							return await this.app.vault.read(file);
						}
					} catch (error) {
						console.error(`[Bangumi Sync] 读取模板文件失败: ${config.filePath}`, error);
						new Notice(`模板文件读取失败: ${config.filePath}`);
					}
				}
				return defaultTemplate;

			case 'custom':
				return config.customContent || defaultTemplate;

			case 'default':
			default:
				return defaultTemplate;
		}
	}

	/**
	 * 打开同步选项弹窗
	 */
	openSyncOptions() {
		if (!this.settings.accessToken) {
			new Notice('请先在设置中配置 Access Token');
			return;
		}

		const modal = new SyncOptionsModal(
			this.app,
			{
				subjectTypes: this.settings.defaultSubjectTypes,
				collectionTypes: this.settings.defaultCollectionTypes,
				limit: this.settings.syncLimit,
				force: false,
			},
			(options: SyncOptions) => {
				this.syncCollectionsWithOptions(options);
			}
		);
		modal.open();
	}

	/**
	 * 使用默认设置执行同步
	 */
	async syncCollections() {
		await this.syncCollectionsWithOptions({
			subjectTypes: this.settings.defaultSubjectTypes,
			collectionTypes: this.settings.defaultCollectionTypes,
			limit: this.settings.syncLimit,
			force: false,
		});
	}

	/**
	 * 使用指定选项执行同步
	 */
	async syncCollectionsWithOptions(options: SyncOptions) {
		if (!this.settings.accessToken) {
			new Notice('请先在设置中配置 Access Token');
			return;
		}

		// 验证选项
		if (options.subjectTypes.length === 0) {
			new Notice('请至少选择一种条目类型');
			return;
		}

		if (options.collectionTypes.length === 0) {
			new Notice('请至少选择一种收藏状态');
			return;
		}

		// 打开同步进度弹窗
		this.syncModal = new SyncModal(this.app);
		this.syncModal.open();

		// 设置进度回调
		if (this.syncManager) {
			this.syncManager.setProgressCallback((progress: SyncProgress) => {
				if (this.syncModal) {
					this.syncModal.updateProgress(progress);
				}
			});

			// 执行同步
			const result = await this.syncManager.sync(options);

			// 更新设置中的同步状态
			this.settings.lastSyncTime = new Date().toISOString();
			this.settings.lastSyncCount = result.added + result.skipped;
			await this.saveSettings();

			// 显示结果
			new Notice(
				`同步完成！新增: ${result.added}, 跳过: ${result.skipped}, 错误: ${result.errors}`
			);
		}

		// 关闭弹窗（延迟一下让用户看到完成状态）
		setTimeout(() => {
			if (this.syncModal) {
				this.syncModal.close();
				this.syncModal = null;
			}
		}, 1000);
	}

	/**
	 * 设置自动同步
	 */
	setupAutoSync() {
		// 清除现有定时器
		if (this.autoSyncIntervalId !== null) {
			window.clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = null;
		}

		// 设置新的定时器
		if (this.settings.autoSync && this.settings.autoSyncInterval > 0) {
			const intervalMs = this.settings.autoSyncInterval * 60 * 1000;
			this.autoSyncIntervalId = window.setInterval(() => {
				this.syncCollections();
			}, intervalMs);
		}
	}
}

export default BangumiPlugin;
