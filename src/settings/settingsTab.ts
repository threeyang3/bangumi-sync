/**
 * 设置面板 UI
 */

import { App, PluginSettingTab, Setting, Notice, Modal, TextAreaComponent, TFile, FuzzySuggestModal, Plugin } from 'obsidian';
import { BangumiPluginSettings, TemplateConfig, TemplateSource, CoverLinkType } from './settings';
import { SubjectType, CollectionType, getSubjectTypeName, getCollectionTypeName } from '../../common/api/types';
import { tn, t, getLocale } from '../i18n';
import {
	getBuiltInTemplateByKey,
} from '../../common/template/defaultTemplates';
import {
	TEMPLATE_CATEGORY_OPTIONS,
	TemplateCategoryOption,
	TemplateKey,
} from '../../common/template/templateRegistry';

/**
 * 模板类型配置
 */
interface TemplateTypeOption {
	key: TemplateKey;
	nameKey: keyof import('../i18n/translations').TranslationStrings['settings'];
}

const TEMPLATE_TYPES: TemplateTypeOption[] = [
	{ key: 'animeTemplateConfig', nameKey: 'animeTemplate' },
	{ key: 'novelTemplateConfig', nameKey: 'novelTemplate' },
	{ key: 'comicTemplateConfig', nameKey: 'comicTemplate' },
	{ key: 'gameTemplateConfig', nameKey: 'gameTemplate' },
	{ key: 'albumTemplateConfig', nameKey: 'albumTemplate' },
	{ key: 'musicTemplateConfig', nameKey: 'musicTemplate' },
	{ key: 'realTemplateConfig', nameKey: 'realTemplate' },
];

/**
 * 设置面板（分页布局）
 */
export class BangumiSettingTab extends PluginSettingTab {
	private settings: BangumiPluginSettings;
	private onSave: () => Promise<void>;

	constructor(app: App, plugin: Plugin, settings: BangumiPluginSettings, onSave: () => Promise<void>) {
		super(app, plugin);
		this.settings = settings;
		this.onSave = onSave;
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
			{ name: tn('settings', 'tabPaths'), build: this.buildPathsTab.bind(this) },
			{ name: tn('settings', 'tabTemplates'), build: this.buildTemplatesTab.bind(this) },
			{ name: tn('settings', 'tabSync'), build: this.buildSyncTab.bind(this) },
			{ name: tn('settings', 'tabAdvanced'), build: this.buildAdvancedTab.bind(this) },
			{ name: tn('settings', 'tabFields'), build: this.buildFieldsTab.bind(this) },
		];

		// 标签页容器
		const tabContainer = containerEl.createDiv({ cls: 'bangumi-settings-tab-container' });
		const tabHeaders = tabContainer.createDiv({ cls: 'bangumi-settings-tab-headers' });
		const tabContents = tabContainer.createDiv({ cls: 'bangumi-settings-tab-contents' });

		tabs.forEach((tab, index) => {
			const tabHeader = tabHeaders.createDiv({ cls: 'bangumi-settings-tab-header', text: tab.name });
			const tabContent = tabContents.createDiv({ cls: 'bangumi-settings-tab-content' });

			if (index === 0) {
				tabHeader.addClass('active');
				tabContent.addClass('active');
			}

			// 立即构建标签页内容
			tab.build(tabContent);

			// 切换事件
			tabHeader.addEventListener('click', () => {
				tabHeaders.querySelectorAll('.bangumi-settings-tab-header').forEach(h => h.removeClass('active'));
				tabContents.querySelectorAll('.bangumi-settings-tab-content').forEach(c => c.removeClass('active'));
				tabHeader.addClass('active');
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
				this.openExternalLink('https://github.com/threeyang3/bangumi-sync/blob/main/docs/TEMPLATE_GUIDE.md');
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

		// 文件路径模板
		new Setting(containerEl)
			.setName(tn('settings', 'filePathTemplate'))
			.setDesc(tn('settings', 'filePathTemplateDesc'));

		const pathTemplateDiv = containerEl.createDiv({ cls: 'bangumi-path-template-setting' });
		new Setting(pathTemplateDiv)
			.addText(text => {
				text.setPlaceholder('ACGN/{{type}}/{{name_cn_with_type}}.md')
					.setValue(this.settings.syncPathTemplate)
					.onChange(async (value) => {
						this.settings.syncPathTemplate = value;
						await this.onSave();
						this.updatePathPreview(previewEl, value);
					});
				text.inputEl.addClass('bangumi-path-input');
			});

		// 路径预览
		const previewEl = containerEl.createDiv({ cls: 'bangumi-path-preview' });
		this.updatePathPreview(previewEl, this.settings.syncPathTemplate);

		// 各类型路径模板
		new Setting(containerEl)
			.setName(tn('settings', 'pathTemplateByType'))
			.setDesc(tn('settings', 'pathTemplateByTypeDesc'));

		const TYPE_PATH_KEYS = [
			{ key: 'book', label: '书籍' },
			{ key: 'anime', label: '动画' },
			{ key: 'music', label: '音乐' },
			{ key: 'game', label: '游戏' },
			{ key: 'real', label: '三次元' },
		];

		for (const { key, label } of TYPE_PATH_KEYS) {
			const typeDiv = containerEl.createDiv({ cls: 'bangumi-path-template-setting' });
			new Setting(typeDiv)
				.setName(label)
				.addText(text => {
					text.setPlaceholder(this.settings.syncPathTemplate)
						.setValue(this.settings.pathTemplateByType?.[key] || '')
						.onChange(async (value) => {
							if (!this.settings.pathTemplateByType) {
								this.settings.pathTemplateByType = {};
							}
							if (value) {
								this.settings.pathTemplateByType[key] = value;
							} else {
								delete this.settings.pathTemplateByType[key];
								if (Object.keys(this.settings.pathTemplateByType).length === 0) {
									this.settings.pathTemplateByType = undefined;
								}
							}
							await this.onSave();
							this.updatePathPreview(typePreviewEl, value || this.settings.syncPathTemplate);
						});
					text.inputEl.addClass('bangumi-path-input');
				});

			const typePreviewEl = typeDiv.createDiv({ cls: 'bangumi-path-preview' });
			this.updatePathPreview(typePreviewEl, this.settings.pathTemplateByType?.[key] || this.settings.syncPathTemplate);
		}

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

		// 笔记路径模板
		new Setting(containerEl)
			.setName(tn('settings', 'notePathTemplate'))
			.setDesc(tn('settings', 'notePathTemplateDesc'))
			.addText(text => text
				.setPlaceholder('收集箱/笔记/ACGN/{{name_cn}}.md')
				.setValue(this.settings.notePathTemplate)
				.onChange(async (value) => {
					this.settings.notePathTemplate = value;
					await this.onSave();
				}));

		// 笔记模板内容
		new Setting(containerEl)
			.setName(tn('settings', 'noteTemplateContent'))
			.setDesc(tn('settings', 'noteTemplateContentDesc'))
			.addButton(button => {
				button
					.setButtonText(tn('settings', 'edit'))
					.onClick(() => {
						this.openNoteTemplateEditor();
					});
			});
	}

	// ==================== 标签页：模板 ====================

	private buildTemplatesTab(containerEl: HTMLElement): void {
		new Setting(containerEl).setName(tn('settings', 'templateSettings')).setHeading();

		// 模板变量帮助
		const helpDiv = containerEl.createDiv({ cls: 'bangumi-template-help' });
		helpDiv.createEl('p', { text: tn('settings', 'templateVarTip') });
		const vars = [
			'{{name}}', '{{name_cn}}', '{{alias}}',
			'{{rating}}', '{{rank}}', '{{summary}}',
			'{{cover}}', '{{date}}', '{{year}}', '{{month}}',
			'{{my_rate}}', '{{my_comment}}', '{{my_status}}', '{{my_tags}}',
			'{{character1-9}}', '{{characterCV1-9}}', '{{characterPhoto1-9}}',
		];
		vars.forEach(v => helpDiv.createEl('span', { text: v, cls: 'bangumi-var-tag' }));

		// 各类型模板设置
		TEMPLATE_TYPES.forEach(templateType => {
			this.addTemplateFileSetting(containerEl, templateType);
		});

		const categoryHeading = getLocale() === 'zh-CN' ? '细分类别模板' : 'Category templates';
		const categoryDesc = getLocale() === 'zh-CN'
			? '可以为每一种 category 单独指定模板来源；未单独设置时，继承所属大类模板。'
			: 'Each category can override its template source. Unconfigured categories inherit their parent template.';
		new Setting(containerEl)
			.setName(categoryHeading)
			.setDesc(categoryDesc)
			.setHeading();

		TEMPLATE_CATEGORY_OPTIONS.forEach(categoryOption => {
			this.addCategoryTemplateSetting(containerEl, categoryOption);
		});

		// 导出模板按钮
		new Setting(containerEl)
			.setName(tn('settings', 'exportTemplates'))
			.setDesc(tn('settings', 'exportTemplatesDesc'))
			.addButton(button => {
				button
					.setButtonText(tn('settings', 'exportTemplates'))
					.onClick(() => {
						void this.exportAllTemplates();
					});
			});
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
			['{{status}}', '连载状态', '完结'],
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
		new Setting(containerEl).setName('模板语法').setHeading();
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

	/**
	 * 更新路径预览
	 */
	private updatePathPreview(el: HTMLElement, template: string): void {
		el.empty();
		el.createEl('span', { text: `${tn('settings', 'preview')}: `, cls: 'bangumi-preview-label' });

		const preview = template
			.replace(/\{\{type\}\}/g, 'anime')
			.replace(/\{\{category\}\}/g, 'TV')
			.replace(/\{\{name\}\}/g, '進撃の巨人')
			.replace(/\{\{name_cn\}\}/g, '进击的巨人')
			.replace(/\{\{name_cn_with_type\}\}/g, '进击的巨人(动画)')
			.replace(/\{\{year\}\}/g, '2013')
			.replace(/\{\{author\}\}/g, '谏山创')
			.replace(/\{\{id\}\}/g, '10060');

		el.createEl('code', { text: preview });
	}

	/**
	 * 添加模板文件选择设置
	 */
	private addTemplateFileSetting(containerEl: HTMLElement, templateType: TemplateTypeOption): void {
		const config = this.settings[templateType.key];

		new Setting(containerEl)
			.setName(tn('settings', templateType.nameKey))
			.setDesc(this.getTemplateSourceDesc(config))
			.addDropdown(dropdown => {
				dropdown
					.addOption('standard', tn('settings', 'standardTemplate'))
					.addOption('author', tn('settings', 'authorTemplate'))
					.addOption('file', tn('settings', 'fromFile'))
					.addOption('custom', tn('settings', 'customContent'))
					.setValue(['standard', 'author', 'file', 'custom'].includes(config.source) ? config.source : 'author')
					.onChange(async (value: string) => {
						const newConfig: TemplateConfig = { source: value as TemplateSource };
						if (value === 'file' && config.filePath) {
							newConfig.filePath = config.filePath;
						} else if (value === 'custom' && config.customContent) {
							newConfig.customContent = config.customContent;
						}
						this.settings[templateType.key] = newConfig;
						await this.onSave();
						this.display();
					});
			})
			.addButton(button => {
				if (config.source === 'file') {
					button
						.setButtonText(config.filePath || tn('settings', 'selectFile'))
						.onClick(() => {
							this.openFileSuggestForBase(templateType);
						});
				} else if (config.source === 'custom') {
					button
						.setButtonText(tn('settings', 'edit'))
						.onClick(() => {
							this.openTemplateEditorForBase(templateType);
						});
				} else {
					button
						.setButtonText(tn('settings', 'preview'))
						.onClick(() => {
							this.openTemplatePreviewForBase(templateType);
						});
				}
			})
			.addButton(button => {
				button
					.setButtonText(tn('settings', 'copy'))
					.setTooltip(tn('settings', 'copyTooltip'))
					.onClick(() => {
						void this.copyCurrentBaseTemplate(templateType);
					});
			});
	}

	private addCategoryTemplateSetting(containerEl: HTMLElement, categoryOption: TemplateCategoryOption): void {
		const config = this.settings.templateConfigByCategory?.[categoryOption.key];
		const currentMode = config?.source ?? 'inherit';
		const inheritLabel = getLocale() === 'zh-CN' ? '继承大类模板' : 'Inherit parent template';

		new Setting(containerEl)
			.setName(categoryOption.label)
			.setDesc(this.getCategoryTemplateSourceDesc(categoryOption, config))
			.addDropdown(dropdown => {
				dropdown
					.addOption('inherit', inheritLabel)
					.addOption('standard', tn('settings', 'standardTemplate'))
					.addOption('author', tn('settings', 'authorTemplate'))
					.addOption('file', tn('settings', 'fromFile'))
					.addOption('custom', tn('settings', 'customContent'))
					.setValue(currentMode)
					.onChange(async (value: string) => {
						if (value === 'inherit') {
							if (this.settings.templateConfigByCategory) {
								delete this.settings.templateConfigByCategory[categoryOption.key];
								if (Object.keys(this.settings.templateConfigByCategory).length === 0) {
									this.settings.templateConfigByCategory = undefined;
								}
							}
						} else {
							const nextConfig: TemplateConfig = { source: value as TemplateSource };
							if (value === 'file' && config?.filePath) {
								nextConfig.filePath = config.filePath;
							} else if (value === 'custom' && config?.customContent) {
								nextConfig.customContent = config.customContent;
							}
							if (!this.settings.templateConfigByCategory) {
								this.settings.templateConfigByCategory = {};
							}
							this.settings.templateConfigByCategory[categoryOption.key] = nextConfig;
						}
						await this.onSave();
						this.display();
					});
			})
			.addButton(button => {
				if (currentMode === 'file') {
					button
						.setButtonText(config?.filePath || tn('settings', 'selectFile'))
						.onClick(() => {
							this.openFileSuggestForCategory(categoryOption);
						});
				} else if (currentMode === 'custom') {
					button
						.setButtonText(tn('settings', 'edit'))
						.onClick(() => {
							this.openTemplateEditorForCategory(categoryOption);
						});
				} else {
					button
						.setButtonText(tn('settings', 'preview'))
						.onClick(() => {
							this.openTemplatePreviewForCategory(categoryOption);
						});
				}
			})
			.addButton(button => {
				button
					.setButtonText(tn('settings', 'copy'))
					.setTooltip(tn('settings', 'copyTooltip'))
					.onClick(() => {
						void this.copyCurrentCategoryTemplate(categoryOption);
					});
			});
	}

	/**
	 * 复制当前模板到自定义内容
	 */
	private async copyCurrentBaseTemplate(templateType: TemplateTypeOption): Promise<void> {
		const config = this.settings[templateType.key];
		const templateContent = await this.resolveTemplateContent(config, templateType.key);

		const newConfig: TemplateConfig = {
			source: 'custom',
			customContent: templateContent,
		};
		this.settings[templateType.key] = newConfig;
		await this.onSave();

		new Notice(tn('notices', 'copiedToCustom'));
		this.display();
	}

	private async copyCurrentCategoryTemplate(categoryOption: TemplateCategoryOption): Promise<void> {
		const templateContent = await this.getTemplateContentForCategory(categoryOption);
		if (!this.settings.templateConfigByCategory) {
			this.settings.templateConfigByCategory = {};
		}
		this.settings.templateConfigByCategory[categoryOption.key] = {
			source: 'custom',
			customContent: templateContent,
		};
		await this.onSave();
		new Notice(tn('notices', 'copiedToCustom'));
		this.display();
	}

	/**
	 * 导出所有模板到指定文件夹
	 */
	private async exportAllTemplates(): Promise<void> {
		const folderPath = await new Promise<string | null>((resolve) => {
			const modal = new Modal(this.app);
			modal.titleEl.setText(tn('settings', 'exportTemplates'));

			const content = modal.contentEl.createDiv();
			content.createEl('p', { text: tn('settings', 'exportTemplatesDesc') });

			const input = content.createEl('input', {
				type: 'text',
				placeholder: 'templates/',
				cls: 'bangumi-export-template-input',
			});
			input.value = 'templates/';

			const buttonDiv = content.createDiv({ cls: 'bangumi-export-template-buttons' });
			buttonDiv.createEl('button', { text: tn('syncOptions', 'cancel') }).addEventListener('click', () => {
				modal.close();
				resolve(null);
			});
			buttonDiv.createEl('button', { text: tn('statusSyncModal', 'execute'), cls: 'mod-cta' }).addEventListener('click', () => {
				modal.close();
				resolve(input.value.trim());
			});

			modal.open();
		});

		if (!folderPath) return;

		try {
			const normalizedPath = folderPath.replace(/\/+$/, '');
			if (!await this.app.vault.adapter.exists(normalizedPath)) {
				await this.app.vault.createFolder(normalizedPath);
			}

			const templateNames: Record<TemplateKey, string> = {
				animeTemplateConfig: 'anime-template.md',
				novelTemplateConfig: 'novel-template.md',
				comicTemplateConfig: 'comic-template.md',
				gameTemplateConfig: 'game-template.md',
				albumTemplateConfig: 'album-template.md',
				musicTemplateConfig: 'music-template.md',
				realTemplateConfig: 'real-template.md',
			};

			for (const templateType of TEMPLATE_TYPES) {
				const content = await this.getTemplateContent(templateType);
				const fileName = templateNames[templateType.key];
				const filePath = `${normalizedPath}/${fileName}`;

				if (await this.app.vault.adapter.exists(filePath)) {
					const file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						await this.app.vault.process(file, () => content);
					}
				} else {
					await this.app.vault.create(filePath, content);
				}
			}

			for (const categoryOption of TEMPLATE_CATEGORY_OPTIONS) {
				const content = await this.getTemplateContentForCategory(categoryOption);
				const fileName = `${categoryOption.key}-template.md`;
				const filePath = `${normalizedPath}/${fileName}`;

				if (await this.app.vault.adapter.exists(filePath)) {
					const file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						await this.app.vault.process(file, () => content);
					}
				} else {
					await this.app.vault.create(filePath, content);
				}
			}

			new Notice(tn('notices', 'exportTemplatesSuccess'));
		} catch (error) {
			console.error('[Bangumi Sync] Export templates failed:', error);
			new Notice(tn('notices', 'exportTemplatesFailed'));
		}
	}

	/**
	 * 获取模板内容
	 */
	private async getTemplateContent(templateType: TemplateTypeOption): Promise<string> {
		return this.resolveTemplateContent(this.settings[templateType.key], templateType.key);
	}

	private async getTemplateContentForCategory(categoryOption: TemplateCategoryOption): Promise<string> {
		const config = this.settings.templateConfigByCategory?.[categoryOption.key];
		if (!config) {
			return this.resolveTemplateContent(this.settings[categoryOption.templateKey], categoryOption.templateKey);
		}
		return this.resolveTemplateContent(config, categoryOption.templateKey);
	}

	/**
	 * 获取模板来源描述
	 */
	private getTemplateSourceDesc(config: TemplateConfig): string {
		switch (config.source) {
			case 'standard':
				return tn('settings', 'templateSourceStandard');
			case 'author':
				return tn('settings', 'templateSourceAuthor');
			case 'file':
				return config.filePath ? `${tn('settings', 'templateSourceFile')}: ${config.filePath}` : tn('settings', 'templateSourceFileEmpty');
			case 'custom':
				return tn('settings', 'templateSourceCustom');
			default:
				return '';
		}
	}

	private getCategoryTemplateSourceDesc(categoryOption: TemplateCategoryOption, config?: TemplateConfig): string {
		if (!config) {
			const parentLabel = tn('settings', this.getTemplateNameKey(categoryOption.templateKey));
			return getLocale() === 'zh-CN'
				? `未单独设置，当前继承：${parentLabel}`
				: `Not overridden. Currently inherits: ${parentLabel}`;
		}
		return this.getTemplateSourceDesc(config);
	}

	private getTemplateNameKey(templateKey: TemplateKey): TemplateTypeOption['nameKey'] {
		return TEMPLATE_TYPES.find(item => item.key === templateKey)?.nameKey ?? 'novelTemplate';
	}

	private async resolveTemplateContent(config: TemplateConfig, defaultTemplateKey: TemplateKey): Promise<string> {
		switch (config.source) {
			case 'standard':
				return getBuiltInTemplateByKey(defaultTemplateKey, false);
			case 'author':
				return getBuiltInTemplateByKey(defaultTemplateKey, true);
			case 'file':
				if (config.filePath) {
					const file = this.app.vault.getAbstractFileByPath(config.filePath);
					if (file instanceof TFile) {
						try {
							return await this.app.vault.read(file);
						} catch {
							new Notice(tn('notices', 'readTemplateFailed'));
						}
					} else {
						new Notice(tn('notices', 'templateFileNotFound'));
					}
				} else {
					new Notice(tn('notices', 'selectTemplateFirst'));
				}
				return getBuiltInTemplateByKey(defaultTemplateKey, true);
			case 'custom':
				return config.customContent || getBuiltInTemplateByKey(defaultTemplateKey, true);
			default:
				return getBuiltInTemplateByKey(defaultTemplateKey, true);
		}
	}

	private openExternalLink(url: string): void {
		const externalWindow = this.app.workspace.containerEl.ownerDocument.defaultView;
		externalWindow?.open(url, '_blank', 'noopener,noreferrer');
	}

	private openFileSuggestForBase(templateType: TemplateTypeOption): void {
		const modal = new FileSuggestModal(
			this.app,
			(file: TFile) => {
				void (async () => {
					const config = this.settings[templateType.key];
					config.filePath = file.path;
					await this.onSave();
					new Notice(`${tn('notices', 'templateFileSelected')}: ${file.path}`);
					this.display();
				})();
			}
		);
		modal.open();
	}

	private openFileSuggestForCategory(categoryOption: TemplateCategoryOption): void {
		const modal = new FileSuggestModal(
			this.app,
			(file: TFile) => {
				void (async () => {
					if (!this.settings.templateConfigByCategory) {
						this.settings.templateConfigByCategory = {};
					}
					const nextConfig = this.settings.templateConfigByCategory[categoryOption.key] ?? { source: 'file' as const };
					nextConfig.source = 'file';
					nextConfig.filePath = file.path;
					this.settings.templateConfigByCategory[categoryOption.key] = nextConfig;
					await this.onSave();
					new Notice(`${tn('notices', 'templateFileSelected')}: ${file.path}`);
					this.display();
				})();
			}
		);
		modal.open();
	}

	private openTemplateEditorForBase(templateType: TemplateTypeOption): void {
		const config = this.settings[templateType.key];
		const initialContent = config.customContent || getBuiltInTemplateByKey(templateType.key, true);

		const modal = new TemplateEditorModal(
			this.app,
			initialContent,
			(newTemplate: string) => {
				void (async () => {
					config.customContent = newTemplate;
					await this.onSave();
				})();
			}
		);
		modal.open();
	}

	private openTemplateEditorForCategory(categoryOption: TemplateCategoryOption): void {
		const config = this.settings.templateConfigByCategory?.[categoryOption.key];
		const initialContent = config?.customContent || getBuiltInTemplateByKey(categoryOption.templateKey, true);

		const modal = new TemplateEditorModal(
			this.app,
			initialContent,
			(newTemplate: string) => {
				void (async () => {
					if (!this.settings.templateConfigByCategory) {
						this.settings.templateConfigByCategory = {};
					}
					this.settings.templateConfigByCategory[categoryOption.key] = {
						source: 'custom',
						customContent: newTemplate,
					};
					await this.onSave();
				})();
			}
		);
		modal.open();
	}

	private openTemplatePreviewForBase(templateType: TemplateTypeOption): void {
		void (async () => {
			const modal = new TemplateEditorModal(
				this.app,
				await this.getTemplateContent(templateType),
				() => { /* Preview mode, no save */ }
			);
			modal.open();
		})();
	}

	private openTemplatePreviewForCategory(categoryOption: TemplateCategoryOption): void {
		void (async () => {
			const modal = new TemplateEditorModal(
				this.app,
				await this.getTemplateContentForCategory(categoryOption),
				() => { /* Preview mode, no save */ }
			);
			modal.open();
		})();
	}

	private openNoteTemplateEditor(): void {
		const modal = new TemplateEditorModal(
			this.app,
			this.settings.noteTemplateContent,
			(template: string) => {
				void (async () => {
					this.settings.noteTemplateContent = template;
					await this.onSave();
				})();
			}
		);
		modal.open();
	}
}

/**
 * 文件选择建议模态框
 */
class FileSuggestModal extends FuzzySuggestModal<TFile> {
	private onSelect: (file: TFile) => void;

	constructor(app: App, onSelect: (file: TFile) => void) {
		super(app);
		this.onSelect = onSelect;
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.onSelect(file);
	}
}

/**
 * 模板编辑器模态框
 */
class TemplateEditorModal extends Modal {
	private template: string;
	private onSave: (template: string) => void;

	constructor(app: App, template: string, onSave: (template: string) => void) {
		super(app);
		this.template = template;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;

		new Setting(contentEl).setName(tn('templateEditor', 'editTemplate')).setHeading();

		const helpDiv = contentEl.createDiv({ cls: 'bangumi-template-help' });
		helpDiv.createEl('p', { text: tn('templateEditor', 'templateVarTip') });
		const vars = [
			'{{name}} - Original name', '{{name_cn}} - Chinese name', '{{alias}} - Alias',
			'{{rating}} - Rating', '{{rank}} - Rank', '{{summary}} - Summary',
			'{{cover}} - Cover', '{{date}} - Date', '{{year}} - Year', '{{month}} - Month',
			'{{my_rate}} - My rating', '{{my_comment}} - My comment', '{{my_status}} - Collection status',
			'{{my_tags}} - My tags', '{{tags}} - My tags',
		];
		vars.forEach(v => helpDiv.createEl('span', { text: v, cls: 'bangumi-var-tag' }));

		const textArea = new TextAreaComponent(contentEl);
		textArea
			.setValue(this.template)
			.setPlaceholder(tn('templateEditor', 'enterTemplate'));
		textArea.inputEl.addClass('bangumi-template-textarea');

		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

		const saveBtn = buttonDiv.createEl('button', { text: tn('templateEditor', 'save') });
		saveBtn.addEventListener('click', () => {
			this.onSave(textArea.getValue());
			this.close();
		});

		const cancelBtn = buttonDiv.createEl('button', { text: tn('templateEditor', 'cancel') });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// 兼容旧版本的类型别名
