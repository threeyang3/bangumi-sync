/**
 * 同步选项弹窗
 * 让用户在同步前选择同步类型和数量
 */

import { App, Modal, Setting, ButtonComponent } from 'obsidian';
import { SubjectType, CollectionType, getSubjectTypeName, getCollectionTypeName } from '../../../common/api/types';

/**
 * 同步选项
 */
export interface SyncOptions {
	subjectTypes: SubjectType[];
	collectionTypes: CollectionType[];
	limit: number;
	force: boolean;
}

/**
 * 同步选项弹窗
 */
export class SyncOptionsModal extends Modal {
	private options: SyncOptions;
	private onSave: (options: SyncOptions) => void;

	// 临时选择状态
	private selectedSubjectTypes: Set<SubjectType>;
	private selectedCollectionTypes: Set<CollectionType>;
	private limitValue: number;
	private forceValue: boolean;

	constructor(
		app: App,
		defaultOptions: SyncOptions,
		onSave: (options: SyncOptions) => void
	) {
		super(app);
		this.options = defaultOptions;
		this.onSave = onSave;

		this.selectedSubjectTypes = new Set(defaultOptions.subjectTypes);
		this.selectedCollectionTypes = new Set(defaultOptions.collectionTypes);
		this.limitValue = defaultOptions.limit;
		this.forceValue = defaultOptions.force;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.createEl('h2', { text: '同步选项' });

		// ==================== 条目类型选择 ====================
		contentEl.createEl('h3', { text: '条目类型' });

		const subjectTypesDiv = contentEl.createDiv({ cls: 'bangumi-checkbox-group' });
		const subjectTypes: SubjectType[] = [
			SubjectType.Anime,
			SubjectType.Game,
			SubjectType.Book,
			SubjectType.Music,
			SubjectType.Real,
		];

		subjectTypes.forEach(type => {
			const label = subjectTypesDiv.createEl('label', { cls: 'bangumi-checkbox-label' });
			const checkbox = label.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
			checkbox.checked = this.selectedSubjectTypes.has(type);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedSubjectTypes.add(type);
				} else {
					this.selectedSubjectTypes.delete(type);
				}
			});
			label.createSpan({ text: getSubjectTypeName(type) });
		});

		// 快捷选择按钮
		const subjectQuickDiv = contentEl.createDiv({ cls: 'bangumi-quick-select' });
		subjectQuickDiv.createEl('button', { text: '全选', cls: 'bangumi-quick-btn' }, (btn) => {
			btn.addEventListener('click', () => {
				subjectTypes.forEach(t => this.selectedSubjectTypes.add(t));
				this.redraw();
			});
		});
		subjectQuickDiv.createEl('button', { text: '全不选', cls: 'bangumi-quick-btn' }, (btn) => {
			btn.addEventListener('click', () => {
				this.selectedSubjectTypes.clear();
				this.redraw();
			});
		});

		// ==================== 收藏状态选择 ====================
		contentEl.createEl('h3', { text: '收藏状态' });

		const collectionTypesDiv = contentEl.createDiv({ cls: 'bangumi-checkbox-group' });
		const collectionTypes: CollectionType[] = [
			CollectionType.Wish,
			CollectionType.Doing,
			CollectionType.Done,
			CollectionType.OnHold,
			CollectionType.Dropped,
		];

		collectionTypes.forEach(type => {
			const label = collectionTypesDiv.createEl('label', { cls: 'bangumi-checkbox-label' });
			const checkbox = label.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
			checkbox.checked = this.selectedCollectionTypes.has(type);
			checkbox.addEventListener('change', () => {
				if (checkbox.checked) {
					this.selectedCollectionTypes.add(type);
				} else {
					this.selectedCollectionTypes.delete(type);
				}
			});
			label.createSpan({ text: getCollectionTypeName(type) });
		});

		// 快捷选择按钮
		const collectionQuickDiv = contentEl.createDiv({ cls: 'bangumi-quick-select' });
		collectionQuickDiv.createEl('button', { text: '全选', cls: 'bangumi-quick-btn' }, (btn) => {
			btn.addEventListener('click', () => {
				collectionTypes.forEach(t => this.selectedCollectionTypes.add(t));
				this.redraw();
			});
		});
		collectionQuickDiv.createEl('button', { text: '全不选', cls: 'bangumi-quick-btn' }, (btn) => {
			btn.addEventListener('click', () => {
				this.selectedCollectionTypes.clear();
				this.redraw();
			});
		});

		// ==================== 同步数量 ====================
		contentEl.createEl('h3', { text: '同步数量' });

		new Setting(contentEl)
			.setName('同步数量限制')
			.setDesc('每次同步的最大条目数量（0 表示不限制）')
			.addText(text => text
				.setPlaceholder('50')
				.setValue(String(this.limitValue))
				.onChange((value) => {
					const num = parseInt(value, 10);
					if (!isNaN(num) && num >= 0) {
						this.limitValue = num;
					}
				}));

		// ==================== 强制同步选项 ====================
		new Setting(contentEl)
			.setName('强制同步')
			.setDesc('忽略已存在的条目，重新同步所有选中的条目')
			.addToggle(toggle => toggle
				.setValue(this.forceValue)
				.onChange((value) => {
					this.forceValue = value;
				}));

		// ==================== 操作按钮 ====================
		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

		const syncBtn = buttonDiv.createEl('button', { text: '开始同步', cls: 'mod-cta' });
		syncBtn.addEventListener('click', () => {
			this.onSave({
				subjectTypes: Array.from(this.selectedSubjectTypes),
				collectionTypes: Array.from(this.selectedCollectionTypes),
				limit: this.limitValue,
				force: this.forceValue,
			});
			this.close();
		});

		const cancelBtn = buttonDiv.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => {
			this.close();
		});
	}

	/**
	 * 重绘弹窗
	 */
	private redraw(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.onOpen();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}
