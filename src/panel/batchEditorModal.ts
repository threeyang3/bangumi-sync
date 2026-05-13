/**
 * 批量编辑器弹窗
 * 支持统一属性操作与按条目逐项编辑
 */

import { App, Modal, Notice, TFile, parseYaml } from 'obsidian';
import { tn, tnFormat } from '../i18n';

type BatchEditMode = 'uniform' | 'per_item';

/**
 * 批量编辑操作类型
 */
export interface BatchEditOperation {
	type: 'add' | 'modify' | 'delete';
	property: string;
	value?: string;
}

export interface BatchEditTargetItem {
	filePath: string;
	displayName: string;
}

export interface BatchPerItemUpdate {
	filePath: string;
	properties: Record<string, unknown>;
}

export interface BatchEditSubmission {
	mode: BatchEditMode;
	operations?: BatchEditOperation[];
	perItemUpdates?: BatchPerItemUpdate[];
}

interface EditableBatchItem extends BatchEditTargetItem {
	frontmatter: Record<string, unknown>;
}

/**
 * 批量编辑历史（用于撤销）
 */
interface BatchEditHistory {
	affectedFiles: string[];
	originalContent: Map<string, string>;
	timestamp: number;
}

/**
 * 批量编辑器弹窗
 */
export class BatchEditorModal extends Modal {
	private items: BatchEditTargetItem[];
	private onConfirm: (submission: BatchEditSubmission) => Promise<void>;

	private mode: BatchEditMode = 'per_item';
	private operations: BatchEditOperation[] = [];
	private editableItems: EditableBatchItem[] = [];
	private availableProperties: string[] = [];
	private selectedProperties: string[] = [];
	private draftValues: Map<string, Record<string, string>> = new Map();
	private loadingProperties = true;

	private operationListEl!: HTMLElement;
	private uniformPanelEl!: HTMLElement;
	private perItemPanelEl!: HTMLElement;
	private propertySelectionEl!: HTMLElement;
	private selectedPropertyEl!: HTMLElement;
	private editTableEl!: HTMLElement;

	constructor(
		app: App,
		items: BatchEditTargetItem[],
		onConfirm: (submission: BatchEditSubmission) => Promise<void>
	) {
		super(app);
		this.items = items;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.addClass('bangumi-batch-editor');

		contentEl.createEl('h2', { text: tn('batchEditor', 'title') });
		contentEl.createEl('p', {
			text: tnFormat('batchEditor', 'info', { count: this.items.length }),
			cls: 'bangumi-batch-editor-info'
		});

		this.renderModeSwitch(contentEl);

		this.uniformPanelEl = contentEl.createDiv({ cls: 'bangumi-batch-editor-panel' });
		this.renderUniformPanel();

		this.perItemPanelEl = contentEl.createDiv({ cls: 'bangumi-batch-editor-panel' });
		this.renderPerItemPanel();
		this.updateModeVisibility();

		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

		buttonDiv.createEl('button', { text: tn('batchEditor', 'cancel') }, btn => {
			btn.addEventListener('click', () => this.close());
		});

		buttonDiv.createEl('button', { text: tn('batchEditor', 'execute'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => void this.handleSubmit());
		});

		void this.loadEditableItems();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderModeSwitch(container: HTMLElement): void {
		const switchEl = container.createDiv({ cls: 'bangumi-batch-editor-mode-switch' });
		switchEl.createSpan({
			text: tn('batchEditor', 'modeLabel'),
			cls: 'bangumi-batch-editor-mode-label'
		});

		([
			['per_item', tn('batchEditor', 'modePerItem')],
			['uniform', tn('batchEditor', 'modeUniform')],
		] as const).forEach(([mode, label]) => {
			const button = switchEl.createEl('button', {
				text: label,
				cls: `bangumi-batch-editor-mode-btn${this.mode === mode ? ' is-active' : ''}`
			});
			button.addEventListener('click', () => {
				this.mode = mode;
				for (const sibling of Array.from(switchEl.querySelectorAll('.bangumi-batch-editor-mode-btn'))) {
					sibling.classList.remove('is-active');
				}
				button.classList.add('is-active');
				this.updateModeVisibility();
			});
		});
	}

	private renderUniformPanel(): void {
		this.uniformPanelEl.empty();
		this.uniformPanelEl.createEl('p', {
			text: tn('batchEditor', 'uniformDesc'),
			cls: 'bangumi-batch-editor-section-desc'
		});

		this.operationListEl = this.uniformPanelEl.createDiv({ cls: 'bangumi-operation-list' });
		this.renderOperationList();

		const addOperationDiv = this.uniformPanelEl.createDiv({ cls: 'bangumi-add-operation' });

		const typeSelect = addOperationDiv.createEl('select');
		typeSelect.createEl('option', { value: 'add', text: tn('batchEditor', 'typeAdd') });
		typeSelect.createEl('option', { value: 'modify', text: tn('batchEditor', 'typeModify') });
		typeSelect.createEl('option', { value: 'delete', text: tn('batchEditor', 'typeDelete') });

		const propertyInput = addOperationDiv.createEl('input', {
			type: 'text',
			placeholder: tn('batchEditor', 'propertyName'),
			cls: 'bangumi-property-input'
		});

		const valueInput = addOperationDiv.createEl('input', {
			type: 'text',
			placeholder: tn('batchEditor', 'propertyValue'),
			cls: 'bangumi-value-input'
		});

		addOperationDiv.createEl('button', { text: tn('batchEditor', 'addOperation') }, btn => {
			btn.addEventListener('click', () => {
				const type = typeSelect.value as BatchEditOperation['type'];
				const property = propertyInput.value.trim();
				const value = valueInput.value.trim();

				if (!property) {
					new Notice(tn('batchEditor', 'noticeProperty'));
					return;
				}

				if ((type === 'add' || type === 'modify') && !value) {
					new Notice(tn('batchEditor', 'noticeValue'));
					return;
				}

				this.operations.push({ type, property, value });
				this.renderOperationList();
				propertyInput.value = '';
				valueInput.value = '';
			});
		});
	}

	private renderPerItemPanel(): void {
		this.perItemPanelEl.empty();
		this.perItemPanelEl.createEl('p', {
			text: tn('batchEditor', 'perItemDesc'),
			cls: 'bangumi-batch-editor-section-desc'
		});

		const propertyPanel = this.perItemPanelEl.createDiv({ cls: 'bangumi-batch-property-panel' });
		const propertyHeader = propertyPanel.createDiv({ cls: 'bangumi-batch-property-header' });
		propertyHeader.createEl('h3', { text: tn('batchEditor', 'propertySelectionTitle') });
		propertyHeader.createEl('p', {
			text: tn('batchEditor', 'propertySelectionDesc'),
			cls: 'bangumi-batch-editor-section-desc'
		});

		this.propertySelectionEl = propertyPanel.createDiv({ cls: 'bangumi-batch-property-selection' });
		this.selectedPropertyEl = propertyPanel.createDiv({ cls: 'bangumi-batch-selected-properties' });

		const customPropertyRow = propertyPanel.createDiv({ cls: 'bangumi-batch-custom-property-row' });
		const customPropertyInput = customPropertyRow.createEl('input', {
			type: 'text',
			placeholder: tn('batchEditor', 'customPropertyPlaceholder'),
			cls: 'bangumi-property-input'
		});

		customPropertyRow.createEl('button', { text: tn('batchEditor', 'addSelectedProperty') }, btn => {
			btn.addEventListener('click', () => {
				const property = customPropertyInput.value.trim();
				if (!property) {
					new Notice(tn('batchEditor', 'noticeProperty'));
					return;
				}

				this.ensurePropertyExists(property);
				this.toggleSelectedProperty(property, true);
				customPropertyInput.value = '';
			});
		});

		this.editTableEl = this.perItemPanelEl.createDiv({ cls: 'bangumi-batch-edit-table-wrap' });

		this.renderPropertySelection();
		this.renderSelectedProperties();
		this.renderPerItemTable();
	}

	private updateModeVisibility(): void {
		this.uniformPanelEl.classList.toggle('is-hidden', this.mode !== 'uniform');
		this.perItemPanelEl.classList.toggle('is-hidden', this.mode !== 'per_item');
	}

	private async loadEditableItems(): Promise<void> {
		this.loadingProperties = true;
		this.renderPropertySelection();
		this.renderPerItemTable();

		try {
			const editableItems: EditableBatchItem[] = [];
			const propertySet = new Set<string>();

			for (const item of this.items) {
				const frontmatter = await this.readFrontmatter(item.filePath) ?? {};
				editableItems.push({
					...item,
					frontmatter,
				});

				for (const key of Object.keys(frontmatter)) {
					propertySet.add(key);
				}
			}

			this.editableItems = editableItems;
			this.availableProperties = [...propertySet].sort((left, right) => left.localeCompare(right, 'zh-CN'));

			for (const item of this.editableItems) {
				this.draftValues.set(item.filePath, this.createDraftValueRecord(item));
			}
		} catch (error) {
			console.error('[Bangumi Sync] Failed to load batch editor properties', error);
			new Notice(tn('batchEditor', 'noticeLoadFailed'));
		} finally {
			this.loadingProperties = false;
			this.renderPropertySelection();
			this.renderSelectedProperties();
			this.renderPerItemTable();
		}
	}

	private renderOperationList(): void {
		this.operationListEl.empty();

		if (this.operations.length === 0) {
			this.operationListEl.createDiv({
				cls: 'bangumi-operation-empty',
				text: tn('batchEditor', 'emptyOperations')
			});
			return;
		}

		const list = this.operationListEl.createEl('ul', { cls: 'bangumi-operation-items' });

		this.operations.forEach((op, index) => {
			const item = list.createEl('li', { cls: 'bangumi-operation-item' });
			const typeLabel = op.type === 'add'
				? tn('batchEditor', 'typeAdd')
				: op.type === 'modify'
					? tn('batchEditor', 'typeModify')
					: tn('batchEditor', 'typeDelete');

			item.createSpan({ cls: `bangumi-operation-type bangumi-operation-type-${op.type}`, text: typeLabel });
			item.createSpan({ cls: 'bangumi-operation-property', text: op.property });

			if (op.value !== undefined) {
				item.createSpan({ cls: 'bangumi-operation-arrow', text: '→' });
				item.createSpan({ cls: 'bangumi-operation-value', text: op.value });
			}

			item.createEl('button', {
				text: '×',
				cls: 'bangumi-operation-remove',
				attr: { 'aria-label': tn('batchEditor', 'removeOperation') }
			}, btn => {
				btn.addEventListener('click', () => {
					this.operations.splice(index, 1);
					this.renderOperationList();
				});
			});
		});
	}

	private renderPropertySelection(): void {
		this.propertySelectionEl.empty();

		if (this.loadingProperties) {
			this.propertySelectionEl.createDiv({
				cls: 'bangumi-operation-empty',
				text: tn('batchEditor', 'loadingProperties')
			});
			return;
		}

		if (this.availableProperties.length === 0) {
			this.propertySelectionEl.createDiv({
				cls: 'bangumi-operation-empty',
				text: tn('batchEditor', 'emptyEditableProperties')
			});
			return;
		}

		const list = this.propertySelectionEl.createDiv({ cls: 'bangumi-batch-property-list' });
		for (const property of this.availableProperties) {
			const label = list.createEl('label', { cls: 'bangumi-batch-property-option' });
			const checkbox = label.createEl('input', { type: 'checkbox' });
			checkbox.checked = this.selectedProperties.includes(property);
			checkbox.addEventListener('change', () => {
				this.toggleSelectedProperty(property, checkbox.checked);
			});
			label.createSpan({ text: property });
		}
	}

	private renderSelectedProperties(): void {
		this.selectedPropertyEl.empty();

		if (this.selectedProperties.length === 0) {
			this.selectedPropertyEl.createDiv({
				cls: 'bangumi-operation-empty',
				text: tn('batchEditor', 'emptySelectedProperties')
			});
			return;
		}

		this.selectedPropertyEl.createDiv({
			cls: 'bangumi-batch-selected-properties-desc',
			text: tnFormat('batchEditor', 'selectedPropertyCount', { count: this.selectedProperties.length })
		});

		const chipWrap = this.selectedPropertyEl.createDiv({ cls: 'bangumi-batch-property-chip-wrap' });
		for (const property of this.selectedProperties) {
			const chip = chipWrap.createDiv({ cls: 'bangumi-batch-property-chip' });
			chip.createSpan({ text: property });
			chip.createEl('button', {
				text: '×',
				cls: 'bangumi-batch-property-chip-remove',
				attr: { 'aria-label': tn('batchEditor', 'removeSelectedProperty') }
			}, btn => {
				btn.addEventListener('click', () => {
					this.toggleSelectedProperty(property, false);
				});
			});
		}
	}

	private renderPerItemTable(): void {
		this.editTableEl.empty();

		if (this.loadingProperties) {
			this.editTableEl.createDiv({
				cls: 'bangumi-operation-empty',
				text: tn('batchEditor', 'loadingProperties')
			});
			return;
		}

		if (this.selectedProperties.length === 0) {
			this.editTableEl.createDiv({
				cls: 'bangumi-operation-empty',
				text: tn('batchEditor', 'emptyEditTable')
			});
			return;
		}

		const desc = this.editTableEl.createDiv({
			cls: 'bangumi-batch-edit-table-desc',
			text: tn('batchEditor', 'editTableDesc')
		});
		desc.setAttribute('role', 'note');

		const scroll = this.editTableEl.createDiv({ cls: 'bangumi-batch-edit-table-scroll' });
		const table = scroll.createEl('table', { cls: 'bangumi-batch-edit-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');

		headerRow.createEl('th', { text: tn('batchEditor', 'itemName') });
		for (const property of this.selectedProperties) {
			headerRow.createEl('th', { text: property });
		}

		const tbody = table.createEl('tbody');
		for (const item of this.editableItems) {
			const row = tbody.createEl('tr');
			row.createEl('td', { text: item.displayName, cls: 'bangumi-batch-edit-name-cell' });

			const rowDraft = this.draftValues.get(item.filePath) ?? {};
			for (const property of this.selectedProperties) {
				const cell = row.createEl('td');
				const input = cell.createEl('input', {
					type: 'text',
					value: rowDraft[property] ?? '',
					cls: 'bangumi-batch-edit-input'
				});
				input.setAttribute('aria-label', `${item.displayName} - ${property}`);
				input.addEventListener('input', () => {
					const draft = this.draftValues.get(item.filePath) ?? {};
					draft[property] = input.value;
					this.draftValues.set(item.filePath, draft);
				});
			}
		}
	}

	private async handleSubmit(): Promise<void> {
		if (this.mode === 'uniform') {
			if (this.operations.length === 0) {
				new Notice(tn('batchEditor', 'noticeNoOp'));
				return;
			}

			await this.onConfirm({
				mode: 'uniform',
				operations: this.operations,
			});
			this.close();
			return;
		}

		if (this.selectedProperties.length === 0) {
			new Notice(tn('batchEditor', 'noticeSelectProperty'));
			return;
		}

		const perItemUpdates = this.buildPerItemUpdates();
		if (perItemUpdates.length === 0) {
			new Notice(tn('batchEditor', 'noticeNothingChanged'));
			return;
		}

		await this.onConfirm({
			mode: 'per_item',
			perItemUpdates,
		});
		this.close();
	}

	private buildPerItemUpdates(): BatchPerItemUpdate[] {
		const updates: BatchPerItemUpdate[] = [];

		for (const item of this.editableItems) {
			const draft = this.draftValues.get(item.filePath) ?? {};
			const properties: Record<string, unknown> = {};

			for (const property of this.selectedProperties) {
				const originalValue = item.frontmatter[property];
				const originalDisplay = formatFrontmatterValue(originalValue);
				const draftValue = draft[property] ?? '';

				if (draftValue === originalDisplay) {
					continue;
				}

				if (draftValue === '' && originalValue === undefined) {
					continue;
				}

				properties[property] = coerceDraftValue(draftValue, originalValue);
			}

			if (Object.keys(properties).length > 0) {
				updates.push({
					filePath: item.filePath,
					properties,
				});
			}
		}

		return updates;
	}

	private toggleSelectedProperty(property: string, enabled: boolean): void {
		if (enabled) {
			if (!this.selectedProperties.includes(property)) {
				this.selectedProperties.push(property);
				this.selectedProperties.sort((left, right) => left.localeCompare(right, 'zh-CN'));
				for (const item of this.editableItems) {
					const draft = this.draftValues.get(item.filePath) ?? {};
					if (draft[property] === undefined) {
						draft[property] = formatFrontmatterValue(item.frontmatter[property]);
						this.draftValues.set(item.filePath, draft);
					}
				}
			}
		} else {
			this.selectedProperties = this.selectedProperties.filter(current => current !== property);
		}

		this.renderPropertySelection();
		this.renderSelectedProperties();
		this.renderPerItemTable();
	}

	private ensurePropertyExists(property: string): void {
		if (!this.availableProperties.includes(property)) {
			this.availableProperties.push(property);
			this.availableProperties.sort((left, right) => left.localeCompare(right, 'zh-CN'));
		}

		for (const item of this.editableItems) {
			const draft = this.draftValues.get(item.filePath) ?? {};
			if (draft[property] === undefined) {
				draft[property] = formatFrontmatterValue(item.frontmatter[property]);
				this.draftValues.set(item.filePath, draft);
			}
		}
	}

	private createDraftValueRecord(item: EditableBatchItem): Record<string, string> {
		const record: Record<string, string> = {};
		for (const property of this.availableProperties) {
			record[property] = formatFrontmatterValue(item.frontmatter[property]);
		}
		return record;
	}

	private async readFrontmatter(filePath: string): Promise<Record<string, unknown> | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return null;
		}

		const content = await this.app.vault.read(file);
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) {
			return {};
		}

		const parsed = parseYaml(match[1]);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return {};
		}

		const frontmatter = parsed as Record<string, unknown>;
		delete frontmatter.position;
		return frontmatter;
	}
}

/**
 * Frontmatter 编辑器
 * 负责读取和修改文件的 frontmatter
 */
export class FrontmatterEditor {
	private app: App;
	private history: BatchEditHistory[] = [];
	private maxHistory = 10;

	constructor(app: App) {
		this.app = app;
	}

	async batchModify(
		filePaths: string[],
		operations: BatchEditOperation[]
	): Promise<{ success: number; failed: number }> {
		const originalContents = await this.captureOriginalContents(filePaths);
		const affectedFiles: string[] = [];
		let success = 0;
		let failed = 0;

		for (const path of filePaths) {
			const result = await this.applyUniformOperations(path, operations);
			if (result) {
				success++;
				affectedFiles.push(path);
			} else {
				failed++;
			}
		}

		this.pushHistoryIfNeeded(success, affectedFiles, originalContents);
		return { success, failed };
	}

	async batchApplyPerItemUpdates(
		updates: BatchPerItemUpdate[]
	): Promise<{ success: number; failed: number }> {
		const filePaths = updates.map(update => update.filePath);
		const originalContents = await this.captureOriginalContents(filePaths);
		const affectedFiles: string[] = [];
		let success = 0;
		let failed = 0;

		for (const update of updates) {
			const result = await this.applyPerItemUpdate(update);
			if (result) {
				success++;
				affectedFiles.push(update.filePath);
			} else {
				failed++;
			}
		}

		this.pushHistoryIfNeeded(success, affectedFiles, originalContents);
		return { success, failed };
	}

	async undo(): Promise<boolean> {
		if (this.history.length === 0) {
			return false;
		}

		const lastOperation = this.history.pop();
		if (!lastOperation) {
			return false;
		}

		let restored = 0;
		for (const [path, content] of lastOperation.originalContent) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile && lastOperation.affectedFiles.includes(path)) {
				await this.app.vault.process(file, () => content);
				restored++;
			}
		}

		return restored > 0;
	}

	canUndo(): boolean {
		return this.history.length > 0;
	}

	private async applyUniformOperations(
		filePath: string,
		operations: BatchEditOperation[]
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return false;
		}

		try {
			await this.app.fileManager.processFrontMatter(file, frontmatter => {
				for (const operation of operations) {
					if (operation.type === 'delete') {
						delete frontmatter[operation.property];
						continue;
					}

					frontmatter[operation.property] = operation.value ?? '';
				}
			});
			return true;
		} catch (error) {
			console.error(`[Bangumi Sync] Failed to batch modify frontmatter: ${filePath}`, error);
			return false;
		}
	}

	private async applyPerItemUpdate(update: BatchPerItemUpdate): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(update.filePath);
		if (!(file instanceof TFile)) {
			return false;
		}

		try {
			await this.app.fileManager.processFrontMatter(file, frontmatter => {
				for (const [property, value] of Object.entries(update.properties)) {
					frontmatter[property] = value;
				}
			});
			return true;
		} catch (error) {
			console.error(`[Bangumi Sync] Failed to apply per-item batch update: ${update.filePath}`, error);
			return false;
		}
	}

	private async captureOriginalContents(filePaths: string[]): Promise<Map<string, string>> {
		const originalContents = new Map<string, string>();

		for (const path of filePaths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) {
				const content = await this.app.vault.read(file);
				originalContents.set(path, content);
			}
		}

		return originalContents;
	}

	private pushHistoryIfNeeded(
		success: number,
		affectedFiles: string[],
		originalContents: Map<string, string>
	): void {
		if (success <= 0) {
			return;
		}

		this.history.push({
			affectedFiles,
			originalContent: originalContents,
			timestamp: Date.now()
		});

		if (this.history.length > this.maxHistory) {
			this.history.shift();
		}
	}
}

function formatFrontmatterValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}

	if (Array.isArray(value)) {
		return value.map(item => String(item ?? '')).join(', ');
	}

	if (typeof value === 'object') {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}

	return String(value);
}

function coerceDraftValue(value: string, originalValue: unknown): unknown {
	if (Array.isArray(originalValue)) {
		return splitListValue(value);
	}

	if (typeof originalValue === 'number') {
		const parsed = Number(value);
		return Number.isNaN(parsed) ? value : parsed;
	}

	if (typeof originalValue === 'boolean') {
		if (value === 'true') {
			return true;
		}
		if (value === 'false') {
			return false;
		}
	}

	if (value.includes('\n')) {
		return value;
	}

	return value;
}

function splitListValue(value: string): string[] {
	return value
		.split(/[\n,，]/)
		.map(item => item.trim())
		.filter(Boolean);
}
