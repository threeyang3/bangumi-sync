/**
 * 设置面板 UI
 */

import { App, PluginSettingTab, Setting, Plugin } from 'obsidian';
import { BangumiPluginSettings, CoverLinkType, PathNamingStrategy } from './settings';
import { SubjectType, CollectionType, getSubjectTypeName, getCollectionTypeName } from '../../common/api/types';
import { tn, t, getLocale } from '../i18n';
import { TemplateSettingsView } from './templateSettingsView';
import { createSettingsPatch, reconcileSettingsDraft, SettingsPatch, SettingsSaveOutcome } from './settingsPatch';

/**
 * 设置面板（分页布局）
 */
export class BangumiSettingTab extends PluginSettingTab {
	private templateView: TemplateSettingsView;
	private activeTab = 0;
	private settings: BangumiPluginSettings;
	private submittedSettings: BangumiPluginSettings;
	private onSave: () => Promise<void>;
	private onDiagnose: () => Promise<void>;
	private onPreviewMigration: () => Promise<void>;

	constructor(
		app: App,
		plugin: Plugin,
		settings: BangumiPluginSettings,
		onSave: (patch: SettingsPatch) => Promise<SettingsSaveOutcome>,
		onDiagnose: () => Promise<void>,
		onPreviewMigration: () => Promise<void>,
	) {
		super(app, plugin);
		this.settings = this.cloneSettings(settings);
		this.submittedSettings = this.cloneSettings(settings);
		this.onSave = async () => {
			const patch = createSettingsPatch(this.submittedSettings, this.settings);
			if (patch.changedFields.length === 0) return;
			this.submittedSettings = this.cloneSettings(this.settings);
			const outcome = await onSave(patch);
			const reconciled = reconcileSettingsDraft(outcome);
			this.settings = reconciled.draft;
			this.submittedSettings = reconciled.submitted;
			if (reconciled.shouldRerender) this.display();
		};
		this.onDiagnose = onDiagnose;
		this.onPreviewMigration = onPreviewMigration;
		this.templateView = new TemplateSettingsView(app, () => this.settings, () => this.onSave(), plugin);
	}

	private cloneSettings(settings: BangumiPluginSettings): BangumiPluginSettings {
		return JSON.parse(JSON.stringify(settings)) as BangumiPluginSettings;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('bangumi-settings-page');

		// 标题
		new Setting(containerEl).setName(tn('settings', 'heading')).setHeading();

		// 标签页定义
		const tabs: Array<{ name: string; build: (el: HTMLElement) => void }> = [
			{ name: tn('settings', 'tabGeneral'), build: this.buildGeneralTab.bind(this) },
			{ name: getLocale() === 'zh-CN' ? '输出与命名' : 'Output and naming', build: this.buildPathsTab.bind(this) },
			{ name: getLocale() === 'zh-CN' ? '作品模板' : 'Subject templates', build: this.buildTemplatesTab.bind(this) },
			{ name: getLocale() === 'zh-CN' ? '共享笔记' : 'Shared notes', build: el => this.templateView.buildShared(el) },
			{ name: getLocale() === 'zh-CN' ? '模板管理' : 'Template management', build: el => this.templateView.buildManagement(el) },
			{ name: tn('settings', 'tabSync'), build: this.buildSyncTab.bind(this) },
			{ name: tn('settings', 'tabAdvanced'), build: this.buildAdvancedTab.bind(this) },
			{ name: tn('settings', 'tabFields'), build: this.buildFieldsTab.bind(this) },
		];

		// 标签页容器
		const tabContainer = containerEl.createDiv({ cls: 'bangumi-settings-tab-container' });
		const tabHeaders = tabContainer.createDiv({ cls: 'bangumi-settings-tab-headers' });
		const tabContents = tabContainer.createDiv({ cls: 'bangumi-settings-tab-contents' });

		tabs.forEach((tab, index) => {
			const tabHeader = tabHeaders.createEl('button', { cls: 'bangumi-settings-tab-header', text: tab.name, attr: { type: 'button', 'aria-pressed': String(index === this.activeTab) } });
			const tabContent = tabContents.createDiv({ cls: 'bangumi-settings-tab-content' });

			if (index === this.activeTab) {
				tabHeader.addClass('active');
				tabContent.addClass('active');
			}

			// 立即构建标签页内容
			tab.build(tabContent);

			// 切换事件
			tabHeader.addEventListener('click', () => {
				this.activeTab = index;
				tabHeaders.querySelectorAll('.bangumi-settings-tab-header').forEach(h => {
					h.removeClass('active');
					h.setAttribute('aria-pressed', 'false');
				});
				tabContents.querySelectorAll('.bangumi-settings-tab-content').forEach(c => c.removeClass('active'));
				tabHeader.addClass('active');
				tabHeader.setAttribute('aria-pressed', 'true');
				tabContent.addClass('active');
			});
		});
	}

	// ==================== 标签页：通用 ====================

	private buildGeneralTab(containerEl: HTMLElement): void {
		// 帮助链接
		new Setting(containerEl).setName(tn('settings', 'helpLinks')).setHeading();

		const helpLinksDiv = containerEl.createDiv({ cls: 'bangumi-help-links' });

		helpLinksDiv.createEl('button', { text: tn('settings', 'templateGuide'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => {
				this.openExternalLink('https://github.com/threeyang3/bangumi-sync/blob/main/docs/user/TEMPLATE_GUIDE.md');
			});
		});

		helpLinksDiv.createEl('button', { text: tn('settings', 'githubRepo'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => {
				this.openExternalLink('https://github.com/threeyang3/bangumi-sync');
			});
		});

		helpLinksDiv.createEl('button', { text: tn('settings', 'getAccessToken'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => {
				this.openExternalLink('https://next.bgm.tv/demo/access-token');
			});
		});

		// 认证设置
		new Setting(containerEl).setName(tn('settings', 'authentication')).setHeading();

		new Setting(containerEl)
			.setName(tn('settings', 'accessToken'))
			.setDesc(tn('settings', 'accessTokenDesc'))
			.addText(text => text
				.setPlaceholder(tn('settings', 'enterAccessToken'))
				.setValue(this.settings.accessToken)
				.onChange(async (value) => {
					this.settings.accessToken = value;
					await this.onSave();
				}));

		// 同步状态
		new Setting(containerEl).setName(tn('settings', 'syncStatus')).setHeading();

		const lastSyncText = this.settings.lastSyncTime
			? `${tn('settings', 'lastSync')}: ${new Date(this.settings.lastSyncTime).toLocaleString()} (${this.settings.lastSyncCount} items)`
			: tn('settings', 'notSyncedYet');

		new Setting(containerEl)
			.setName(tn('settings', 'syncStatus'))
			.setDesc(lastSyncText);
	}

	// ==================== 标签页：路径 ====================

	private buildPathsTab(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(tn('settings', 'pathSettings')).setHeading();

		this.templateView.build(containerEl.createDiv(), 'path');

		const namingStrategies: Record<string, PathNamingStrategy> = {
			'simple-until-collision': 'simple-until-collision',
			'always-year': 'always-year',
			'always-id': 'always-id',
			'custom-template': 'custom-template',
		};
		new Setting(containerEl)
			.setName(tn('settings', 'pathNamingStrategy'))
			.setDesc(tn('settings', 'pathNamingStrategyDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('simple-until-collision', tn('settings', 'pathNamingSimple'))
				.addOption('always-year', tn('settings', 'pathNamingYear'))
				.addOption('always-id', tn('settings', 'pathNamingId'))
				.addOption('custom-template', tn('settings', 'pathNamingCustom'))
				.setValue(this.settings.pathNamingStrategy)
				.onChange(async value => {
					const strategy = namingStrategies[value];
					if (!strategy) return;
					this.settings.pathNamingStrategy = strategy;
					await this.onSave();
				}));

		new Setting(containerEl)
			.addButton(button => button
				.setButtonText(tn('commands', 'diagnoseLocalSubjects'))
				.onClick(() => this.onDiagnose()))
			.addButton(button => button
				.setButtonText(tn('commands', 'previewPathMigration'))
				.onClick(() => this.onPreviewMigration()));

		// 扫描文件夹路径
		new Setting(containerEl)
			.setName(tn('settings', 'scanFolderPath'))
			.setDesc(tn('settings', 'scanFolderPathDesc'))
			.addText(text => text
				.setPlaceholder('ACGN')
				.setValue(this.settings.scanFolderPath)
				.onChange(async (value) => {
					this.settings.scanFolderPath = value;
					await this.onSave();
				}));

		// 下载封面图片
		new Setting(containerEl)
			.setName(tn('settings', 'downloadCoverImages'))
			.setDesc(tn('settings', 'downloadCoverImagesDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.downloadImages)
				.onChange(async (value) => {
					this.settings.downloadImages = value;
					await this.onSave();
				}));

		// 图片质量
		const imageQuality = t('settings');
		new Setting(containerEl)
			.setName(tn('settings', 'imageQuality'))
			.setDesc(tn('settings', 'imageQualityDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('small', imageQuality.imageQualitySmall)
				.addOption('medium', imageQuality.imageQualityMedium)
				.addOption('large', imageQuality.imageQualityLarge)
				.setValue(this.settings.imageQuality || 'large')
				.onChange(async (value: string) => {
					this.settings.imageQuality = value as 'small' | 'medium' | 'large';
					await this.onSave();
				}));

		// 更新已存在的图片
		new Setting(containerEl)
			.setName(tn('settings', 'updateExistingImages'))
			.setDesc(tn('settings', 'updateExistingImagesDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.imageUpdateExisting || false)
				.onChange(async (value) => {
					this.settings.imageUpdateExisting = value;
					await this.onSave();
				}));

		// 封面链接类型
		new Setting(containerEl)
			.setName(tn('settings', 'coverLinkType'))
			.setDesc(tn('settings', 'coverLinkTypeDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('network', tn('settings', 'coverLinkNetwork'))
				.addOption('local', tn('settings', 'coverLinkLocal'))
				.setValue(this.settings.coverLinkType || 'network')
				.onChange(async (value: string) => {
					this.settings.coverLinkType = value as CoverLinkType;
					await this.onSave();
				}));

		// 图片路径模板
		new Setting(containerEl)
			.setName(tn('settings', 'imagePathTemplate'))
			.setDesc(tn('settings', 'imagePathTemplateDesc'))
			.addText(text => text
				.setPlaceholder('ACGN/assets/{{name_cn}}_{{typeLabel}}.jpg')
				.setValue(this.settings.imagePathTemplate)
				.onChange(async (value) => {
					this.settings.imagePathTemplate = value;
					await this.onSave();
				}));


	}

	// ==================== 标签页：模板 ====================

	private buildTemplatesTab(containerEl: HTMLElement): void {
		this.templateView.build(containerEl, 'content');
	}

	// ==================== 标签页：同步 ====================

	private buildSyncTab(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(tn('settings', 'syncOptions')).setHeading();

		// 条目类型选择
		new Setting(containerEl)
			.setName(tn('settings', 'subjectTypesToSync'))
			.setDesc(tn('settings', 'subjectTypesToSyncDesc'));

		const subjectTypesDiv = containerEl.createDiv({ cls: 'bangumi-checkbox-group' });
		const subjectTypes = [SubjectType.Anime, SubjectType.Game, SubjectType.Book, SubjectType.Music, SubjectType.Real];
		subjectTypes.forEach(type => {
			const label = subjectTypesDiv.createEl('label', { cls: 'bangumi-checkbox-label' });
			const checkbox = label.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.settings.defaultSubjectTypes.includes(type);
			checkbox.addEventListener('change', () => {
				void (async () => {
					if (checkbox.checked) {
						if (!this.settings.defaultSubjectTypes.includes(type)) {
							this.settings.defaultSubjectTypes.push(type);
						}
					} else {
						this.settings.defaultSubjectTypes = this.settings.defaultSubjectTypes.filter(t => t !== type);
					}
					await this.onSave();
				})();
			});
			label.createSpan({ text: getSubjectTypeName(type) });
		});

		// 收藏类型选择
		new Setting(containerEl)
			.setName(tn('settings', 'collectionTypesToSync'))
			.setDesc(tn('settings', 'collectionTypesToSyncDesc'));

		const collectionTypesDiv = containerEl.createDiv({ cls: 'bangumi-checkbox-group' });
		const collectionTypes = [CollectionType.Wish, CollectionType.Doing, CollectionType.Done, CollectionType.OnHold, CollectionType.Dropped];
		collectionTypes.forEach(type => {
			const label = collectionTypesDiv.createEl('label', { cls: 'bangumi-checkbox-label' });
			const checkbox = label.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.settings.defaultCollectionTypes.includes(type);
			checkbox.addEventListener('change', () => {
				void (async () => {
					if (checkbox.checked) {
						if (!this.settings.defaultCollectionTypes.includes(type)) {
							this.settings.defaultCollectionTypes.push(type);
						}
					} else {
						this.settings.defaultCollectionTypes = this.settings.defaultCollectionTypes.filter(t => t !== type);
					}
					await this.onSave();
				})();
			});
			label.createSpan({ text: getCollectionTypeName(type) });
		});

		// 同步数量限制
		const syncLimitSetting = new Setting(containerEl)
			.setName(tn('settings', 'syncLimit'))
			.setDesc(tn('settings', 'syncLimitDesc'))
			.addText(text => text
				.setPlaceholder('50')
				.setValue(this.settings.syncLimit === 0 ? '' : String(this.settings.syncLimit))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						this.settings.syncLimit = num;
						await this.onSave();
					}
				}))
			.addButton(btn => btn
				.setButtonText(tn('settings', 'syncAll'))
				.onClick(async () => {
					this.settings.syncLimit = 0;
					const input = syncLimitSetting.controlEl.querySelector('input') as HTMLInputElement;
					if (input) {
						input.value = '';
					}
					await this.onSave();
				}));

		// 同步并发数
		new Setting(containerEl)
			.setName(tn('settings', 'syncConcurrency'))
			.setDesc(tn('settings', 'syncConcurrencyDesc'))
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.settings.syncConcurrency)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.settings.syncConcurrency = value;
					await this.onSave();
				}));

		// 自动同步
		new Setting(containerEl).setName(tn('settings', 'autoSync')).setHeading();

		new Setting(containerEl)
			.setName(tn('settings', 'enableAutoSync'))
			.setDesc(tn('settings', 'enableAutoSyncDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.autoSync)
				.onChange(async (value) => {
					this.settings.autoSync = value;
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName(tn('settings', 'syncInterval'))
			.setDesc(tn('settings', 'syncIntervalDesc'))
			.addText(text => text
				.setPlaceholder('60')
				.setValue(String(this.settings.autoSyncInterval))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num > 0) {
						this.settings.autoSyncInterval = num;
						await this.onSave();
					}
				}));
	}

	// ==================== 标签页：高级 ====================

	private buildAdvancedTab(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName(tn('settings', 'diagnosticLogging'))
			.setDesc(tn('settings', 'diagnosticLoggingDesc'))
			.addToggle(toggle => toggle
				.setTooltip(tn('settings', 'diagnosticLogging'))
				.setValue(this.settings.diagnosticLogging)
				.onChange(async value => {
					this.settings.diagnosticLogging = value;
					await this.onSave();
				}));

		// 相关条目链接
		new Setting(containerEl).setName(tn('settings', 'relatedLinks')).setHeading();

		new Setting(containerEl)
			.setName(tn('settings', 'enableRelatedLinks'))
			.setDesc(tn('settings', 'enableRelatedLinksDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.enableRelatedLinks)
				.onChange(async (value) => {
					this.settings.enableRelatedLinks = value;
					await this.onSave();
				}));

		// 数据保护设置
		new Setting(containerEl).setName(tn('settings', 'dataProtection')).setHeading();
		containerEl.createEl('p', { text: tn('settings', 'dataProtectionDesc'), cls: 'bangumi-setting-desc' });

		new Setting(containerEl)
			.setName(tn('settings', 'preserveRatingDetails'))
			.setDesc(tn('settings', 'preserveRatingDetailsDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.dataProtection?.preserveRatingDetails ?? true)
				.onChange(async (value) => {
					this.settings.dataProtection = {
						...this.settings.dataProtection,
						preserveRatingDetails: value,
					};
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName(tn('settings', 'preserveCustomProperties'))
			.setDesc(tn('settings', 'preserveCustomPropertiesDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.dataProtection?.preserveCustomProperties ?? true)
				.onChange(async (value) => {
					this.settings.dataProtection = {
						...this.settings.dataProtection,
						preserveCustomProperties: value,
					};
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName(tn('settings', 'preserveRecord'))
			.setDesc(tn('settings', 'preserveRecordDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.dataProtection?.preserveRecord ?? true)
				.onChange(async (value) => {
					this.settings.dataProtection = {
						...this.settings.dataProtection,
						preserveRecord: value,
					};
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName(tn('settings', 'preserveThoughts'))
			.setDesc(tn('settings', 'preserveThoughtsDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.dataProtection?.preserveThoughts ?? true)
				.onChange(async (value) => {
					this.settings.dataProtection = {
						...this.settings.dataProtection,
						preserveThoughts: value,
					};
					await this.onSave();
				}));
	}

	// ==================== 标签页：字段参考 ====================

	private buildFieldsTab(containerEl: HTMLElement): void {
		containerEl.createEl('p', { text: tn('settings', 'fieldsIntro'), cls: 'bangumi-setting-desc' });

		// 路径变量
		this.addFieldTable(containerEl, tn('settings', 'fieldsPathVars'), [
			['{{type}}', '条目类型英文名', 'anime'],
			['{{typeLabel}}', '条目类型中文标签', '动画'],
			['{{category}}', '细分类别', 'TV'],
			['{{name}}', '原名', '進撃の巨人'],
			['{{name_cn}}', '中文名', '进击的巨人'],
			['{{name_cn_with_type}}', '中文名+类型后缀', '进击的巨人(动画)'],
			['{{year}}', '发行年份', '2013'],
			['{{month}}', '发行月份', '04'],
			['{{author}}', '作者/创作者', '谏山创'],
			['{{id}}', '条目 ID', '10060'],
		]);

		// 基础信息
		this.addFieldTable(containerEl, tn('settings', 'fieldsBasicVars'), [
			['{{name}}', '原名', '進撃の巨人'],
			['{{name_cn}}', '中文名', '进击的巨人'],
			['{{alias}}', '别名', 'Attack on Titan'],
			['{{summary}}', '简介（HTML 已清洗）', '巨人支配着的世界...'],
			['{{rating}}', 'Bangumi 评分', '8.5'],
			['{{rank}}', 'Bangumi 排名', '#42'],
			['{{cover}}', '封面图片 URL', 'https://...'],
			['{{bangumi_url}}', '条目链接', 'https://bgm.tv/subject/10060'],
			['{{date}}', '发行日期', '2013-04-06'],
		]);

		// 收藏信息
		this.addFieldTable(containerEl, tn('settings', 'fieldsCollectionVars'), [
			['{{my_rate}}', '我的评分（0-10）', '9'],
			['{{my_comment}}', '短评（YAML 安全，多行转义为 \\n）', '值得一看'],
			['{{my_comment_raw}}', '短评（callout 安全格式，多行内容会自动保持在正文 callout 中）', '值得一看'],
			['{{my_status}}', '收藏状态', '在看'],
			['{{my_tags}}', '我的标签（逗号分隔）', '神作, 热血'],
			['{{tags}}', '我的标签（YAML 数组格式）', '  - 神作\n  - 热血'],
		]);

		// 条目特定字段
		this.addFieldTable(containerEl, tn('settings', 'fieldsSubjectVars'), [
			['{{episode}}', '话数/集数', '25'],
			['{{director}}', '导演', '荒木哲郎'],
			['{{music}}', '音乐', '泽野弘之'],
			['{{animeMake}}', '动画制作', 'WIT STUDIO'],
			['{{author}}', '作者', '谏山创'],
			['{{illustration}}', '插图', ''],
			['{{publish}}', '出版社', '讲谈社'],
			['{{series}}', '系列', ''],
			['{{platform}}', '平台', 'PC'],
			['{{develop}}', '开发商', ''],
			['{{publisher}}', '发行商', ''],
			['{{volumes}}', '卷数', '34'],
			['{{pages}}', '页数', ''],
			['{{isbn}}', 'ISBN', ''],
			['{{website}}', '官方网站', ''],
			['{{start}}', '开始日期', ''],
			['{{end}}', '结束日期', ''],
			['{{staff}}', 'staff 信息', ''],
			['{{price}}', '价格', ''],
			['{{playerNum}}', '游玩人数', ''],
			['{{from}}', '原作', ''],
			['{{animeChief}}', '总导演', ''],
		]);

		// 角色与 staff
		this.addFieldTable(containerEl, tn('settings', 'fieldsCharacterVars'), [
			['{{character1}} ~ {{character9}}', '角色名（最多 9 位）', '艾伦·耶格尔'],
			['{{characterCV1}} ~ {{characterCV9}}', '角色 CV', '梶裕贵'],
			['{{characterPhoto1}} ~ {{characterPhoto9}}', '角色照片', 'https://...'],
		]);

		// 章节与进度
		this.addFieldTable(containerEl, tn('settings', 'fieldsEpisodeVars'), [
			['{{episodes}}', '章节显示（动画/漫画）', '`.ep-box` HTML'],
			['{{volumes_display}}', '单行本显示（小说）', '`.ep-box` HTML'],
			['{{progress}}', '进度信息', ''],
		]);

		// 模板语法
		new Setting(containerEl).setName(tn('settings', 'templateSyntax')).setHeading();
		const syntaxTable = this.createFieldTable([
			['{{变量名}}', '普通变量，值为空时输出空白'],
			['{{变量名|默认值}}', '带默认值的变量，值为空时输出默认值', '{{rating|未评分}}'],
			['{{#if 变量名}}...{{/if}}', '条件渲染，变量非空时才输出内容', '{{#if my_rate}}评分: {{my_rate}}{{/if}}'],
		]);
		new Setting(containerEl).setDesc(syntaxTable);
	}

	private addFieldTable(containerEl: HTMLElement, title: string, rows: string[][]): void {
		new Setting(containerEl).setName(title).setHeading();
		const table = this.createFieldTable(rows);
		new Setting(containerEl).setDesc(table);
	}

	private createFieldTable(rows: string[][]): DocumentFragment {
		const frag = new DocumentFragment();
		const table = frag.createEl('table', { cls: 'bangumi-field-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: '变量' });
		headerRow.createEl('th', { text: '说明' });
		headerRow.createEl('th', { text: '示例' });
		const tbody = table.createEl('tbody');
		for (const row of rows) {
			const tr = tbody.createEl('tr');
			tr.createEl('td').createEl('code', { text: row[0] });
			tr.createEl('td', { text: row[1] });
			tr.createEl('td', { text: row[2] || '', cls: 'bangumi-field-example' });
		}
		return frag;
	}

	// ==================== 工具方法 ====================

	private openExternalLink(url: string): void {
		const externalWindow = this.app.workspace.containerEl.ownerDocument.defaultView;
		externalWindow?.open(url, '_blank', 'noopener,noreferrer');
	}

}
