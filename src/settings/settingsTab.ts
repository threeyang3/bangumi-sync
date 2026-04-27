/**
 * 设置面板 UI
 */

import { App, PluginSettingTab, Setting, Notice, Modal, TextAreaComponent, TFile, FuzzySuggestModal, Plugin } from 'obsidian';
import { BangumiPluginSettings, TemplateConfig, TemplateSource, CoverLinkType } from './settings';
import { SubjectType, CollectionType, getSubjectTypeName, getCollectionTypeName } from '../../common/api/types';
import { tn, t } from '../i18n';
import {
	ANIME_TEMPLATE,
	NOVEL_TEMPLATE,
	COMIC_TEMPLATE,
	GAME_TEMPLATE,
	ALBUM_TEMPLATE,
	MUSIC_TEMPLATE,
	REAL_TEMPLATE,
	ANIME_TEMPLATE_STANDARD,
	NOVEL_TEMPLATE_STANDARD,
	COMIC_TEMPLATE_STANDARD,
	GAME_TEMPLATE_STANDARD,
	ALBUM_TEMPLATE_STANDARD,
	MUSIC_TEMPLATE_STANDARD,
	REAL_TEMPLATE_STANDARD,
} from '../../common/template/defaultTemplates';

/**
 * 模板类型键名
 */
type TemplateKey = 'animeTemplateConfig' | 'novelTemplateConfig' | 'comicTemplateConfig' | 'gameTemplateConfig' | 'albumTemplateConfig' | 'musicTemplateConfig' | 'realTemplateConfig';

/**
 * 模板类型配置
 */
interface TemplateTypeOption {
	key: TemplateKey;
	nameKey: keyof import('../i18n/translations').TranslationStrings['settings'];
	defaultTemplate: string;
}

const TEMPLATE_TYPES: TemplateTypeOption[] = [
	{ key: 'animeTemplateConfig', nameKey: 'animeTemplate', defaultTemplate: ANIME_TEMPLATE },
	{ key: 'novelTemplateConfig', nameKey: 'novelTemplate', defaultTemplate: NOVEL_TEMPLATE },
	{ key: 'comicTemplateConfig', nameKey: 'comicTemplate', defaultTemplate: COMIC_TEMPLATE },
	{ key: 'gameTemplateConfig', nameKey: 'gameTemplate', defaultTemplate: GAME_TEMPLATE },
	{ key: 'albumTemplateConfig', nameKey: 'albumTemplate', defaultTemplate: ALBUM_TEMPLATE },
	{ key: 'musicTemplateConfig', nameKey: 'musicTemplate', defaultTemplate: MUSIC_TEMPLATE },
	{ key: 'realTemplateConfig', nameKey: 'realTemplate', defaultTemplate: REAL_TEMPLATE },
];

/**
 * 设置面板
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

		// 标题
		new Setting(containerEl).setName(tn('settings', 'heading')).setHeading();

		// ==================== 认证设置 ====================
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

		// ==================== 路径设置 ====================
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

		// 图片设置
		new Setting(containerEl)
			.setName(tn('settings', 'downloadCoverImages'))
			.setDesc(tn('settings', 'downloadCoverImagesDesc'))
			.addToggle(toggle => toggle
				.setValue(this.settings.downloadImages)
				.onChange(async (value) => {
					this.settings.downloadImages = value;
					await this.onSave();
				}));

		// 图片质量选择
		const imageQuality = t('settings');
		new Setting(containerEl)
			.setName(tn('settings', 'imageQuality'))
			.setDesc(tn('settings', 'imageQualityDesc'))
			.addDropdown(dropdown => dropdown
				.addOption('small', imageQuality.imageQualitySmall)
				.addOption('medium', imageQuality.imageQualityMedium)
				.addOption('large', imageQuality.imageQualityLarge)
				.setValue(this.settings.imageQuality || 'large')
				.onChange(async (value: 'small' | 'medium' | 'large') => {
					this.settings.imageQuality = value;
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
				.onChange(async (value: CoverLinkType) => {
					this.settings.coverLinkType = value;
					await this.onSave();
				}));

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

		new Setting(containerEl)
			.setName(tn('settings', 'notePathTemplate'))
			.setDesc(tn('settings', 'notePathTemplateDesc'))
			.addText(text => text
				.setPlaceholder('Inbox/notes/acgn')
				.setValue(this.settings.notePathTemplate)
				.onChange(async (value) => {
					this.settings.notePathTemplate = value;
					await this.onSave();
				}));

		// ==================== 模板设置 ====================
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

		// ==================== 同步选项 ====================
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

		new Setting(containerEl)
			.setName(tn('settings', 'syncLimit'))
			.setDesc(tn('settings', 'syncLimitDesc'))
			.addText(text => text
				.setPlaceholder('50')
				.setValue(String(this.settings.syncLimit))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						this.settings.syncLimit = num;
						await this.onSave();
					}
				}));

		// ==================== 自动同步 ====================
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


			// ==================== 相关条目链接 ====================
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

			// ==================== 数据保护设置 ====================
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
		// ==================== 同步状态 ====================
		new Setting(containerEl).setName(tn('settings', 'syncStatus')).setHeading();

		const lastSyncText = this.settings.lastSyncTime
			? `${tn('settings', 'lastSync')}: ${new Date(this.settings.lastSyncTime).toLocaleString()} (${this.settings.lastSyncCount} items)`
			: tn('settings', 'notSyncedYet');

		new Setting(containerEl)
			.setName(tn('settings', 'syncStatus'))
			.setDesc(lastSyncText);

		// ==================== 默认属性值 ====================
		new Setting(containerEl).setName(tn('settings', 'defaultPropertyValues')).setHeading();
		containerEl.createEl('p', { text: tn('settings', 'defaultPropertyValuesDesc'), cls: 'bangumi-setting-desc' });

		// 动画默认值
		new Setting(containerEl).setName(tn('settings', 'anime')).setHeading();
		new Setting(containerEl)
			.setName(tn('settings', 'storage'))
			.addText(text => text
				.setPlaceholder('Local')
				.setValue(this.settings.defaultPropertyValues.anime_storage || '')
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.anime_storage = value || undefined;
					await this.onSave();
				}));
		new Setting(containerEl)
			.setName(tn('settings', 'resourceAttr'))
			.addText(text => text
				.setPlaceholder('1080p')
				.setValue(this.settings.defaultPropertyValues.anime_resourceAttr || '')
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.anime_resourceAttr = value || undefined;
					await this.onSave();
				}));
		new Setting(containerEl)
			.setName(tn('settings', 'slogan'))
			.addText(text => text
				.setValue(this.settings.defaultPropertyValues.anime_slogan || '')
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.anime_slogan = value || undefined;
					await this.onSave();
				}));

		// 小说默认值
		new Setting(containerEl).setName(tn('settings', 'novel')).setHeading();
		new Setting(containerEl)
			.setName(tn('settings', 'version'))
			.addText(text => text
				.setValue(this.settings.defaultPropertyValues.novel_version || '')
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.novel_version = value || undefined;
					await this.onSave();
				}));
		new Setting(containerEl)
			.setName(tn('settings', 'kindle'))
			.addToggle(toggle => toggle
				.setValue(this.settings.defaultPropertyValues.novel_kindle || false)
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.novel_kindle = value;
					await this.onSave();
				}));
		new Setting(containerEl)
			.setName(tn('settings', 'saved'))
			.addToggle(toggle => toggle
				.setValue(this.settings.defaultPropertyValues.novel_saved || false)
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.novel_saved = value;
					await this.onSave();
				}));

		// 漫画默认值
		new Setting(containerEl).setName(tn('settings', 'comic')).setHeading();
		new Setting(containerEl)
			.setName(tn('settings', 'version'))
			.addText(text => text
				.setValue(this.settings.defaultPropertyValues.comic_version || '')
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.comic_version = value || undefined;
					await this.onSave();
				}));
		new Setting(containerEl)
			.setName(tn('settings', 'format'))
			.addText(text => text
				.setValue(this.settings.defaultPropertyValues.comic_format || '')
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.comic_format = value || undefined;
					await this.onSave();
				}));

		// 游戏默认值
		new Setting(containerEl).setName(tn('settings', 'game')).setHeading();
		new Setting(containerEl)
			.setName(tn('settings', 'platform'))
			.addText(text => text
				.setPlaceholder('Steam')
				.setValue(this.settings.defaultPropertyValues.game_platform || '')
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.game_platform = value || undefined;
					await this.onSave();
				}));
		new Setting(containerEl)
			.setName(tn('settings', 'storage'))
			.addText(text => text
				.setValue(this.settings.defaultPropertyValues.game_storage || '')
				.onChange(async (value) => {
					this.settings.defaultPropertyValues.game_storage = value || undefined;
					await this.onSave();
				}));
	}

	/**
	 * 更新路径预览
	 */
	private updatePathPreview(el: HTMLElement, template: string): void {
		el.empty();
		el.createEl('span', { text: `${tn('settings', 'preview')}: `, cls: 'bangumi-preview-label' });

		let preview = template
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
					.onChange(async (value: TemplateSource) => {
						const newConfig: TemplateConfig = { source: value };
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
							this.openFileSuggest(templateType);
						});
				} else if (config.source === 'custom') {
					button
						.setButtonText(tn('settings', 'edit'))
						.onClick(() => {
							this.openTemplateEditor(templateType);
						});
				} else {
					button
						.setButtonText(tn('settings', 'preview'))
						.onClick(() => {
							this.openTemplatePreview(templateType);
						});
				}
			})
			.addButton(button => {
				button
					.setButtonText(tn('settings', 'copy'))
					.setTooltip(tn('settings', 'copyTooltip'))
					.onClick(() => {
						void this.copyCurrentTemplate(templateType);
					});
			});
	}

	/**
	 * 复制当前模板到自定义内容
	 */
	private async copyCurrentTemplate(templateType: TemplateTypeOption): Promise<void> {
		const config = this.settings[templateType.key];
		let templateContent: string;

		// 根据当前配置获取模板内容
		switch (config.source) {
			case 'standard':
				templateContent = this.getStandardTemplate(templateType.key);
				break;
			case 'author':
				templateContent = templateType.defaultTemplate;
				break;
			case 'file':
				if (config.filePath) {
					try {
						const file = this.app.vault.getAbstractFileByPath(config.filePath);
						if (file instanceof TFile) {
							templateContent = await this.app.vault.read(file);
						} else {
							new Notice(tn('notices', 'templateFileNotFound'));
							return;
						}
					} catch {
						new Notice(tn('notices', 'readTemplateFailed'));
						return;
					}
				} else {
					new Notice(tn('notices', 'selectTemplateFirst'));
					return;
				}
				break;
			case 'custom':
				templateContent = config.customContent || templateType.defaultTemplate;
				break;
			default:
				templateContent = templateType.defaultTemplate;
		}

		// 设置为自定义内容并保存
		const newConfig: TemplateConfig = {
			source: 'custom',
			customContent: templateContent,
		};
		this.settings[templateType.key] = newConfig;
		await this.onSave();

		new Notice(tn('notices', 'copiedToCustom'));
		this.display();
	}

	/**
	 * 获取标准模板内容
	 */
	private getStandardTemplate(key: TemplateKey): string {
		const standardTemplates: Record<TemplateKey, string> = {
			animeTemplateConfig: ANIME_TEMPLATE_STANDARD,
			novelTemplateConfig: NOVEL_TEMPLATE_STANDARD,
			comicTemplateConfig: COMIC_TEMPLATE_STANDARD,
			gameTemplateConfig: GAME_TEMPLATE_STANDARD,
			albumTemplateConfig: ALBUM_TEMPLATE_STANDARD,
			musicTemplateConfig: MUSIC_TEMPLATE_STANDARD,
			realTemplateConfig: REAL_TEMPLATE_STANDARD,
		};
		return standardTemplates[key];
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

	/**
	 * 打开文件选择建议
	 */
	private openFileSuggest(templateType: TemplateTypeOption): void {
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

	/**
	 * 打开模板编辑器
	 */
	private openTemplateEditor(templateType: TemplateTypeOption): void {
		const config = this.settings[templateType.key];
		const initialContent = config.customContent || templateType.defaultTemplate;

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

	/**
	 * 打开模板预览
	 */
	private openTemplatePreview(templateType: TemplateTypeOption): void {
		const modal = new TemplateEditorModal(
			this.app,
			templateType.defaultTemplate,
			() => {
				// Preview mode, no save
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

		// 模板变量说明
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

		// 文本区域
		const textArea = new TextAreaComponent(contentEl);
		textArea
			.setValue(this.template)
			.setPlaceholder(tn('templateEditor', 'enterTemplate'));
		textArea.inputEl.addClass('bangumi-template-textarea');

		// 按钮
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
export const BangumiSettingTabV3 = BangumiSettingTab;
