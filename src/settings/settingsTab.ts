/**
 * 设置面板 UI
 */

import { App, PluginSettingTab, Setting, Notice, Modal, TextAreaComponent, TFile, FuzzySuggestModal, Plugin } from 'obsidian';
import { BangumiPluginSettings, TemplateConfig, TemplateSource } from './settings';
import { SubjectType, CollectionType, getSubjectTypeName, getCollectionTypeName } from '../../common/api/types';
import {
	ANIME_TEMPLATE,
	NOVEL_TEMPLATE,
	COMIC_TEMPLATE,
	GAME_TEMPLATE,
	ALBUM_TEMPLATE,
	MUSIC_TEMPLATE,
	REAL_TEMPLATE,
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
	name: string;
	defaultTemplate: string;
}

const TEMPLATE_TYPES: TemplateTypeOption[] = [
	{ key: 'animeTemplateConfig', name: '动画模板', defaultTemplate: ANIME_TEMPLATE },
	{ key: 'novelTemplateConfig', name: '小说模板', defaultTemplate: NOVEL_TEMPLATE },
	{ key: 'comicTemplateConfig', name: '漫画模板', defaultTemplate: COMIC_TEMPLATE },
	{ key: 'gameTemplateConfig', name: '游戏模板', defaultTemplate: GAME_TEMPLATE },
	{ key: 'albumTemplateConfig', name: '画集模板', defaultTemplate: ALBUM_TEMPLATE },
	{ key: 'musicTemplateConfig', name: '音乐模板', defaultTemplate: MUSIC_TEMPLATE },
	{ key: 'realTemplateConfig', name: '三次元模板', defaultTemplate: REAL_TEMPLATE },
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
		containerEl.createEl('h2', { text: 'Bangumi Sync 设置' });

		// ==================== 认证设置 ====================
		containerEl.createEl('h3', { text: '认证设置' });

		new Setting(containerEl)
			.setName('Access Token')
			.setDesc('在 https://next.bgm.tv/demo/access-token 生成 Access Token')
			.addText(text => text
				.setPlaceholder('输入 Access Token')
				.setValue(this.settings.accessToken)
				.onChange(async (value) => {
					this.settings.accessToken = value;
					await this.onSave();
				}));

		// ==================== 路径设置 ====================
		containerEl.createEl('h3', { text: '路径设置' });

		// 文件路径模板
		new Setting(containerEl)
			.setName('文件路径模板')
			.setDesc('支持变量: {{type}}, {{category}}, {{name}}, {{name_cn}}, {{year}}, {{author}}, {{id}}');

		const pathTemplateDiv = containerEl.createDiv({ cls: 'bangumi-path-template-setting' });
		new Setting(pathTemplateDiv)
			.addText(text => {
				text.setPlaceholder('ACGN/{{type}}/{{name_cn}}.md')
					.setValue(this.settings.syncPathTemplate)
					.onChange(async (value) => {
						this.settings.syncPathTemplate = value;
						await this.onSave();
						this.updatePathPreview(previewEl, value);
					});
				text.inputEl.style.width = '100%';
			});

		// 路径预览
		const previewEl = containerEl.createDiv({ cls: 'bangumi-path-preview' });
		this.updatePathPreview(previewEl, this.settings.syncPathTemplate);

		// 扫描文件夹路径
		new Setting(containerEl)
			.setName('扫描文件夹路径')
			.setDesc('用于检测已同步条目的文件夹路径（留空则使用文件路径模板的基础路径）')
			.addText(text => text
				.setPlaceholder('ACGN')
				.setValue(this.settings.scanFolderPath)
				.onChange(async (value) => {
					this.settings.scanFolderPath = value;
					await this.onSave();
				}));

		// 图片设置
		new Setting(containerEl)
			.setName('下载封面图片')
			.setDesc('是否下载条目封面到本地')
			.addToggle(toggle => toggle
				.setValue(this.settings.downloadImages)
				.onChange(async (value) => {
					this.settings.downloadImages = value;
					await this.onSave();
				}));

		// 图片质量选择
		new Setting(containerEl)
			.setName('图片质量')
			.setDesc('选择下载的图片质量')
			.addDropdown(dropdown => dropdown
				.addOption('small', '小 (small)')
				.addOption('medium', '中 (medium)')
				.addOption('large', '大 (large)')
				.setValue(this.settings.imageQuality || 'large')
				.onChange(async (value: 'small' | 'medium' | 'large') => {
					this.settings.imageQuality = value;
					await this.onSave();
				}));

		// 更新已存在的图片
		new Setting(containerEl)
			.setName('更新已存在的图片')
			.setDesc('同步时是否更新已存在的封面图片')
			.addToggle(toggle => toggle
				.setValue(this.settings.imageUpdateExisting || false)
				.onChange(async (value) => {
					this.settings.imageUpdateExisting = value;
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName('图片路径模板')
			.setDesc('支持变量: {{id}}, {{name_cn}}, {{name}}, {{typeLabel}} (如: ACGN/assets/{{name_cn}}_{{typeLabel}}.jpg)')
			.addText(text => text
				.setPlaceholder('ACGN/assets/{{name_cn}}_{{typeLabel}}.jpg')
				.setValue(this.settings.imagePathTemplate)
				.onChange(async (value) => {
					this.settings.imagePathTemplate = value;
					await this.onSave();
				}));

		// ==================== 模板设置 ====================
		containerEl.createEl('h3', { text: '模板设置' });

		// 模板变量帮助
		const helpDiv = containerEl.createDiv({ cls: 'bangumi-template-help' });
		helpDiv.createEl('p', { text: '模板变量提示：{{tags}} 使用用户自己的标签，如果没有则留空' });
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
		containerEl.createEl('h3', { text: '同步选项' });

		// 条目类型选择
		new Setting(containerEl)
			.setName('同步的条目类型')
			.setDesc('选择要同步的条目类型');

		const subjectTypesDiv = containerEl.createDiv({ cls: 'bangumi-checkbox-group' });
		const subjectTypes = [SubjectType.Anime, SubjectType.Game, SubjectType.Book, SubjectType.Music, SubjectType.Real];
		subjectTypes.forEach(type => {
			const label = subjectTypesDiv.createEl('label', { cls: 'bangumi-checkbox-label' });
			const checkbox = label.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
			checkbox.checked = this.settings.defaultSubjectTypes.includes(type);
			checkbox.addEventListener('change', async () => {
				if (checkbox.checked) {
					if (!this.settings.defaultSubjectTypes.includes(type)) {
						this.settings.defaultSubjectTypes.push(type);
					}
				} else {
					this.settings.defaultSubjectTypes = this.settings.defaultSubjectTypes.filter(t => t !== type);
				}
				await this.onSave();
			});
			label.createSpan({ text: getSubjectTypeName(type) });
		});

		// 收藏类型选择
		new Setting(containerEl)
			.setName('同步的收藏类型')
			.setDesc('选择要同步的收藏状态');

		const collectionTypesDiv = containerEl.createDiv({ cls: 'bangumi-checkbox-group' });
		const collectionTypes = [CollectionType.Wish, CollectionType.Doing, CollectionType.Done, CollectionType.OnHold, CollectionType.Dropped];
		collectionTypes.forEach(type => {
			const label = collectionTypesDiv.createEl('label', { cls: 'bangumi-checkbox-label' });
			const checkbox = label.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
			checkbox.checked = this.settings.defaultCollectionTypes.includes(type);
			checkbox.addEventListener('change', async () => {
				if (checkbox.checked) {
					if (!this.settings.defaultCollectionTypes.includes(type)) {
						this.settings.defaultCollectionTypes.push(type);
					}
				} else {
					this.settings.defaultCollectionTypes = this.settings.defaultCollectionTypes.filter(t => t !== type);
				}
				await this.onSave();
			});
			label.createSpan({ text: getCollectionTypeName(type) });
		});

		new Setting(containerEl)
			.setName('同步数量限制')
			.setDesc('每次同步的最大条目数量（0 表示不限制，会智能处理：如果未同步数量不够，同步所有未同步的）')
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
		containerEl.createEl('h3', { text: '自动同步' });

		new Setting(containerEl)
			.setName('启用自动同步')
			.setDesc('定期自动同步 Bangumi 收藏')
			.addToggle(toggle => toggle
				.setValue(this.settings.autoSync)
				.onChange(async (value) => {
					this.settings.autoSync = value;
					await this.onSave();
				}));

		new Setting(containerEl)
			.setName('同步间隔（分钟）')
			.setDesc('自动同步的时间间隔')
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

		// ==================== 同步状态 ====================
		containerEl.createEl('h3', { text: '同步状态' });

		const statusText = this.settings.lastSyncTime
			? `上次同步: ${new Date(this.settings.lastSyncTime).toLocaleString()} (共 ${this.settings.lastSyncCount} 条)`
			: '尚未同步';

		new Setting(containerEl)
			.setName('同步状态')
			.setDesc(statusText);
	}

	/**
	 * 更新路径预览
	 */
	private updatePathPreview(el: HTMLElement, template: string): void {
		el.empty();
		el.createEl('span', { text: '预览: ', cls: 'bangumi-preview-label' });

		let preview = template
			.replace(/\{\{type\}\}/g, 'anime')
			.replace(/\{\{category\}\}/g, 'TV')
			.replace(/\{\{name\}\}/g, '进撃の巨人')
			.replace(/\{\{name_cn\}\}/g, '进击的巨人')
			.replace(/\{\{year\}\}/g, '2013')
			.replace(/\{\{author\}\}/g, '谏山创')
			.replace(/\{\{id\}\}/g, '10060');

		el.createEl('code', { text: preview });
	}

	/**
	 * 添加模板文件选择设置
	 */
	private addTemplateFileSetting(containerEl: HTMLElement, templateType: TemplateTypeOption): void {
		const config = this.settings[templateType.key] as TemplateConfig;

		new Setting(containerEl)
			.setName(templateType.name)
			.setDesc(this.getTemplateSourceDesc(config))
			.addDropdown(dropdown => {
				dropdown
					.addOption('default', '默认模板')
					.addOption('file', '从文件选择')
					.addOption('custom', '自定义内容')
					.setValue(config.source)
					.onChange(async (value: TemplateSource) => {
						const newConfig: TemplateConfig = { source: value };
						if (value === 'file' && config.filePath) {
							newConfig.filePath = config.filePath;
						} else if (value === 'custom' && config.customContent) {
							newConfig.customContent = config.customContent;
						}
						(this.settings[templateType.key] as TemplateConfig) = newConfig;
						await this.onSave();
						this.display();
					});
			})
			.addButton(button => {
				if (config.source === 'file') {
					button
						.setButtonText(config.filePath || '选择文件')
						.onClick(() => {
							this.openFileSuggest(templateType);
						});
				} else if (config.source === 'custom') {
					button
						.setButtonText('编辑')
						.onClick(() => {
							this.openTemplateEditor(templateType);
						});
				} else {
					button
						.setButtonText('预览')
						.onClick(() => {
							this.openTemplatePreview(templateType);
						});
				}
			});
	}

	/**
	 * 获取模板来源描述
	 */
	private getTemplateSourceDesc(config: TemplateConfig): string {
		switch (config.source) {
			case 'default':
				return '使用插件内置的默认模板';
			case 'file':
				return config.filePath ? `使用文件: ${config.filePath}` : '请选择模板文件';
			case 'custom':
				return '使用自定义编辑的模板内容';
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
			async (file: TFile) => {
				const config = this.settings[templateType.key] as TemplateConfig;
				config.filePath = file.path;
				await this.onSave();
				new Notice(`已选择模板文件: ${file.path}`);
				this.display();
			}
		);
		modal.open();
	}

	/**
	 * 打开模板编辑器
	 */
	private openTemplateEditor(templateType: TemplateTypeOption): void {
		const config = this.settings[templateType.key] as TemplateConfig;
		const initialContent = config.customContent || templateType.defaultTemplate;

		const modal = new TemplateEditorModal(
			this.app,
			initialContent,
			async (newTemplate: string) => {
				config.customContent = newTemplate;
				await this.onSave();
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
			async () => {
				// 预览模式不保存
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

		contentEl.createEl('h2', { text: '编辑模板' });

		// 模板变量说明
		const helpDiv = contentEl.createDiv({ cls: 'bangumi-template-help' });
		helpDiv.createEl('p', { text: '模板变量提示：{{tags}} 使用用户自己的标签，如果没有则留空' });
		const vars = [
			'{{name}} - 原名', '{{name_cn}} - 中文名', '{{alias}} - 别名',
			'{{rating}} - 评分', '{{rank}} - 排名', '{{summary}} - 简介',
			'{{cover}} - 封面', '{{date}} - 日期', '{{year}} - 年份', '{{month}} - 月份',
			'{{my_rate}} - 我的评分', '{{my_comment}} - 我的短评', '{{my_status}} - 收藏状态',
			'{{my_tags}} - 我的标签', '{{tags}} - 我的标签',
		];
		vars.forEach(v => helpDiv.createEl('span', { text: v, cls: 'bangumi-var-tag' }));

		// 文本区域
		const textArea = new TextAreaComponent(contentEl);
		textArea
			.setValue(this.template)
			.setPlaceholder('输入模板内容...');
		textArea.inputEl.style.height = '400px';
		textArea.inputEl.style.width = '100%';
		textArea.inputEl.style.fontFamily = 'monospace';

		// 按钮
		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

		const saveBtn = buttonDiv.createEl('button', { text: '保存' });
		saveBtn.addEventListener('click', () => {
			this.onSave(textArea.getValue());
			this.close();
		});

		const cancelBtn = buttonDiv.createEl('button', { text: '取消' });
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
