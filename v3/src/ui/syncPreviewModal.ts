/**
 * V2 同步预览弹窗
 * 在导入前让用户确认每个条目并填写评分明细
 */

import { App, Modal } from 'obsidian';
import { SubjectType, UserCollection } from '../../../common/api/types';
import { getTypeLabel } from '../../../common/template/defaultTemplates';

/**
 * 评分明细
 */
export interface RatingDetails {
	music?: string;      // 音乐
	character?: string;  // 人设
	story?: string;      // 剧情
	art?: string;        // 美术
	illustration?: string; // 插画
	writing?: string;    // 文笔
	drawing?: string;    // 画工
	fun?: string;        // 趣味
}

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
	ratingDetails: RatingDetails;
}

/**
 * 预览结果
 */
export interface SyncPreviewResult {
	items: SyncPreviewItem[];
	action: 'all' | 'selected' | 'unselected' | 'cancel';
}

/**
 * 各类型条目的评分明细字段配置
 */
const RATING_DETAIL_FIELDS: Record<number, { key: keyof RatingDetails; label: string }[]> = {
	[SubjectType.Anime]: [
		{ key: 'music', label: '音乐' },
		{ key: 'character', label: '人设' },
		{ key: 'story', label: '剧情' },
		{ key: 'art', label: '美术' },
	],
	[SubjectType.Book]: [
		{ key: 'story', label: '剧情' },
		{ key: 'illustration', label: '插画' },
		{ key: 'writing', label: '文笔' },
		{ key: 'character', label: '人设' },
	],
	// 漫画使用 Book 类型但字段不同，通过 category 判断
	[SubjectType.Music]: [],
	[SubjectType.Game]: [
		{ key: 'story', label: '剧情' },
		{ key: 'fun', label: '趣味' },
		{ key: 'music', label: '音乐' },
		{ key: 'art', label: '美术' },
	],
	[SubjectType.Real]: [],
};

/**
 * 获取条目的评分明细字段
 */
function getRatingFields(type: SubjectType, category?: string): { key: keyof RatingDetails; label: string }[] {
	// 漫画特殊处理
	if (type === SubjectType.Book && category?.includes('漫画')) {
		return [
			{ key: 'story', label: '剧情' },
			{ key: 'drawing', label: '画工' },
			{ key: 'character', label: '人设' },
		];
	}
	return RATING_DETAIL_FIELDS[type] || [];
}

/**
 * V2 同步预览弹窗
 */
export class SyncPreviewModalV3 extends Modal {
	private items: SyncPreviewItem[];
	private onConfirm: (result: SyncPreviewResult) => void;
	private itemElements: Map<number, { checkbox: HTMLInputElement; detailInputs: Map<keyof RatingDetails, HTMLInputElement> }> = new Map();

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

		contentEl.createEl('h2', { text: '同步预览 (V2)' });

		// 统计信息
		contentEl.createEl('p', {
			text: `共 ${this.items.length} 个条目待同步，请确认要导入的条目并填写评分明细`,
			cls: 'bangumi-preview-info'
		});

		// 条目列表容器
		const listContainer = contentEl.createDiv({ cls: 'bangumi-preview-list' });

		this.items.forEach(item => {
			this.renderItem(listContainer, item);
		});

		// 快捷选择按钮
		const quickDiv = contentEl.createDiv({ cls: 'bangumi-preview-quick' });
		quickDiv.createEl('button', { text: '全选', cls: 'bangumi-quick-btn' }, btn => {
			btn.addEventListener('click', () => this.selectAll(true));
		});
		quickDiv.createEl('button', { text: '全不选', cls: 'bangumi-quick-btn' }, btn => {
			btn.addEventListener('click', () => this.selectAll(false));
		});
		quickDiv.createEl('button', { text: '反选', cls: 'bangumi-quick-btn' }, btn => {
			btn.addEventListener('click', () => this.invertSelection());
		});

		// 操作按钮
		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

		buttonDiv.createEl('button', { text: '全部导入', cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => this.confirm('all'));
		});

		buttonDiv.createEl('button', { text: '只导入选中的', cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => this.confirm('selected'));
		});

		buttonDiv.createEl('button', { text: '只导入未选中的' }, btn => {
			btn.addEventListener('click', () => this.confirm('unselected'));
		});

		buttonDiv.createEl('button', { text: '取消' }, btn => {
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

		const checkbox = headerDiv.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
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
			myRateSpan.setText(`[我的评分: ${item.my_rate}]`);
		}

		// 评分明细输入
		const fields = getRatingFields(item.type);
		if (fields.length > 0) {
			const detailsDiv = itemDiv.createDiv({ cls: 'bangumi-preview-details' });
			detailsDiv.createSpan({ text: '评分明细: ', cls: 'bangumi-preview-details-label' });

			const detailInputs = new Map<keyof RatingDetails, HTMLInputElement>();

			fields.forEach(field => {
				const fieldSpan = detailsDiv.createSpan({ cls: 'bangumi-preview-detail-field' });
				fieldSpan.createSpan({ text: `${field.label}: ` });

				const input = fieldSpan.createEl('input', { type: 'text' }) as HTMLInputElement;
				input.value = item.ratingDetails[field.key] || '';
				input.addClass('bangumi-preview-detail-input');
				input.setAttribute('placeholder', '0-10');

				detailInputs.set(field.key, input);
			});

			this.itemElements.set(item.id, { checkbox, detailInputs });
		} else {
			this.itemElements.set(item.id, {
				checkbox,
				detailInputs: new Map()
			});
		}
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

		// 更新每个条目的选择状态和评分明细
		this.items.forEach(item => {
			const elements = this.itemElements.get(item.id);
			if (elements) {
				item.selected = elements.checkbox.checked;

				// 收集评分明细
				elements.detailInputs.forEach((input, key) => {
					item.ratingDetails[key] = input.value;
				});
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
export function createPreviewItems(collections: UserCollection[]): SyncPreviewItem[] {
	return collections.map(collection => ({
		id: collection.subject_id,
		name_cn: collection.subject.name_cn || '',
		name: collection.subject.name || '',
		type: collection.subject_type,
		typeLabel: getTypeLabel(collection.subject_type),
		rating: collection.subject.score || 0,
		my_rate: collection.rate,
		collection,
		selected: true,
		ratingDetails: {},
	}));
}
