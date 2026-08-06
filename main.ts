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
import { persistStableManagerSettings, SettingsPersistenceCoordinator } from './src/settings/settingsLifecycle';
import { applySettingsPatch, SettingsPatch } from './src/settings/settingsPatch';
import { ConfigurationChangeBlockedError, PendingDecisionInProgressError, PendingSyncTransactionError, RecoveryRequiredError, SyncConfigField, SyncManager, SyncManagerConfig } from './src/sync/syncManager';
import { SyncModal } from './src/ui/syncModal';
import { SyncOptionsModal, SyncOptionsInput } from './src/ui/syncOptionsModal';
import { SyncPreviewModal, SyncPreviewResult } from './src/ui/syncPreviewModal';
import { SearchModal } from './src/ui/searchModal';
import { loadSubjectsForCollections, LocalPropertyModal, LocalPropertyModalResult } from './src/ui/localPropertyModal';
import { ControlPanel } from './src/panel/controlPanel';
import { SyncProgress, createCancellationSignal } from './src/sync/syncStatus';
import { UserCollection } from './common/api/types';
import { tn, tnFormat } from './src/i18n';
import {
	getBuiltInTemplateByKey,
} from './common/template/defaultTemplates';
import {
	getTemplateFallbackLookupKey,
	TEMPLATE_CATEGORY_OPTIONS,
	TEMPLATE_CATEGORY_OPTIONS_BY_KEY,
	TemplateKey,
} from './common/template/templateRegistry';
import { UserDataExportModal, UserDataImportModal, ImportResultModal } from './src/userData';
import { EpisodeContextMenu } from './src/episode/episodeContextMenu';
import { EpisodeStatusManager } from './src/episode/episodeStatusManager';
import { EpisodeCommentManager } from './src/episode/episodeCommentManager';
import { SubjectNoteManager } from './src/note/subjectNoteManager';
import { StatusSyncFieldSelection } from './src/sync/statusSyncTypes';
import { PathDiagnosticModal, PathMigrationPreviewModal } from './src/ui/pathToolsModal';
import { RecoveryCenterModal } from './src/ui/recoveryCenterModal';
import { assertWriteOperationAllowed, setWriteOperationGuard, WriteOperation } from './src/sync/writeOperationGate';
import { cloneSyncManagerConfig, syncConfigFieldEqual } from './src/sync/syncConfig';
import { selectPreviousAccessToken } from './src/sync/recoveryJournal';

/**
 * 缓存数据结构
 */
interface CachedData {
	collections: UserCollection[];
	localSubjects: Map<number, { id: number; path: string; name_cn: string }>;
	timestamp: number;
}

/**
 * 模板集合类型 — 按 category 键索引
 */
type TemplatesMap = Record<string, string>;

export default class BangumiPlugin extends Plugin {
	settings!: BangumiPluginSettings;
	syncManager: SyncManager | null = null;
	private autoSyncIntervalId: number | null = null;
	private syncModal: SyncModal | null = null;
	private syncStatusBarEl: HTMLElement | null = null;
	private cancellationSignal: ReturnType<typeof createCancellationSignal> | null = null;
	private controlPanel: ControlPanel | null = null;
	private appliedSyncConfig: SyncManagerConfig | null = null;
	private lastSavedSettings: BangumiPluginSettings | null = null;
	private runtimePreviousRecoveryToken: string | undefined;
	private readonly settingsPersistence = new SettingsPersistenceCoordinator();

	// 单集功能
	episodeStatusManager: EpisodeStatusManager | null = null;
	episodeCommentManager: EpisodeCommentManager | null = null;
	episodeContextMenu: EpisodeContextMenu | null = null;
	subjectNoteManager: SubjectNoteManager | null = null;

	// 数据缓存
	private cachedData: CachedData | null = null;
	private readonly CACHE_TTL = 10 * 60 * 1000; // 10 分钟缓存

	async onload() {
		await this.loadSettings();

		// 初始化同步管理器
		await this.initOrUpdateSyncManager();

		// 状态栏指示器（默认隐藏）
		this.syncStatusBarEl = this.addStatusBarItem();
		this.syncStatusBarEl.addClass('bangumi-sync-status-bar', 'bangumi-hidden');

		// 初始化单集功能。这里不能让可选功能阻断整个插件加载，否则样式也不会生效。
		this.initEpisodeFeatures();

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

		// 添加命令：搜索条目
		this.addCommand({
			id: 'search-subjects',
			name: tn('commands', 'searchSubjects'),
			callback: () => this.openSearchModal(),
		});

		// 添加命令：检查并同步状态
                this.addCommand({
                        id: 'check-and-sync-status',
                        name: tn('commands', 'checkAndSyncStatus'),
                        callback: () => this.openControlPanel({ autoSyncSelection: 'prompt' }),
                });

                this.addCommand({
                        id: 'create-subject-note',
                        name: tn('commands', 'createSubjectNote'),
			callback: () => {
				if (!this.ensureWriteCanStart('subject-note')) return;
				void this.subjectNoteManager?.createOrAppendForCurrentFile();
			},
		});

		this.addCommand({
			id: 'batch-download-covers',
			name: tn('commands', 'batchDownloadCovers'),
			callback: () => void this.batchDownloadCovers(),
		});

		this.addCommand({
			id: 'scan-and-link-related',
			name: tn('commands', 'scanAndLinkRelated'),
			callback: () => void this.scanAndLinkRelated(),
		});

		this.addCommand({
			id: 'open-recovery-center',
			name: tn('commands', 'openRecoveryCenter'),
			callback: () => this.openRecoveryCenter(),
		});

		this.addCommand({
			id: 'diagnose-local-subjects',
			name: tn('commands', 'diagnoseLocalSubjects'),
			callback: () => void this.openPathDiagnostic(),
		});

		this.addCommand({
			id: 'preview-path-migration',
			name: tn('commands', 'previewPathMigration'),
			callback: () => void this.openPathMigrationPreview(),
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
			patch => this.applySettingsChanges(patch),
			() => this.openPathDiagnostic(),
			() => this.openPathMigrationPreview(),
		));

		// 设置自动同步
		if (this.settings.autoSync) {
			this.setupAutoSync();
		}

	}

	private async openPathDiagnostic(): Promise<void> {
		try {
			if (!this.syncManager) {
				new Notice(tn('notices', 'syncManagerNotInit'));
				return;
			}
			const report = await this.syncManager.diagnoseLocalSubjects();
			new PathDiagnosticModal(
				this.app,
				report,
				() => this.syncManager?.exportDiagnosticReport(report) ?? Promise.reject(new Error(tn('notices', 'syncManagerNotInit'))),
			).open();
		} catch (error) {
			new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private openRecoveryCenter(): void {
		const manager = this.syncManager;
		if (!manager) {
			new Notice(tn('notices', 'syncManagerNotInit'));
			return;
		}
		new RecoveryCenterModal(this.app, {
			getRecovery: () => manager.getRecoveryRequired(),
			retryRollback: () => manager.retryRollbackRecovery(),
			retryCleanup: () => manager.retryJournalCleanup(),
			retryMigration: () => manager.retryLegacyJournalMigration(),
			confirmManual: acceptRisk => manager.confirmManualRecovery({ acceptUnverifiableJournalRisk: acceptRisk }),
			rescan: () => manager.rescanRecovery(),
			subscribe: listener => manager.subscribeRecoveryState(listener),
		}).open();
	}

	private async openPathMigrationPreview(): Promise<void> {
		try {
			if (!this.syncManager) {
				new Notice(tn('notices', 'syncManagerNotInit'));
				return;
			}
			const preview = await this.syncManager.previewPathMigration();
			new PathMigrationPreviewModal(
				this.app,
				preview,
				actualPreview => this.syncManager?.applyPathMigration(actualPreview) ?? Promise.reject(new Error(tn('notices', 'syncManagerNotInit'))),
				options => this.syncManager?.previewPathMigration(options) ?? Promise.reject(new Error(tn('notices', 'syncManagerNotInit'))),
			).open();
		} catch (error) {
			new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	onunload() {
		setWriteOperationGuard(null);
		// 清除自动同步定时器
		if (this.autoSyncIntervalId !== null) {
			activeWindow.clearInterval(this.autoSyncIntervalId);
			this.autoSyncIntervalId = null;
		}

		// 关闭同步弹窗
		if (this.syncModal) {
			this.syncModal.close();
			this.syncModal = null;
		}
		this.cancellationSignal = null;

		// 关闭控制面板
		if (this.controlPanel) {
			this.controlPanel.close();
			this.controlPanel = null;
		}

		console.debug('[Bangumi Sync] 插件卸载');
	}

	/**
	 * 更新状态栏同步进度
	 */
	private updateStatusBar(progress: SyncProgress): void {
		if (!this.syncStatusBarEl) return;
		this.syncStatusBarEl.removeClass('bangumi-hidden');
		if (progress.total > 0) {
			const percent = Math.floor((progress.current / progress.total) * 100);
			const prefix = this.cancellationSignal?.paused
				? tn('syncModal', 'paused')
				: tn('syncModal', 'syncing');
			this.syncStatusBarEl.setText(`Bangumi: ${prefix} ${progress.current}/${progress.total} (${percent}%)`);
		} else {
			this.syncStatusBarEl.setText(`Bangumi: ${tn('syncModal', 'preparing')}`);
		}
	}

	/**
	 * 隐藏状态栏（延迟）
	 */
	private hideStatusBar(delay = 5000): void {
		if (!this.syncStatusBarEl) return;
		activeWindow.setTimeout(() => {
			if (this.syncStatusBarEl) {
				this.syncStatusBarEl.addClass('bangumi-hidden');
			}
		}, delay);
	}

	/**
	 * 加载设置
	 */
	async loadSettings() {
		const loadedData = await this.loadData() as Partial<BangumiPluginSettings> & { defaultPropertyValues?: unknown } | null;
		if (loadedData && 'defaultPropertyValues' in loadedData) {
			delete loadedData.defaultPropertyValues;
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData ?? {});

		// 迁移：如果路径模板使用 {{name_cn}} 而不是 {{name_cn_with_type}}，自动更新
		if (this.settings.syncPathTemplate &&
			this.settings.syncPathTemplate.includes('{{name_cn}}') &&
			!this.settings.syncPathTemplate.includes('{{name_cn_with_type}}')) {
			this.settings.syncPathTemplate = this.settings.syncPathTemplate.replace(
				/{{name_cn}}/g,
				'{{name_cn_with_type}}'
			);
			console.debug('[Bangumi Sync] 已自动更新路径模板，使用带类型后缀的文件名');
			await this.saveSettings();
		}

		if (this.settings.notePathTemplate && !this.settings.notePathTemplate.endsWith('.md')) {
			const normalized = this.settings.notePathTemplate.replace(/\/+$/, '');
			this.settings.notePathTemplate = `${normalized}/{{name_cn}}.md`;
			console.debug('[Bangumi Sync] 已迁移共享笔记路径模板为完整文件路径');
			await this.saveSettings();
		}

		if (this.settings.noteTemplateContent.includes('\nid:\n{{id_yaml}}')) {
			this.settings.noteTemplateContent = this.settings.noteTemplateContent.replace(
				/\nid:\n\{\{id_yaml\}\}/,
				'\n笔记ID:\n{{id_yaml}}'
			);
			console.debug('[Bangumi Sync] 已迁移共享笔记模板字段为 笔记ID');
			await this.saveSettings();
		}

		if (this.settings.noteTemplateContent.includes('\n笔记ID: {{id_yaml}}')) {
			this.settings.noteTemplateContent = this.settings.noteTemplateContent.replace(
				/\n笔记ID: \{\{id_yaml\}\}/,
				'\n笔记ID:\n{{id_yaml}}'
			);
			console.debug('[Bangumi Sync] 已迁移共享笔记模板字段为 笔记ID');
			await this.saveSettings();
		}
	}

	/**
	 * 保存设置
	 */
	async saveSettings() {
		const snapshot = this.cloneSettings(this.settings);
		await this.settingsPersistence.enqueue(() => this.saveData(snapshot));
		this.lastSavedSettings = snapshot;
	}

	/**
	 * 初始化同步管理器
	 */
	private async buildSyncManagerConfig(settings: BangumiPluginSettings = this.settings): Promise<SyncManagerConfig> {
		const templates = await this.getTemplates(settings);
		return cloneSyncManagerConfig({
			accessToken: settings.accessToken,
			pathTemplate: settings.syncPathTemplate,
			pathTemplateByType: settings.pathTemplateByType,
			imagePathTemplate: settings.imagePathTemplate,
			notePathTemplate: settings.notePathTemplate,
			downloadImages: settings.downloadImages,
			imageQuality: settings.imageQuality,
			imageUpdateExisting: settings.imageUpdateExisting,
			scanFolderPath: settings.scanFolderPath,
			coverLinkType: settings.coverLinkType,
			customTemplates: templates,
			enableRelatedLinks: settings.enableRelatedLinks,
			dataProtection: settings.dataProtection,
			subjectPathStates: settings.subjectPathStates,
			pathNamingStrategy: settings.pathNamingStrategy,
			recoverConfiguration: async facts => this.reconcileConfigurationRecovery(facts),
			onPathStatesChanged: async states => {
				this.settings.subjectPathStates = states;
				await this.saveSettings();
			},
		});
	}

	private cloneSettings(settings: BangumiPluginSettings): BangumiPluginSettings {
		return JSON.parse(JSON.stringify(settings)) as BangumiPluginSettings;
	}

	private restoreSettings(snapshot: BangumiPluginSettings): void {
		for (const key of Object.keys(this.settings)) Reflect.deleteProperty(this.settings, key);
		Object.assign(this.settings, this.cloneSettings(snapshot));
	}

	private changedSyncConfigFields(previous: SyncManagerConfig | null, next: SyncManagerConfig): SyncConfigField[] {
		if (!previous) return [];
		const fields: SyncConfigField[] = [
			'accessToken', 'scanFolderPath', 'pathTemplate', 'pathTemplateByType', 'pathNamingStrategy',
			'subjectPathStates', 'imagePathTemplate', 'notePathTemplate', 'coverLinkType', 'dataProtection',
			'downloadImages', 'imageQuality', 'imageUpdateExisting', 'enableRelatedLinks', 'customTemplates',
		];
		return fields.filter(field => !syncConfigFieldEqual(previous, next, field));
	}

	private refreshDependentServices(manager: SyncManager, settings: BangumiPluginSettings = this.settings): void {
		this.subjectNoteManager = new SubjectNoteManager(this.app, manager.client, this.cloneSettings(settings));
	}

	private applySettingsChanges(patch: SettingsPatch): Promise<{ applied: boolean; settings: BangumiPluginSettings }> {
		return this.settingsPersistence.enqueue(() => this.applySettingsChangesNow(patch));
	}

	private async applySettingsChangesNow(patch: SettingsPatch): Promise<{ applied: boolean; settings: BangumiPluginSettings }> {
		const previousSettings = this.cloneSettings(this.settings);
		const candidate = applySettingsPatch(previousSettings, patch);
		const nextConfig = await this.buildSyncManagerConfig(candidate);
		const changedFields = this.changedSyncConfigFields(this.appliedSyncConfig, nextConfig);
		const outcome = await persistStableManagerSettings({
			settings: this.cloneSettings(candidate),
			previousSettings,
			nextConfig,
			changedFields,
			manager: this.syncManager,
			save: settings => this.saveData(this.cloneSettings(settings)),
			restore: snapshot => this.restoreSettings(snapshot),
			applyDependentServices: settings => { if (this.syncManager) this.refreshDependentServices(this.syncManager, settings); },
			restoreDependentServices: settings => { if (this.syncManager) this.refreshDependentServices(this.syncManager, settings); },
			onRollbackFailure: async (error, facts) => {
					this.runtimePreviousRecoveryToken = typeof facts.previousSettings.accessToken === 'string'
						? facts.previousSettings.accessToken : undefined;
				const diskSettings: unknown = await this.loadData();
				await this.syncManager?.requireConfigurationRecovery(error, {
					previousSettings: { ...this.cloneSettings(facts.previousSettings) },
					candidateSettings: { ...this.cloneSettings(facts.candidateSettings) },
					currentSettings: { ...this.cloneSettings(this.settings) },
					diskSettings: diskSettings && typeof diskSettings === 'object' && !Array.isArray(diskSettings)
						? { ...(diskSettings as Record<string, unknown>) } : {},
					managerConfig: { ...cloneSyncManagerConfig(this.appliedSyncConfig ?? facts.nextConfig) },
				});
			},
		});
		if (outcome.applied) {
			this.appliedSyncConfig = cloneSyncManagerConfig(nextConfig);
			this.lastSavedSettings = this.cloneSettings(this.settings);
			return { applied: true, settings: this.cloneSettings(this.settings) };
		}
		if (outcome.error instanceof ConfigurationChangeBlockedError) new Notice(outcome.error.message);
		else new Notice(`Failed to save settings: ${outcome.error instanceof Error ? outcome.error.message : String(outcome.error)}`);
		return { applied: false, settings: this.cloneSettings(this.settings) };
	}

	private async reconcileConfigurationRecovery(facts: import('./src/sync/recoveryJournal').ConfigurationRecoveryFacts): Promise<SyncManagerConfig> {
		const currentDisk: unknown = await this.loadData();
		const diskToken = currentDisk && typeof currentDisk === 'object' && !Array.isArray(currentDisk)
			? (currentDisk as Record<string, unknown>).accessToken : undefined;
		const runtimeToken = this.settings.accessToken;
		const accessToken = await selectPreviousAccessToken({
			accessTokenChanged: facts.accessTokenChanged,
			previousAccessTokenSha256: facts.previousAccessTokenSha256,
			diskToken: typeof diskToken === 'string' ? diskToken : undefined,
			runtimeToken: typeof runtimeToken === 'string' ? runtimeToken : undefined,
			runtimePreviousToken: this.runtimePreviousRecoveryToken,
		});
		if (accessToken === undefined) throw new Error('A safe Access Token source could not be determined; configuration recovery remains blocked.');
		const previous = this.cloneSettings({ ...facts.previousSettings, accessToken } as unknown as BangumiPluginSettings);
		await this.saveData(previous);
		const disk: unknown = await this.loadData();
		if (JSON.stringify(disk) !== JSON.stringify(previous)) throw new Error('Persisted settings do not match the selected previous settings snapshot.');
		this.restoreSettings(previous);
		const config = await this.buildSyncManagerConfig(previous);
		config.onConfigurationRecovered = () => {
			if (this.syncManager) this.refreshDependentServices(this.syncManager, previous);
		};
		this.lastSavedSettings = this.cloneSettings(previous);
		this.appliedSyncConfig = cloneSyncManagerConfig(config);
		this.runtimePreviousRecoveryToken = undefined;
		return config;
	}

	private async initOrUpdateSyncManager(): Promise<void> {
		const config = await this.buildSyncManagerConfig();
		if (this.syncManager) {
			const changedFields = this.changedSyncConfigFields(this.appliedSyncConfig, config);
			this.syncManager.updateConfig(config, changedFields);
			this.appliedSyncConfig = cloneSyncManagerConfig(config);
			this.refreshDependentServices(this.syncManager);
			return;
		}

		this.syncManager = new SyncManager(this.app, config);
		await this.syncManager.initializeRecovery();
		if (this.syncManager.getRecoveryRequired()) new Notice(tn('recoveryCenter', 'writeBlocked'));
		this.appliedSyncConfig = cloneSyncManagerConfig(config);
		this.lastSavedSettings = this.cloneSettings(this.settings);
		const manager = this.syncManager;
		setWriteOperationGuard(() => manager.ensureCanStartSync());
		this.refreshDependentServices(manager);
	}

	/**
	 * 初始化单集功能
	 */
	private initEpisodeFeatures(): void {
		if (!this.syncManager?.client) return;

		try {
			this.episodeStatusManager = new EpisodeStatusManager(this.app, this.syncManager.client);
			this.episodeCommentManager = new EpisodeCommentManager(this.app);
			this.episodeContextMenu = new EpisodeContextMenu(
				this.app,
				this.syncManager.client,
				this.episodeStatusManager,
				this.episodeCommentManager
			);

			// 延后到工作区就绪后再注册，避免启动阶段的文档对象异常影响整个插件加载。
			this.app.workspace.onLayoutReady(() => {
				try {
					this.episodeContextMenu?.registerGlobalListener(this);
				} catch (error) {
					console.error('[Bangumi Sync] 注册单集右键菜单失败:', error);
				}
			});
		} catch (error) {
			this.episodeStatusManager = null;
			this.episodeCommentManager = null;
			this.episodeContextMenu = null;
			console.error('[Bangumi Sync] 初始化单集功能失败，已跳过该功能:', error);
		}
	}

	/**
	 * 获取各类型模板
	 */
	private async getTemplates(settings: BangumiPluginSettings = this.settings): Promise<TemplatesMap> {
		const templates: TemplatesMap = {};
		const templateKeys: TemplateKey[] = [
			'animeTemplateConfig',
			'novelTemplateConfig',
			'comicTemplateConfig',
			'gameTemplateConfig',
			'albumTemplateConfig',
			'musicTemplateConfig',
			'realTemplateConfig',
		];

		for (const templateKey of templateKeys) {
			templates[getTemplateFallbackLookupKey(templateKey)] = await this.resolveTemplate(templateKey, settings);
		}

		for (const categoryOption of TEMPLATE_CATEGORY_OPTIONS) {
			templates[categoryOption.category] = await this.resolveTemplateForCategory(categoryOption.key, settings);
		}

		return templates;
	}

	/**
	 * 解析单个模板配置
	 */
	private async resolveTemplate(configKey: TemplateKey, settings: BangumiPluginSettings = this.settings): Promise<string> {
		return this.resolveTemplateFromConfig(settings[configKey], configKey);
	}

	private async resolveTemplateForCategory(categoryKey: string, settings: BangumiPluginSettings = this.settings): Promise<string> {
		const categoryOption = TEMPLATE_CATEGORY_OPTIONS_BY_KEY[categoryKey];
		if (!categoryOption) {
			return '';
		}

		const categoryConfig = settings.templateConfigByCategory?.[categoryKey];
		if (categoryConfig) {
			return this.resolveTemplateFromConfig(categoryConfig, categoryOption.templateKey);
		}

		return this.resolveTemplate(categoryOption.templateKey, settings);
	}

	private async resolveTemplateFromConfig(
		config: BangumiPluginSettings[TemplateKey],
		defaultTemplateKey: TemplateKey
	): Promise<string> {

		switch (config.source) {
			case 'standard':
				return getBuiltInTemplateByKey(defaultTemplateKey, false);

			case 'author':
				return getBuiltInTemplateByKey(defaultTemplateKey, true);

			case 'file':
				if (config.filePath) {
					try {
						const file = this.app.vault.getAbstractFileByPath(config.filePath);
						if (file instanceof TFile) {
							return await this.app.vault.read(file);
						}
					} catch (error) {
						console.error(`[Bangumi Sync] 读取模板文件失败: ${config.filePath}`, error);
						new Notice(tnFormat('notices', 'templateReadFailed', { path: config.filePath }));
					}
				}
				return getBuiltInTemplateByKey(defaultTemplateKey, true);

			case 'custom':
				return config.customContent || getBuiltInTemplateByKey(defaultTemplateKey, true);

			default:
				return getBuiltInTemplateByKey(defaultTemplateKey, true);
		}
	}

	/**
	 * 打开导出用户数据弹窗
	 */
	openExportModal() {
		if (!this.ensureWriteCanStart('user-data-export')) return;
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
		if (!this.ensureWriteCanStart('user-data-import')) return;
		// 创建文件选择器
		const input = activeDocument.createElement('input');
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
					const resultModal = new ImportResultModal(this.app, result, this.settings.scanFolderPath);
					resultModal.open();
				},
				this.settings.scanFolderPath,
			);
			modal.open();
		})();

		input.click();
	}

	/**
	 * 打开搜索弹窗
	 */
	openSearchModal() {
		if (!this.syncManager) {
			new Notice(tn('notices', 'syncManagerNotInit'));
			return;
		}
		if (!this.ensureSyncCanStart()) return;

		if (!this.settings.accessToken) {
			new Notice(tn('notices', 'configureTokenFirst'));
			return;
		}

		const modal = new SearchModal(
			this.app,
			this.syncManager.client,
			this.settings,
			this.syncManager,
			() => {
				this.clearCache();
			}
		);
		modal.open();
	}

	/**
	 * 打开控制面板
	 */
        openControlPanel(options?: { autoSyncSelection?: StatusSyncFieldSelection | 'prompt' | null }) {
		if (!this.ensureSyncCanStart()) return;
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
				void this.saveSettings().catch(error => {
					console.error('[Bangumi Sync] Failed to persist panel filters:', error);
					new Notice(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`);
				});
			},
			cachedPanelData,
                        (data) => {
                                // 更新缓存
                                this.setCachedData({
                                        collections: data.collections,
                                        localSubjects: data.localSubjects,
                                        timestamp: Date.now(),
                                });
                        },
                        () => this.openSyncOptions(),
                        () => { void this.batchDownloadCovers(); },
                        () => { void this.scanAndLinkRelated(); },
                        this.subjectNoteManager,
                        this.episodeStatusManager,
                        options?.autoSyncSelection ?? null
                );
		this.controlPanel.open();
	}

	/**
	 * 打开同步选项弹窗
	 */
	openSyncOptions() {
		if (!this.ensureSyncCanStart()) return;
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
	 * 批量下载封面图片并替换链接
	 */
	async batchDownloadCovers() {
		if (!this.ensureWriteCanStart('cover-download')) return;
		if (!this.settings.downloadImages) {
			new Notice(tn('notices', 'coverDownloadDisabled'));
			return;
		}

		if (!this.syncManager) {
			new Notice(tn('notices', 'syncManagerNotInit'));
			return;
		}

		this.cancellationSignal = createCancellationSignal();
		this.syncManager.setCancellationSignal(this.cancellationSignal);
		this.syncModal = new SyncModal(this.app, this.cancellationSignal);
		const modalManager = this.syncManager;
		this.syncModal.setRollbackHandler(() => modalManager.rollbackBatch());
		this.syncModal.setCommitHandler(() => modalManager.commitPendingBatch());
		this.syncModal.setRecoveryStateSubscriber(listener => modalManager.subscribeRecoveryState(listener));
		this.syncModal.setRecoveryCenterHandler(() => this.openRecoveryCenter());
		this.syncModal.open();

		this.syncManager.setProgressCallback((progress: SyncProgress) => {
			if (this.syncModal) {
				this.syncModal.updateProgress(progress);
			}
			this.updateStatusBar(progress);
		});

		try {
			const result = await this.syncManager.batchDownloadCovers();

			if (this.syncModal) {
				this.syncModal.close();
				this.syncModal = null;
			}
			this.cancellationSignal = null;
			this.syncManager.setCancellationSignal(null);
			this.hideStatusBar();

			if (result.downloaded === 0 && result.skipped === 0) {
				new Notice(tn('notices', 'coverDownloadNoItems'));
			} else {
				new Notice(tnFormat('notices', 'coverDownloadComplete', {
					downloaded: result.downloaded,
					skipped: result.skipped,
					failed: result.failed,
				}));
			}
		} catch (error) {
			if (this.syncModal) {
				this.syncModal.close();
				this.syncModal = null;
			}
			this.cancellationSignal = null;
			this.syncManager.setCancellationSignal(null);
			this.hideStatusBar(0);
			console.error('[Bangumi Sync] 批量下载封面失败:', error);
			new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * 扫描所有本地已同步条目，为相关条目补充双向链接
	 */
	async scanAndLinkRelated() {
		if (!this.ensureWriteCanStart('related-link-scan')) return;
		if (!this.syncManager) {
			new Notice(tn('notices', 'syncManagerNotInit'));
			return;
		}

		this.cancellationSignal = createCancellationSignal();
		this.syncManager.setCancellationSignal(this.cancellationSignal);
		this.syncModal = new SyncModal(this.app, this.cancellationSignal);
		this.syncModal.open();

		this.syncManager.setProgressCallback((progress: SyncProgress) => {
			if (this.syncModal) {
				this.syncModal.updateProgress(progress);
			}
			this.updateStatusBar(progress);
		});

		try {
			const result = await this.syncManager.scanAndLinkRelated();

			if (this.syncModal) {
				this.syncModal.showScanCompleted(result.checked, result.linked, result.skipped, result.failed, result.details);
				this.syncModal = null;
			}
			this.cancellationSignal = null;
			this.syncManager.setCancellationSignal(null);
			this.hideStatusBar();
		} catch (error) {
			if (this.syncModal) {
				this.syncModal.close();
				this.syncModal = null;
			}
			this.cancellationSignal = null;
			this.syncManager.setCancellationSignal(null);
			this.hideStatusBar(0);
			console.error('[Bangumi Sync] 扫描关联失败:', error);
			new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * 使用指定选项执行同步
	 */
	async syncCollectionsWithOptions(options: SyncOptionsInput, showPreview: boolean = true) {
		if (!this.ensureSyncCanStart()) return;
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

		this.cancellationSignal = createCancellationSignal();
		this.syncManager.setCancellationSignal(this.cancellationSignal);
		this.syncModal = new SyncModal(this.app, this.cancellationSignal);
		const modalManager = this.syncManager;
		this.syncModal.setRollbackHandler(() => modalManager.rollbackBatch());
		this.syncModal.setCommitHandler(() => modalManager.commitPendingBatch());
		this.syncModal.setRecoveryStateSubscriber(listener => modalManager.subscribeRecoveryState(listener));
		this.syncModal.setRecoveryCenterHandler(() => this.openRecoveryCenter());
		this.syncModal.open();

		this.syncManager.setProgressCallback((progress: SyncProgress) => {
			if (this.syncModal) {
				this.syncModal.updateProgress(progress);
			}
			this.updateStatusBar(progress);
		});

		if (showPreview) {
			try {
			const prepareResult = await this.syncManager.prepareSync({
				subjectTypes: options.subjectTypes,
				collectionTypes: options.collectionTypes,
				limit: options.limit,
				force: options.force,
			});

			if (!prepareResult.success) {
				new Notice(`${tn('notices', 'syncFailed')}: ${prepareResult.error}`);
				this.cleanupSyncState(0);
				return;
			}

			if (!prepareResult.previewItems || prepareResult.previewItems.length === 0) {
				new Notice(tn('notices', 'noItemsToSync'));
				this.cleanupSyncState(0);
				return;
			}

			// keep sync modal open with preparing message
			if (this.syncModal) {
				this.syncModal.updateProgress({ current: 0, total: 0, status: 'preparing', message: 'Preparing preview...' });
			}

			console.debug(`[Bangumi Sync] Preview items: ${prepareResult.previewItems.length}, collecting custom properties`);

			const localPropertyResult = await this.collectLocalPropertyValuesForCollections(
				prepareResult.previewItems.map(item => item.collection)
			);
			if (localPropertyResult === null) {
				console.debug('[Bangumi Sync] User cancelled custom properties');
				new Notice(tn('notices', 'syncCancelled'));
				this.cleanupSyncState(0);
				return;
			}

			console.debug('[Bangumi Sync] Custom properties done, opening preview modal');

			this.syncModal.close();
			this.syncModal = null;

			const previewModal = new SyncPreviewModal(
				this.app,
				prepareResult.previewItems,
				(result: SyncPreviewResult) => {
					void (async () => {
						if (result.action === 'cancel') {
							new Notice(tn('notices', 'syncCancelled'));
							return;
						}
						if (!this.ensureSyncCanStart()) return;

						this.cancellationSignal = createCancellationSignal();
						this.syncManager!.setCancellationSignal(this.cancellationSignal);
						this.syncModal = new SyncModal(this.app, this.cancellationSignal);
						const modalManager = this.syncManager!;
						this.syncModal.setRollbackHandler(() => modalManager.rollbackBatch());
						this.syncModal.setCommitHandler(() => modalManager.commitPendingBatch());
						this.syncModal.setRecoveryStateSubscriber(listener => modalManager.subscribeRecoveryState(listener));
						this.syncModal.setRecoveryCenterHandler(() => this.openRecoveryCenter());
						this.syncModal.open();

						this.syncManager!.setProgressCallback((progress: SyncProgress) => {
							if (this.syncModal) {
								this.syncModal.updateProgress(progress);
							}
							this.updateStatusBar(progress);
						});

						const syncResult = await this.syncManager!.executeSync(
							result.items,
							result.action,
							localPropertyResult,
							this.settings.syncConcurrency
						);

						this.settings.lastSyncTime = new Date().toISOString();
						this.settings.lastSyncCount = syncResult.added + syncResult.skipped;
						await this.saveSettings();

						if (this.syncModal) {
							this.syncModal.showCompleted(syncResult);
						}
						this.cancellationSignal = null;
						this.syncManager!.setCancellationSignal(null);
						this.hideStatusBar();
					})();
				}
			);
			previewModal.open();

			} catch (error) {
				console.error('[Bangumi Sync] Preview flow error:', error);
				new Notice(`${tn('notices', 'syncFailed')}: ${error instanceof Error ? error.message : String(error)}`);
				this.cleanupSyncState(0);
			}

		} else {
			const result = await this.syncManager.sync({
				subjectTypes: options.subjectTypes,
				collectionTypes: options.collectionTypes,
				limit: options.limit,
				force: options.force,
			}, this.settings.syncConcurrency);

			this.settings.lastSyncTime = new Date().toISOString();
			this.settings.lastSyncCount = result.added + result.skipped;
			await this.saveSettings();

			if (this.syncModal) {
				this.syncModal.showCompleted(result);
			}
			this.cancellationSignal = null;
			this.syncManager.setCancellationSignal(null);
			this.hideStatusBar();
		}
	}

	private ensureSyncCanStart(): boolean {
		if (!this.syncManager) {
			new Notice(tn('notices', 'syncManagerNotInit'));
			return false;
		}
		try {
			this.syncManager.ensureCanStartSync();
			return true;
		} catch (error) {
			if (error instanceof RecoveryRequiredError) {
				new Notice(tn('recoveryCenter', 'writeBlocked'));
				this.openRecoveryCenter();
			} else if (error instanceof PendingDecisionInProgressError) {
				new Notice(tn('recoveryCenter', 'decisionInProgress'));
			} else if (error instanceof PendingSyncTransactionError) {
				new Notice(tn('recoveryCenter', 'pendingDecision'));
			} else {
				new Notice(error instanceof Error ? error.message : String(error));
			}
			return false;
		}
	}

	private ensureWriteCanStart(operation: WriteOperation): boolean {
		try {
			assertWriteOperationAllowed(operation);
			return true;
		} catch (error) {
			if (error instanceof RecoveryRequiredError) {
				new Notice(tn('recoveryCenter', 'writeBlocked'));
				this.openRecoveryCenter();
			} else if (error instanceof PendingDecisionInProgressError) {
				new Notice(tn('recoveryCenter', 'decisionInProgress'));
			} else if (error instanceof PendingSyncTransactionError) {
				new Notice(tn('recoveryCenter', 'pendingDecision'));
			} else {
				new Notice(error instanceof Error ? error.message : String(error));
			}
			return false;
		}
	}

	private cleanupSyncState(statusBarDelay: number = 0): void {
		if (this.syncModal) {
			this.syncModal.close();
			this.syncModal = null;
		}
		this.cancellationSignal = null;
		if (this.syncManager) {
			this.syncManager.setCancellationSignal(null);
		}
		this.hideStatusBar(statusBarDelay);
	}

	private async collectLocalPropertyValuesForCollections(
		collections: UserCollection[]
	): Promise<LocalPropertyModalResult | null> {
		const syncManager = this.syncManager;
		if (!syncManager) {
			return {
				propertyValuesBySubjectId: new Map(),
			};
		}

		let warned = false;
		const subjectsById = await loadSubjectsForCollections(
			collections,
			syncManager.client,
			(message) => {
				if (!warned) {
					warned = true;
					new Notice(message);
				}
			}
		);

		console.debug(`[Bangumi Sync] Opening custom properties modal for ${collections.length} collections`);

		return new Promise<LocalPropertyModalResult | null>(resolve => {
			const modal = new LocalPropertyModal(
				this.app,
				collections,
				subjectsById,
				syncManager.getCustomTemplates(),
				(result) => {
					resolved = true;
					resolve(result);
				}
			);

			let resolved = false;
			const originalOnClose = modal.onClose.bind(modal);
			modal.onClose = () => {
				originalOnClose();
				if (!resolved) {
					resolved = true;
					resolve(null);
				}
			};
			modal.open();
		});
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
