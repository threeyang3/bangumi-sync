/**
 * 添加到收藏弹窗
 * 让用户填写评分、状态、标签等信息
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import { Subject, UserCollection } from '../../common/api/types';
import { BangumiClient } from '../api/client';
import { BangumiPluginSettings } from '../settings/settings';
import { SyncManager } from '../sync/syncManager';
import { tn } from '../i18n';
import { getTemplatePropertyGroupsForSubject, TemplatePropertyDefinition } from '../template/templateProperties';

/**
 * 添加到收藏的输入数据
 */
export interface AddToCollectionInput {
	subjectId: number;
	subjectName: string;
	type: number;           // 收藏状态 (1=想看, 2=看过, 3=在看, 4=搁置, 5=抛弃)
	rate: number;           // 评分 (0-10)
	comment: string;        // 短评
	tags: string[];         // 标签
	private: boolean;       // 是否私密
	localPropertyValues: Record<string, string | boolean | string[]>;
	syncToCloud: boolean;   // 是否同步到云端
	createLocal: boolean;   // 是否创建本地文件
}

/**
 * 收藏状态选项
 */
const COLLECTION_TYPE_OPTIONS: { value: number; labelKey: 'wish' | 'done' | 'doing' | 'onHold' | 'dropped' }[] = [
	{ value: 1, labelKey: 'wish' },
	{ value: 2, labelKey: 'done' },
	{ value: 3, labelKey: 'doing' },
	{ value: 4, labelKey: 'onHold' },
	{ value: 5, labelKey: 'dropped' },
];

/**
 * 添加到收藏弹窗
 */
export class AddToCollectionModal extends Modal {
	private client: BangumiClient;
	private settings: BangumiPluginSettings;
	private syncManager: SyncManager;
	private subject: Subject;
	private onComplete: (input: AddToCollectionInput) => void;
	private existingCollection?: UserCollection | null;

	// 输入状态
	private collectionType: number = 3;  // 默认"在看"
	private rate: number = 0;
	private comment: string = '';
	private tags: string[] = [];
	private isPrivate: boolean = false;
	private localPropertyValues: Record<string, string | boolean | string[]> = {};
	private syncToCloud: boolean = true;
	private createLocal: boolean = true;
	private customFields: TemplatePropertyDefinition[] = [];

	// UI 元素
	private tagsContainer!: HTMLElement;
	private tagInputEl!: HTMLInputElement;

	constructor(
		app: App,
		client: BangumiClient,
		settings: BangumiPluginSettings,
		syncManager: SyncManager,
		subject: Subject,
		onComplete: (input: AddToCollectionInput) => void,
		existingCollection?: UserCollection | null
	) {
		super(app);
		this.client = client;
		this.settings = settings;
		this.syncManager = syncManager;
		this.subject = subject;
		this.onComplete = onComplete;
		this.existingCollection = existingCollection;
		this.customFields = getTemplatePropertyGroupsForSubject(subject, this.syncManager.getCustomTemplates()).customProperties;
		this.initializeDefaultLocalPropertyValues();

		// 如果有现有收藏数据，预填充
		if (existingCollection) {
			this.collectionType = existingCollection.type || 3;
			this.rate = existingCollection.rate || 0;
			this.comment = existingCollection.comment || '';
			this.tags = existingCollection.tags || [];
			this.isPrivate = existingCollection.private || false;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('bangumi-add-collection-modal');

		// 标题
		const title = `${tn('addToCollection', 'title')} - ${this.subject.name_cn || this.subject.name}`;
		new Setting(contentEl).setName(title).setHeading();

		contentEl.createEl('h3', { text: 'Bangumi 属性', cls: 'bangumi-add-collection-section' });

		// 收藏状态
		const typeDiv = contentEl.createDiv({ cls: 'bangumi-add-collection-type' });
		typeDiv.createSpan({ text: `${tn('addToCollection', 'collectionType')}: ` });

		COLLECTION_TYPE_OPTIONS.forEach(opt => {
			const btn = typeDiv.createEl('button', {
				text: tn('collectionTypes', opt.labelKey),
				cls: 'bangumi-add-collection-type-btn',
			});
			if (opt.value === this.collectionType) {
				btn.addClass('bangumi-add-collection-type-btn-active');
			}
			btn.addEventListener('click', () => {
				this.collectionType = opt.value;
				// 更新按钮状态
				typeDiv.querySelectorAll('button').forEach(b => b.removeClass('bangumi-add-collection-type-btn-active'));
				btn.addClass('bangumi-add-collection-type-btn-active');
			});
		});

		// 评分滑块
		const rateSetting = new Setting(contentEl)
			.setName(tn('addToCollection', 'rating'))
			.addSlider(slider => {
				slider
					.setLimits(0, 10, 1)
					.setValue(this.rate)
					.onChange(value => {
						this.rate = value;
						rateValueEl.setText(String(value));
					});
			});
		const rateValueEl = rateSetting.controlEl.createSpan({ cls: 'bangumi-add-collection-rate-value', text: '0' });

		// 标签输入
		const tagsSetting = new Setting(contentEl)
			.setName(tn('addToCollection', 'tags'))
			.addText(text => {
				text.setPlaceholder(tn('addToCollection', 'tagsPlaceholder'));
				this.tagInputEl = text.inputEl;
				text.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') {
						const tag = text.inputEl.value.trim();
						if (tag && !this.tags.includes(tag)) {
							this.tags.push(tag);
							this.renderTags();
							text.inputEl.value = '';
						}
					}
				});
			});

		this.tagsContainer = tagsSetting.controlEl.createDiv({ cls: 'bangumi-add-collection-tags' });

		// 渲染已有标签
		if (this.tags.length > 0) {
			this.renderTags();
		}

		// 短评输入
		new Setting(contentEl)
			.setName(tn('addToCollection', 'comment'))
			.addTextArea(text => {
				text.setPlaceholder(tn('addToCollection', 'commentPlaceholder'));
				text.setValue(this.comment);
				text.onChange(value => {
					this.comment = value;
				});
				text.inputEl.rows = 3;
			});

		if (this.customFields.length > 0) {
			contentEl.createEl('h3', { text: tn('controlPanel', 'localPropertyTitle'), cls: 'bangumi-add-collection-section' });
			const gridEl = contentEl.createDiv({ cls: 'bangumi-local-property-grid' });
			this.customFields.forEach(field => {
				this.renderCustomField(gridEl, field);
			});
		}

		// 同步选项
		contentEl.createEl('h3', { text: tn('addToCollection', 'syncOptions'), cls: 'bangumi-add-collection-section' });

		new Setting(contentEl)
			.setName(tn('addToCollection', 'syncToCloud'))
			.addToggle(toggle => {
				toggle
					.setValue(this.syncToCloud)
					.onChange(value => {
						this.syncToCloud = value;
					});
			});

		new Setting(contentEl)
			.setName(tn('addToCollection', 'createLocal'))
			.addToggle(toggle => {
				toggle
					.setValue(this.createLocal)
					.onChange(value => {
						this.createLocal = value;
					});
			});

		// 操作按钮
		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

		buttonDiv.createEl('button', { text: tn('addToCollection', 'confirm'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => {
				void this.confirm();
			});
		});

		buttonDiv.createEl('button', { text: tn('addToCollection', 'cancel') }, btn => {
			btn.addEventListener('click', () => {
				this.close();
			});
		});
	}

	/**
	 * 渲染标签
	 */
	private renderTags(): void {
		this.tagsContainer.empty();
		this.tags.forEach((tag, index) => {
			const tagEl = this.tagsContainer.createSpan({ cls: 'bangumi-add-collection-tag' });
			tagEl.createSpan({ text: tag });
			tagEl.createEl('button', { text: '×', cls: 'bangumi-add-collection-tag-remove' }, btn => {
				btn.addEventListener('click', () => {
					this.tags.splice(index, 1);
					this.renderTags();
				});
			});
		});
	}

	/**
	 * 确认添加
	 */
	private async confirm(): Promise<void> {
		const input: AddToCollectionInput = {
			subjectId: this.subject.id,
			subjectName: this.subject.name_cn || this.subject.name,
			type: this.collectionType,
			rate: this.rate,
			comment: this.comment,
			tags: this.tags,
			private: this.isPrivate,
			localPropertyValues: { ...this.localPropertyValues },
			syncToCloud: this.syncToCloud,
			createLocal: this.createLocal,
		};

		// 执行同步
		try {
			const result = await this.syncManager.syncSingleSubject(this.subject.id, {
				type: input.type,
				rate: input.rate,
				comment: input.comment,
				tags: input.tags,
				private: input.private,
				localPropertyValues: input.localPropertyValues,
				syncToCloud: input.syncToCloud,
				createLocal: input.createLocal,
			});

			if (result.success) {
				this.onComplete(input);
				this.close();
			} else {
				new Notice(`${tn('addToCollection', 'addError')}: ${result.error}`);
			}

		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			new Notice(`${tn('addToCollection', 'addError')}: ${errorMsg}`);
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private initializeDefaultLocalPropertyValues(): void {
		for (const field of this.customFields) {
			if (field.initialValue !== undefined) {
				this.localPropertyValues[field.name] = field.initialValue;
			}
		}
	}

	private renderCustomField(container: HTMLElement, field: TemplatePropertyDefinition): void {
		const fieldEl = container.createDiv({ cls: `bangumi-local-property-field bangumi-local-property-field-${field.type}` });
		fieldEl.createEl('label', { text: field.label, cls: 'bangumi-local-property-label' });

		if (field.type === 'toggle') {
			const toggleWrap = fieldEl.createDiv({ cls: 'bangumi-local-property-toggle' });
			const toggle = toggleWrap.createEl('input', { type: 'checkbox' });
			const initialValue = this.localPropertyValues[field.name];
			toggle.checked = typeof initialValue === 'boolean' ? initialValue : false;
			toggle.addEventListener('change', () => {
				this.localPropertyValues[field.name] = toggle.checked;
			});
			return;
		}

		if (field.type === 'list') {
			const input = fieldEl.createEl('input', { type: 'text', cls: 'bangumi-local-property-input' });
			input.placeholder = field.placeholder || '';
			const initialValue = this.localPropertyValues[field.name];
			if (Array.isArray(initialValue)) {
				input.value = initialValue.join(', ');
			}
			input.addEventListener('input', () => {
				const parsed = parseListInput(input.value);
				if (parsed && parsed.length > 0) {
					this.localPropertyValues[field.name] = parsed;
				} else {
					delete this.localPropertyValues[field.name];
				}
			});
			return;
		}

		const input = fieldEl.createEl('input', { type: 'text', cls: 'bangumi-local-property-input' });
		input.placeholder = field.placeholder || '';
		const initialValue = this.localPropertyValues[field.name];
		if (typeof initialValue === 'string') {
			input.value = initialValue;
		}
		input.addEventListener('input', () => {
			const trimmed = input.value.trim();
			if (trimmed) {
				this.localPropertyValues[field.name] = trimmed;
			} else {
				delete this.localPropertyValues[field.name];
			}
		});
	}
}

function parseListInput(value: string): string[] | undefined {
	const items = value
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
}
