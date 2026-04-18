/**
 * 设置面板 UI
 */

import { App, PluginSettingTab, Setting, Notice, Modal, TextAreaComponent, TFile, FuzzySuggestModal } from 'obsidian';
import { BangumiPlugin } from '../../main';
import { SubjectType, CollectionType, getSubjectTypeName, getCollectionTypeName } from '../../../common/api/types';
import { TemplateConfig, TemplateSource } from './settings';
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

export class BangumiSettingTab extends PluginSettingTab {
	plugin: BangumiPlugin;

	constructor(app: App, plugin: BangumiPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
				.setValue(this.plugin.settings.accessToken)
				.onChange(async (value) => {
					this.plugin.settings.accessToken = value;
					await this.plugin.saveSettings();
					await this.plugin.updateClient();
				}));

		// ==================== 路径设置 ====================
		containerEl.createEl('h3', { text: '路径设置' });

		// 文件路径模板（带变量说明和预览）
		new Setting(containerEl)
			.setName('文件路径模板')
			.setDesc('支持变量: {{type}}, {{category}}, {{name}}, {{name_cn}}, {{year}}, {{author}}, {{id}}');

		const pathTemplateDiv = containerEl.createDiv({ cls: 'bangumi-path-template-setting' });
		new Setting(pathTemplateDiv)
			.addText(text => {
				text.setPlaceholder('ACGN/{{type}}/{{name_cn}}.md')
					.setValue(this.plugin.settings.syncPathTemplate)
					.onChange(async (value) => {
						this.plugin.settings.syncPathTemplate = value;
						await this.plugin.saveSettings();
						// 更新预览
						this.updatePathPreview(previewEl, value);
					});
				text.inputEl.style.width = '100%';
			});

		// 路径预览
		const previewEl = containerEl.createDiv({ cls: 'bangumi-path-preview' });
		this.updatePathPreview(previewEl, this.plugin.settings.syncPathTemplate);

		// 图片设置
		new Setting(containerEl)
			.setName('下载封面图片')
			.setDesc('是否下载条目封面到本地')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.downloadImages)
				.onChange(async (value) => {
					this.plugin.settings.downloadImages = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('图片路径模板')
			.setDesc('支持变量: {{id}}')
			.addText(text => text
				.setPlaceholder('ACGN/assets/{{id}}_cover.jpg')
				.setValue(this.plugin.settings.imagePathTemplate)
				.onChange(async (value) => {
					this.plugin.settings.imagePathTemplate = value;
					await this.plugin.saveSettings();
				}));

		// ==================== 模板设置 ====================
		containerEl.createEl('h3', { text: '模板设置' });

		// 模板变量帮助
		const helpDiv = containerEl.createDiv({ cls: 'bangumi-template-help' });
		helpDiv.createEl('p', { text: '支持的模板变量:' });
		const vars = [
			'{{name}}', '{{name_cn}}', '{{alias}}',
			'{{rating}}', '{{rank}}', '{{summary}}',
			'{{cover}}', '{{date}}', '{{year}}', '{{month}}',
			'{{my_rate}}', '{{my_comment}}', '{{my_status}}',
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
			checkbox.checked = this.plugin.settings.defaultSubjectTypes.includes(type);
			checkbox.addEventListener('change', async () => {
				if (checkbox.checked) {
					if (!this.plugin.settings.defaultSubjectTypes.includes(type)) {
						this.plugin.settings.defaultSubjectTypes.push(type);
					}
				} else {
					this.plugin.settings.defaultSubjectTypes = this.plugin.settings.defaultSubjectTypes.filter(t => t !== type);
				}
				await this.plugin.saveSettings();
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
			checkbox.checked = this.plugin.settings.defaultCollectionTypes.includes(type);
			checkbox.addEventListener('change', async () => {
				if (checkbox.checked) {
					if (!this.plugin.settings.defaultCollectionTypes.includes(type)) {
						this.plugin.settings.defaultCollectionTypes.push(type);
					}
				} else {
					this.plugin.settings.defaultCollectionTypes = this.plugin.settings.defaultCollectionTypes.filter(t => t !== type);
				}
				await this.plugin.saveSettings();
			});
			label.createSpan({ text: getCollectionTypeName(type) });
		});

		new Setting(containerEl)
			.setName('同步数量限制')
			.setDesc('每次同步的最大条目数量（0 表示不限制）')
			.addText(text => text
				.setPlaceholder('50')
				.setValue(String(this.plugin.settings.syncLimit))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						this.plugin.settings.syncLimit = num;
						await this.plugin.saveSettings();
					}
				}));

		// ==================== 自动同步 ====================
		containerEl.createEl('h3', { text: '自动同步' });

		new Setting(containerEl)
			.setName('启用自动同步')
			.setDesc('定期自动同步 Bangumi 收藏')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoSync)
				.onChange(async (value) => {
					this.plugin.settings.autoSync = value;
					await this.plugin.saveSettings();
					this.plugin.setupAutoSync();
				}));

		new Setting(containerEl)
			.setName('同步间隔（分钟）')
			.setDesc('自动同步的时间间隔')
			.addText(text => text
				.setPlaceholder('60')
				.setValue(String(this.plugin.settings.autoSyncInterval))
				.onChange(async (value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num > 0) {
						this.plugin.settings.autoSyncInterval = num;
						await this.plugin.saveSettings();
						if (this.plugin.settings.autoSync) {
							this.plugin.setupAutoSync();
						}
					}
				}));

		// ==================== 同步状态 ====================
		containerEl.createEl('h3', { text: '同步状态' });

		const statusText = this.plugin.settings.lastSyncTime
			? `上次同步: ${new Date(this.plugin.settings.lastSyncTime).toLocaleString()} (共 ${this.plugin.settings.lastSyncCount} 条)`
			: '尚未同步';

		new Setting(containerEl)
			.setName('同步状态')
			.setDesc(statusText)
			.addButton(button => button
				.setButtonText('重置同步状态')
				.setWarning()
				.onClick(async () => {
					this.plugin.settings.lastSyncTime = null;
					this.plugin.settings.lastSyncCount = 0;
					this.plugin.settings.syncedIds = [];
					await this.plugin.saveSettings();
					new Notice('同步状态已重置');
					this.display();
				}));

		// ==================== 操作按钮 ====================
		containerEl.createEl('h3', { text: '操作' });

		new Setting(containerEl)
			.setName('立即同步')
			.setDesc('手动触发一次同步')
			.addButton(button => button
				.setButtonText('开始同步')
				.setCta()
				.onClick(() => {
					this.plugin.syncCollections();
				}));
	}

	/**
	 * 更新路径预览
	 */
	private updatePathPreview(el: HTMLElement, template: string): void {
		el.empty();
		el.createEl('span', { text: '预览: ', cls: 'bangumi-preview-label' });

		// 模拟替换变量
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
		const config = this.plugin.settings[templateType.key] as TemplateConfig;

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
						(this.plugin.settings[templateType.key] as TemplateConfig) = newConfig;
						await this.plugin.saveSettings();
						this.display(); // 刷新显示
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
				const config = this.plugin.settings[templateType.key] as TemplateConfig;
				config.filePath = file.path;
				await this.plugin.saveSettings();
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
		const config = this.plugin.settings[templateType.key] as TemplateConfig;
		const initialContent = config.customContent || templateType.defaultTemplate;

		const modal = new TemplateEditorModal(
			this.app,
			initialContent,
			async (newTemplate: string) => {
				config.customContent = newTemplate;
				await this.plugin.saveSettings();
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
		helpDiv.createEl('p', { text: '支持的模板变量:' });
		const vars = [
			'{{name}} - 原名', '{{name_cn}} - 中文名', '{{alias}} - 别名',
			'{{rating}} - 评分', '{{rank}} - 排名', '{{summary}} - 简介',
			'{{cover}} - 封面', '{{date}} - 日期', '{{year}} - 年份', '{{month}} - 月份',
			'{{my_rate}} - 我的评分', '{{my_comment}} - 我的短评', '{{my_status}} - 收藏状态',
			'{{character1-9}} - 角色', '{{characterCV1-9}} - CV', '{{characterPhoto1-9}} - 角色图片',
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
