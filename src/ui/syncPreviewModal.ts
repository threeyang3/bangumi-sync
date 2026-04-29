/**
 * 同步预览弹窗
 * 在导入前让用户确认每个条目并填写评分明细
 */

import { App, Modal, Setting } from 'obsidian';
import { SubjectType, UserCollection } from '../../common/api/types';
import { tn } from '../i18n';

/**
 * 待同步条目预览数据
 */
export interface SyncPreviewItem {
	id: number;
	name_cn: string;
	name: string;
	type: SubjectType;
	typeLabel: string;
	rating: number;
	my_rate?: number;
	collection: UserCollection;
	selected: boolean;
}

/**
 * 预览结果
 */
export interface SyncPreviewResult {
	items: SyncPreviewItem[];
	action: 'all' | 'selected' | 'unselected' | 'cancel';
}

/**
 * 同步预览弹窗
 */
export class SyncPreviewModal extends Modal {
	private items: SyncPreviewItem[];
	private onConfirm: (result: SyncPreviewResult) => void;
	private itemElements: Map<number, { checkbox: HTMLInputElement }> = new Map();

	constructor(
		app: App,
		items: SyncPreviewItem[],
		onConfirm: (result: SyncPreviewResult) => void
	) {
		super(app);
		this.items = items;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;

		new Setting(contentEl).setName(tn('syncPreview', 'title')).setHeading();

		// 统计信息
		contentEl.createEl('p', {
			text: `${this.items.length} ${tn('syncPreview', 'itemsToSync')}`,
			cls: 'bangumi-preview-info'
		});

		// 条目列表容器
		const listContainer = contentEl.createDiv({ cls: 'bangumi-preview-list' });

		this.items.forEach(item => {
			this.renderItem(listContainer, item);
		});

		// 快捷选择按钮
		const quickDiv = contentEl.createDiv({ cls: 'bangumi-preview-quick' });
		quickDiv.createEl('button', { text: tn('syncPreview', 'selectAll'), cls: 'bangumi-quick-btn' }, btn => {
			btn.addEventListener('click', () => this.selectAll(true));
		});
		quickDiv.createEl('button', { text: tn('syncPreview', 'deselectAll'), cls: 'bangumi-quick-btn' }, btn => {
			btn.addEventListener('click', () => this.selectAll(false));
		});
		quickDiv.createEl('button', { text: tn('syncPreview', 'invert'), cls: 'bangumi-quick-btn' }, btn => {
			btn.addEventListener('click', () => this.invertSelection());
		});

		// 操作按钮
		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

		buttonDiv.createEl('button', { text: tn('syncPreview', 'importAll'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => this.confirm('all'));
		});

		buttonDiv.createEl('button', { text: tn('syncPreview', 'importSelected'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => this.confirm('selected'));
		});

		buttonDiv.createEl('button', { text: tn('syncPreview', 'importUnselected') }, btn => {
			btn.addEventListener('click', () => this.confirm('unselected'));
		});

		buttonDiv.createEl('button', { text: tn('syncPreview', 'cancel') }, btn => {
			btn.addEventListener('click', () => this.confirm('cancel'));
		});
	}

	/**
	 * 渲染单个条目
	 */
	private renderItem(container: HTMLElement, item: SyncPreviewItem): void {
		const itemDiv = container.createDiv({ cls: 'bangumi-preview-item' });

		// 第一行：勾选框 + 名称 + 类型 + 评分
		const headerDiv = itemDiv.createDiv({ cls: 'bangumi-preview-item-header' });

		const checkbox = headerDiv.createEl('input', { type: 'checkbox' });
		checkbox.checked = item.selected;
		checkbox.addClass('bangumi-preview-checkbox');

		const nameSpan = headerDiv.createSpan({ cls: 'bangumi-preview-name' });
		nameSpan.setText(item.name_cn || item.name);

		const typeSpan = headerDiv.createSpan({ cls: 'bangumi-preview-type' });
		typeSpan.setText(`(${item.typeLabel})`);

		const ratingSpan = headerDiv.createSpan({ cls: 'bangumi-preview-rating' });
		ratingSpan.setText(`★${item.rating.toFixed(1)}`);

		if (item.my_rate) {
			const myRateSpan = headerDiv.createSpan({ cls: 'bangumi-preview-my-rate' });
			myRateSpan.setText(`[${tn('syncPreview', 'myRating')}: ${item.my_rate}]`);
		}

		this.itemElements.set(item.id, { checkbox });
	}

	/**
	 * 全选/全不选
	 */
	private selectAll(selected: boolean): void {
		this.itemElements.forEach(({ checkbox }) => {
			checkbox.checked = selected;
		});
	}

	/**
	 * 反选
	 */
	private invertSelection(): void {
		this.itemElements.forEach(({ checkbox }) => {
			checkbox.checked = !checkbox.checked;
		});
	}

	/**
	 * 确认
	 */
	private confirm(action: 'all' | 'selected' | 'unselected' | 'cancel'): void {
		if (action === 'cancel') {
			this.onConfirm({ items: this.items, action: 'cancel' });
			this.close();
			return;
		}

		// 更新每个条目的选择状态
		this.items.forEach(item => {
			const elements = this.itemElements.get(item.id);
			if (elements) {
				item.selected = elements.checkbox.checked;
			}
		});

		this.onConfirm({ items: this.items, action });
		this.close();
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.itemElements.clear();
	}
}

/**
 * 创建预览数据
 */

// 兼容旧版本的类型别名
