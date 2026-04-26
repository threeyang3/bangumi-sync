/**
 * Bangumi Sync 插件入口
 *
 * 功能特性：
 * 1. 集数追踪：显示动画集数、小说卷数、漫画话数
 * 2. 观看状态：已看集数高亮显示
 * 3. 悬浮提示：鼠标悬浮显示集数标题、放送日期、时长
 * 4. 控制面板：收藏管理、批量编辑、撤销支持
 */

import { Plugin, Notice, TFile } from 'obsidian';
import { BangumiPluginSettings, DEFAULT_SETTINGS, PanelFilters } from './src/settings/settings';
import { BangumiSettingTab } from './src/settings/settingsTab';
import { SyncManager, SyncManagerConfig } from './src/sync/syncManager';
import { SyncModal } from './src/ui/syncModal';
import { SyncOptionsModal, SyncOptionsInput } from './src/ui/syncOptionsModal';
import { SyncPreviewModal, SyncPreviewResult } from './src/ui/syncPreviewModal';
import { ControlPanel } from './src/panel/controlPanel';
import { SyncProgress } from './src/sync/syncStatus';
import { UserCollection } from './common/api/types';
import { tn, tnFormat } from './src/i18n';
import {
	ANIME_TEMPLATE_STANDARD,
	NOVEL_TEMPLATE_STANDARD,
	COMIC_TEMPLATE_STANDARD,
	GAME_TEMPLATE_STANDARD,
	ALBUM_TEMPLATE_STANDARD,
	MUSIC_TEMPLATE_STANDARD,
	REAL_TEMPLATE_STANDARD,
	ANIME_TEMPLATE_AUTHOR,
	NOVEL_TEMPLATE_AUTHOR,
	COMIC_TEMPLATE_AUTHOR,
	GAME_TEMPLATE_AUTHOR,
	ALBUM_TEMPLATE_AUTHOR,
} from './common/template/defaultTemplates';
import { UserDataExportModal, UserDataImportModal, ImportResultModal } from './src/userData';

/**
 * 缓存数据结构
 */
interface CachedData {
	collections: UserCollection[];
	localSubjects: Map<number, { id: number; path: string; name_cn: string }>;
	timestamp: number;
}

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

const TEMPLATE_CONFIG_MAP_STANDARD: Record<TemplateKey, string> = {
	animeTemplateConfig: ANIME_TEMPLATE_STANDARD,
	novelTemplateConfig: NOVEL_TEMPLATE_STANDARD,
	comicTemplateConfig: COMIC_TEMPLATE_STANDARD,
	gameTemplateConfig: GAME_TEMPLATE_STANDARD,
	albumTemplateConfig: ALBUM_TEMPLATE_STANDARD,
	musicTemplateConfig: MUSIC_TEMPLATE_STANDARD,
	realTemplateConfig: REAL_TEMPLATE_STANDARD,
};

const TEMPLATE_CONFIG_MAP_AUTHOR: Record<TemplateKey, string> = {
	animeTemplateConfig: ANIME_TEMPLATE_AUTHOR,
	novelTemplateConfig: NOVEL_TEMPLATE_AUTHOR,
	comicTemplateConfig: COMIC_TEMPLATE_AUTHOR,
	gameTemplateConfig: GAME_TEMPLATE_AUTHOR,
	albumTemplateConfig: ALBUM_TEMPLATE_AUTHOR,
	musicTemplateConfig: MUSIC_TEMPLATE_STANDARD,
	realTemplateConfig: REAL_TEMPLATE_STANDARD,
};

export class BangumiPlugin extends Plugin {
	settings: BangumiPluginSettings;
	syncManager: SyncManager | null = null;
	private autoSyncIntervalId: number | null = null;
	private syncModal: SyncModal | null = null;
	private controlPanel: ControlPanel | null = null;

	// 数据缓存
	private cachedData: CachedData | null = null;
	private readonly CACHE_TTL = 10 * 60 * 1000; // 10 分钟缓存

	async onload() {
		await this.loadSettings();

		// 初始化同步管理器
		await this.initSyncManager();

		// 添加命令：打开控制面板
		this.addCommand({
			id: 'open-control-panel',
			name: tn('commands', 'openControlPanel'),
			callback: () => this.openControlPanel(),
		});

		// 添加命令：同步收藏
		this.addCommand({
			id: 'sync-collections',
			name: tn('commands', 'syncCollections'),
			callback: () => this.openSyncOptions(),
		});

		// 添加命令：快速同步
		this.addCommand({
			id: 'quick-sync-collections',
			name: tn('commands', 'quickSync'),
			callback: () => this.syncCollections(),
		});

		// 添加命令：导出用户数据
		this.addCommand({
			id: 'export-user-data',
			name: tn('commands', 'exportUserData'),
			callback: () => this.openExportModal(),
		});

		// 添加命令：导入用户数据
		this.addCommand({
			id: 'import-user-data',
			name: tn('commands', 'importUserData'),
			callback: () => this.openImportModal(),
		});

		// 添加 Ribbon 图标
		this.addRibbonIcon('database', tn('ribbon', 'collectionManager'), () => {
			this.openControlPanel();
		});

		// 添加设置面板
		this.addSettingTab(new BangumiSettingTab(
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

		console.debug('[Bangumi Sync] 插件加载完成');
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

		console.debug('[Bangumi Sync] 插件卸载');
	}

	/**
	 * 加载设置
	 */
	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
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

		const config: SyncManagerConfig = {
			accessToken: this.settings.accessToken,
			pathTemplate: this.settings.syncPathTemplate,
			imagePathTemplate: this.settings.imagePathTemplate,
			notePathTemplate: this.settings.notePathTemplate,
			downloadImages: this.settings.downloadImages,
			scanFolderPath: this.settings.scanFolderPath,
			coverLinkType: this.settings.coverLinkType,
			customTemplates: templates,
			defaultPropertyValues: this.settings.defaultPropertyValues,
		};

		this.syncManager = new SyncManager(this.app, config);
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
		const config = this.settings[configKey];

		switch (config.source) {
			case 'standard':
				return TEMPLATE_CONFIG_MAP_STANDARD[configKey];

			case 'author':
				return TEMPLATE_CONFIG_MAP_AUTHOR[configKey];

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
				return TEMPLATE_CONFIG_MAP_AUTHOR[configKey];

			case 'custom':
				return config.customContent || TEMPLATE_CONFIG_MAP_AUTHOR[configKey];

			default:
				return TEMPLATE_CONFIG_MAP_AUTHOR[configKey];
		}
	}

	/**
	 * 打开导出用户数据弹窗
	 */
	openExportModal() {
		const modal = new UserDataExportModal(
			this.app,
			this.settings.scanFolderPath,
			(files: string[]) => {
				new Notice(tnFormat('userData', 'exportSuccess', { count: files.length }));
			}
		);
		modal.open();
	}

	/**
	 * 打开导入用户数据弹窗
	 */
	openImportModal() {
		// 创建文件选择器
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		input.multiple = true;

		input.onchange = () => void (async () => {
			const files = input.files;
			if (!files || files.length === 0) return;

			const importFiles: Array<{ name: string; content: string }> = [];
			for (const file of Array.from(files)) {
				try {
					importFiles.push({
						name: file.name,
						content: await file.text(),
					});
				} catch (error) {
					new Notice(tnFormat('userData', 'importFailed', { error: String(error) }));
					return;
				}
			}

			const modal = new UserDataImportModal(
				this.app,
				importFiles,
				(result) => {
					const resultModal = new ImportResultModal(this.app, result);
					resultModal.open();
				}
			);
			modal.open();
		})();

		input.click();
	}

	/**
	 * 打开控制面板
	 */
	openControlPanel() {
		if (!this.settings.accessToken) {
			new Notice(tn('notices', 'configureTokenFirst'));
			return;
		}

		if (this.controlPanel) {
			this.controlPanel.close();
		}

		// 获取缓存数据
		const cachedData = this.getCachedData();
		const cachedPanelData = cachedData ? {
			collections: cachedData.collections,
			localSubjects: cachedData.localSubjects,
		} : null;

		this.controlPanel = new ControlPanel(
			this.app,
			this.settings,
			this.syncManager!,
			(filters: PanelFilters) => {
				// 保存筛选条件
				this.settings.panelFilters = filters;
				void this.saveSettings();
			},
			cachedPanelData,
			(data) => {
				// 更新缓存
				this.setCachedData({
					collections: data.collections,
					localSubjects: data.localSubjects,
					timestamp: Date.now(),
				});
			}
		);
		this.controlPanel.open();
	}

	/**
	 * 打开同步选项弹窗
	 */
	openSyncOptions() {
		if (!this.settings.accessToken) {
			new Notice(tn('notices', 'configureTokenFirst'));
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
			(options: SyncOptionsInput) => {
				void this.syncCollectionsWithOptions(options, true);
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
	async syncCollectionsWithOptions(options: SyncOptionsInput, showPreview: boolean = true) {
		if (!this.settings.accessToken) {
			new Notice(tn('notices', 'configureTokenFirst'));
			return;
		}

		if (options.subjectTypes.length === 0) {
			new Notice(tn('notices', 'selectSubjectType'));
			return;
		}

		if (options.collectionTypes.length === 0) {
			new Notice(tn('notices', 'selectCollectionType'));
			return;
		}

		if (!this.syncManager) {
			new Notice(tn('notices', 'syncManagerNotInit'));
			return;
		}

		this.syncModal = new SyncModal(this.app);
		this.syncModal.open();

		this.syncManager.setProgressCallback((progress: SyncProgress) => {
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

			const previewModal = new SyncPreviewModal(
				this.app,
				prepareResult.previewItems,
				(result: SyncPreviewResult) => {
					void (async () => {
						if (result.action === 'cancel') {
							new Notice('已取消同步');
							return;
						}

						this.syncModal = new SyncModal(this.app);
						this.syncModal.open();

						this.syncManager!.setProgressCallback((progress: SyncProgress) => {
							if (this.syncModal) {
								this.syncModal.updateProgress(progress);
							}
						});

						const syncResult = await this.syncManager!.executeSync(result.items, result.action);

						this.settings.lastSyncTime = new Date().toISOString();
						this.settings.lastSyncCount = syncResult.added + syncResult.skipped;
						await this.saveSettings();

						new Notice(
							`同步完成！新增: ${syncResult.added}, 跳过: ${prepareResult.skipped}, 错误: ${syncResult.errors}`
						);

						activeWindow.setTimeout(() => {
							if (this.syncModal) {
								this.syncModal.close();
								this.syncModal = null;
							}
						}, 1000);
					})();
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
				`同步完成！新增: ${result.added}, 跳过: ${result.skipped}, 错误: ${result.errors}`
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
			activeWindow.clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = null;
		}

		if (this.settings.autoSync && this.settings.autoSyncInterval > 0) {
			const intervalMs = this.settings.autoSyncInterval * 60 * 1000;
			this.autoSyncIntervalId = activeWindow.setInterval(() => {
				void this.syncCollections();
			}, intervalMs);
		}
	}

	/**
	 * 获取缓存数据
	 * @returns 缓存数据，如果过期或不存在则返回 null
	 */
	getCachedData(): CachedData | null {
		if (!this.cachedData) {
			return null;
		}

		const now = Date.now();
		if (now - this.cachedData.timestamp > this.CACHE_TTL) {
			this.cachedData = null;
			return null;
		}

		return this.cachedData;
	}

	/**
	 * 设置缓存数据
	 */
	setCachedData(data: CachedData): void {
		this.cachedData = {
			...data,
			timestamp: Date.now(),
		};
	}

	/**
	 * 清除缓存
	 */
	clearCache(): void {
		this.cachedData = null;
	}

	/**
	 * 更新缓存中的单个条目（同步后调用）
	 */
	updateCachedItem(subjectId: number, localInfo: { id: number; path: string; name_cn: string }): void {
		if (this.cachedData) {
			this.cachedData.localSubjects.set(subjectId, localInfo);
		}
	}
}

export default BangumiPlugin;

// 兼容旧版本的类型别名
export const BangumiPluginV3 = BangumiPlugin;
