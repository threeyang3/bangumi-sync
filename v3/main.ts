/**
 * Bangumi Sync V3 插件入口
 *
 * V3 新特性：
 * 1. 控制面板：展示所有收藏条目，标记同步状态
 * 2. 批量编辑：统一新增/修改/删除属性
 * 3. 撤销支持：批量编辑后可撤销
 * 4. 打开文件：直接打开已同步的本地文件
 */

import { Plugin, Notice, TFile } from 'obsidian';
import { BangumiPluginSettingsV3, DEFAULT_SETTINGS_V3, TemplateConfig, PanelFilters } from './src/settings/settings';
import { BangumiSettingTabV3 } from './src/settings/settingsTab';
import { SyncManagerV3, SyncManagerConfigV3 } from './src/sync/syncManager';
import { SyncModalV3 } from './src/ui/syncModal';
import { SyncOptionsModalV3, SyncOptionsV3Input } from './src/ui/syncOptionsModal';
import { SyncPreviewModalV3, SyncPreviewItem, SyncPreviewResult } from './src/ui/syncPreviewModal';
import { ControlPanel } from './src/panel/controlPanel';
import { SyncProgressV3 } from './src/sync/syncStatus';
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

export class BangumiPluginV3 extends Plugin {
	settings: BangumiPluginSettingsV3;
	syncManager: SyncManagerV3 | null = null;
	private autoSyncIntervalId: number | null = null;
	private syncModal: SyncModalV3 | null = null;
	private controlPanel: ControlPanel | null = null;

	async onload() {
		await this.loadSettings();

		// 初始化同步管理器
		await this.initSyncManager();

		// 添加命令：打开控制面板（V3 核心功能）
		this.addCommand({
			id: 'open-control-panel',
			name: '打开收藏管理面板',
			callback: () => this.openControlPanel(),
		});

		// 添加命令：同步收藏
		this.addCommand({
			id: 'sync-collections',
			name: '同步 Bangumi 收藏',
			callback: () => this.openSyncOptions(),
		});

		// 添加命令：快速同步
		this.addCommand({
			id: 'quick-sync-collections',
			name: '快速同步（使用默认设置）',
			callback: () => this.syncCollections(),
		});

		// 添加 Ribbon 图标
		this.addRibbonIcon('database', 'Bangumi 收藏管理', () => {
			this.openControlPanel();
		});

		// 添加设置面板
		this.addSettingTab(new BangumiSettingTabV3(
			this.app,
			this,
			this.settings,
			async () => {
				await this.saveSettings();
				await this.initSyncManager();
			}
		));

		// 设置自动同步
		if (this.settings.autoSync) {
			this.setupAutoSync();
		}

		console.log('[Bangumi Sync V3] 插件加载完成');
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

		// 关闭控制面板
		if (this.controlPanel) {
			this.controlPanel.close();
			this.controlPanel = null;
		}

		console.log('[Bangumi Sync V3] 插件卸载');
	}

	/**
	 * 加载设置
	 */
	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS_V3, loadedData);
	}

	/**
	 * 保存设置
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * 初始化同步管理器
	 */
	private async initSyncManager() {
		const templates = await this.getTemplates();

		const config: SyncManagerConfigV3 = {
			accessToken: this.settings.accessToken,
			pathTemplate: this.settings.syncPathTemplate,
			imagePathTemplate: this.settings.imagePathTemplate,
			downloadImages: this.settings.downloadImages,
			scanFolderPath: this.settings.scanFolderPath,
			customTemplates: templates,
		};

		this.syncManager = new SyncManagerV3(this.app, config);
	}

	/**
	 * 获取各类型模板
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
	 * 解析单个模板配置
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
						console.error(`[Bangumi Sync V3] 读取模板文件失败: ${config.filePath}`, error);
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
	 * 打开控制面板（V3 核心功能）
	 */
	openControlPanel() {
		if (!this.settings.accessToken) {
			new Notice('请先在设置中配置 Access Token');
			return;
		}

		if (this.controlPanel) {
			this.controlPanel.close();
		}

		this.controlPanel = new ControlPanel(
			this.app,
			this.settings,
			this.syncManager!,
			async (filters: PanelFilters) => {
				// 保存筛选条件
				this.settings.panelFilters = filters;
				await this.saveSettings();
			}
		);
		this.controlPanel.open();
	}

	/**
	 * 打开同步选项弹窗
	 */
	openSyncOptions() {
		if (!this.settings.accessToken) {
			new Notice('请先在设置中配置 Access Token');
			return;
		}

		const modal = new SyncOptionsModalV3(
			this.app,
			{
				subjectTypes: this.settings.defaultSubjectTypes,
				collectionTypes: this.settings.defaultCollectionTypes,
				limit: this.settings.syncLimit,
				force: false,
			},
			(options: SyncOptionsV3Input) => {
				this.syncCollectionsWithOptions(options, true);
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
		}, false);
	}

	/**
	 * 使用指定选项执行同步
	 */
	async syncCollectionsWithOptions(options: SyncOptionsV3Input, showPreview: boolean = true) {
		if (!this.settings.accessToken) {
			new Notice('请先在设置中配置 Access Token');
			return;
		}

		if (options.subjectTypes.length === 0) {
			new Notice('请至少选择一种条目类型');
			return;
		}

		if (options.collectionTypes.length === 0) {
			new Notice('请至少选择一种收藏状态');
			return;
		}

		if (!this.syncManager) {
			new Notice('同步管理器未初始化');
			return;
		}

		this.syncModal = new SyncModalV3(this.app);
		this.syncModal.open();

		this.syncManager.setProgressCallback((progress: SyncProgressV3) => {
			if (this.syncModal) {
				this.syncModal.updateProgress(progress);
			}
		});

		if (showPreview) {
			const prepareResult = await this.syncManager.prepareSync({
				subjectTypes: options.subjectTypes,
				collectionTypes: options.collectionTypes,
				limit: options.limit,
				force: options.force,
			});

			if (!prepareResult.success) {
				new Notice(`同步失败: ${prepareResult.error}`);
				this.syncModal.close();
				this.syncModal = null;
				return;
			}

			if (!prepareResult.previewItems || prepareResult.previewItems.length === 0) {
				new Notice('没有需要同步的条目');
				this.syncModal.close();
				this.syncModal = null;
				return;
			}

			this.syncModal.close();
			this.syncModal = null;

			const previewModal = new SyncPreviewModalV3(
				this.app,
				prepareResult.previewItems,
				async (result: SyncPreviewResult) => {
					if (result.action === 'cancel') {
						new Notice('已取消同步');
						return;
					}

					this.syncModal = new SyncModalV3(this.app);
					this.syncModal.open();

					this.syncManager!.setProgressCallback((progress: SyncProgressV3) => {
						if (this.syncModal) {
							this.syncModal.updateProgress(progress);
						}
					});

					const syncResult = await this.syncManager!.executeSync(result.items, result.action);

					this.settings.lastSyncTime = new Date().toISOString();
					this.settings.lastSyncCount = syncResult.added + syncResult.skipped;
					await this.saveSettings();

					new Notice(
						`V3 同步完成！新增: ${syncResult.added}, 跳过: ${prepareResult.skipped}, 错误: ${syncResult.errors}`
					);

					setTimeout(() => {
						if (this.syncModal) {
							this.syncModal.close();
							this.syncModal = null;
						}
					}, 1000);
				}
			);
			previewModal.open();

		} else {
			const result = await this.syncManager.sync({
				subjectTypes: options.subjectTypes,
				collectionTypes: options.collectionTypes,
				limit: options.limit,
				force: options.force,
			});

			this.settings.lastSyncTime = new Date().toISOString();
			this.settings.lastSyncCount = result.added + result.skipped;
			await this.saveSettings();

			new Notice(
				`V3 同步完成！新增: ${result.added}, 跳过: ${result.skipped}, 错误: ${result.errors}`
			);

			setTimeout(() => {
				if (this.syncModal) {
					this.syncModal.close();
					this.syncModal = null;
				}
			}, 1000);
		}
	}

	/**
	 * 设置自动同步
	 */
	setupAutoSync() {
		if (this.autoSyncIntervalId !== null) {
			window.clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = null;
		}

		if (this.settings.autoSync && this.settings.autoSyncInterval > 0) {
			const intervalMs = this.settings.autoSyncInterval * 60 * 1000;
			this.autoSyncIntervalId = window.setInterval(() => {
				this.syncCollections();
			}, intervalMs);
		}
	}
}

export default BangumiPluginV3;
