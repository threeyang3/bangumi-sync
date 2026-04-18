/**
 * Bangumi Sync V2 插件入口
 *
 * V2 改进：
 * 1. 使用用户自己的标签（而非公共标签）
 * 2. 通过扫描本地文件夹检测已同步条目
 * 3. 智能数量限制：如果未同步数量不够，同步所有未同步的
 * 4. 手动同步支持预览确认和评分明细输入
 */

import { Plugin, Notice, TFile } from 'obsidian';
import { BangumiPluginSettingsV2, DEFAULT_SETTINGS_V2, TemplateConfig } from './src/settings/settings';
import { BangumiSettingTabV2 } from './src/settings/settingsTab';
import { SyncManagerV2, SyncManagerConfigV2 } from './src/sync/syncManager';
import { SyncModalV2 } from './src/ui/syncModal';
import { SyncOptionsModalV2, SyncOptionsV2Input } from './src/ui/syncOptionsModal';
import { SyncPreviewModalV2, SyncPreviewItem, SyncPreviewResult } from './src/ui/syncPreviewModal';
import { SyncProgressV2 } from './src/sync/syncStatus';
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

export class BangumiPluginV2 extends Plugin {
	settings: BangumiPluginSettingsV2;
	syncManager: SyncManagerV2 | null = null;
	private autoSyncIntervalId: number | null = null;
	private syncModal: SyncModalV2 | null = null;

	async onload() {
		await this.loadSettings();

		// 初始化同步管理器
		await this.initSyncManager();

		// 添加命令：打开同步选项弹窗
		this.addCommand({
			id: 'sync-collections-v2',
			name: '同步 Bangumi 收藏 (V2)',
			callback: () => this.openSyncOptions(),
		});

		// 添加命令：快速同步（使用默认设置）
		this.addCommand({
			id: 'quick-sync-collections-v2',
			name: '快速同步 V2（使用默认设置）',
			callback: () => this.syncCollections(),
		});

		// 添加 Ribbon 图标
		this.addRibbonIcon('refresh-cw', '同步 Bangumi (V2)', () => {
			this.openSyncOptions();
		});

		// 添加设置面板
		this.addSettingTab(new BangumiSettingTabV2(
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

		console.log('[Bangumi Sync V2] 插件加载完成');
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

		console.log('[Bangumi Sync V2] 插件卸载');
	}

	/**
	 * 加载设置
	 */
	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS_V2, loadedData);
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
		// 获取各类型模板
		const templates = await this.getTemplates();

		const config: SyncManagerConfigV2 = {
			accessToken: this.settings.accessToken,
			pathTemplate: this.settings.syncPathTemplate,
			imagePathTemplate: this.settings.imagePathTemplate,
			downloadImages: this.settings.downloadImages,
			scanFolderPath: this.settings.scanFolderPath,
			customTemplates: templates,
		};

		this.syncManager = new SyncManagerV2(this.app, config);
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
						console.error(`[Bangumi Sync V2] 读取模板文件失败: ${config.filePath}`, error);
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
	 * 打开同步选项弹窗（手动同步）
	 */
	openSyncOptions() {
		if (!this.settings.accessToken) {
			new Notice('请先在设置中配置 Access Token');
			return;
		}

		const modal = new SyncOptionsModalV2(
			this.app,
			{
				subjectTypes: this.settings.defaultSubjectTypes,
				collectionTypes: this.settings.defaultCollectionTypes,
				limit: this.settings.syncLimit,
				force: false,
			},
			(options: SyncOptionsV2Input) => {
				this.syncCollectionsWithOptions(options, true); // 手动同步，显示预览
			}
		);
		modal.open();
	}

	/**
	 * 使用默认设置执行同步（自动同步）
	 */
	async syncCollections() {
		await this.syncCollectionsWithOptions({
			subjectTypes: this.settings.defaultSubjectTypes,
			collectionTypes: this.settings.defaultCollectionTypes,
			limit: this.settings.syncLimit,
			force: false,
		}, false); // 自动同步，不显示预览
	}

	/**
	 * 使用指定选项执行同步
	 * @param options 同步选项
	 * @param showPreview 是否显示预览弹窗（手动同步为 true，自动同步为 false）
	 */
	async syncCollectionsWithOptions(options: SyncOptionsV2Input, showPreview: boolean = true) {
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

		if (!this.syncManager) {
			new Notice('同步管理器未初始化');
			return;
		}

		// 打开同步进度弹窗
		this.syncModal = new SyncModalV2(this.app);
		this.syncModal.open();

		// 设置进度回调
		this.syncManager.setProgressCallback((progress: SyncProgressV2) => {
			if (this.syncModal) {
				this.syncModal.updateProgress(progress);
			}
		});

		if (showPreview) {
			// 手动同步：准备数据后显示预览弹窗
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

			// 关闭进度弹窗
			this.syncModal.close();
			this.syncModal = null;

			// 显示预览弹窗
			const previewModal = new SyncPreviewModalV2(
				this.app,
				prepareResult.previewItems,
				async (result: SyncPreviewResult) => {
					if (result.action === 'cancel') {
						new Notice('已取消同步');
						return;
					}

					// 重新打开进度弹窗
					this.syncModal = new SyncModalV2(this.app);
					this.syncModal.open();

					this.syncManager!.setProgressCallback((progress: SyncProgressV2) => {
						if (this.syncModal) {
							this.syncModal.updateProgress(progress);
						}
					});

					// 执行同步
					const syncResult = await this.syncManager!.executeSync(result.items, result.action);

					// 更新设置中的同步状态
					this.settings.lastSyncTime = new Date().toISOString();
					this.settings.lastSyncCount = syncResult.added + syncResult.skipped;
					await this.saveSettings();

					// 显示结果
					new Notice(
						`V2 同步完成！新增: ${syncResult.added}, 跳过: ${prepareResult.skipped}, 错误: ${syncResult.errors}`
					);

					// 关闭弹窗
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
			// 自动同步：直接执行，不显示预览
			const result = await this.syncManager.sync({
				subjectTypes: options.subjectTypes,
				collectionTypes: options.collectionTypes,
				limit: options.limit,
				force: options.force,
			});

			// 更新设置中的同步状态
			this.settings.lastSyncTime = new Date().toISOString();
			this.settings.lastSyncCount = result.added + result.skipped;
			await this.saveSettings();

			// 显示结果
			new Notice(
				`V2 同步完成！新增: ${result.added}, 跳过: ${result.skipped}, 错误: ${result.errors}`
			);

			// 关闭弹窗
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

export default BangumiPluginV2;
