/**
 * V3 批量编辑器弹窗
 * 批量新增/修改/删除 frontmatter 属性
 */

import { App, Modal, Notice } from 'obsidian';

/**
 * 批量编辑操作类型
 */
export interface BatchEditOperation {
	type: 'add' | 'modify' | 'delete';
	property: string;
	value?: string;
}

/**
 * 批量编辑历史（用于撤销）
 */
interface BatchEditHistory {
	operations: BatchEditOperation[];
	affectedFiles: string[];
	originalContent: Map<string, string>;
	timestamp: number;
}

/**
 * 批量编辑器弹窗
 */
export class BatchEditorModal extends Modal {
	private filePaths: string[];
	private onConfirm: (operations: BatchEditOperation[]) => Promise<void>;

	private operations: BatchEditOperation[] = [];
	private operationListEl: HTMLElement;

	constructor(
		app: App,
		filePaths: string[],
		onConfirm: (operations: BatchEditOperation[]) => Promise<void>
	) {
		super(app);
		this.filePaths = filePaths;
		this.onConfirm = onConfirm;
	}

	onOpen(): void {
		const { contentEl } = this;

		contentEl.addClass('bangumi-batch-editor');

		contentEl.createEl('h2', { text: '批量编辑属性' });
		contentEl.createEl('p', {
			text: `将对 ${this.filePaths.length} 个文件进行批量编辑`,
			cls: 'bangumi-batch-editor-info'
		});

		// 操作列表
		this.operationListEl = contentEl.createDiv({ cls: 'bangumi-operation-list' });
		this.renderOperationList();

		// 添加操作区域
		const addOperationDiv = contentEl.createDiv({ cls: 'bangumi-add-operation' });

		// 操作类型选择
		const typeSelect = addOperationDiv.createEl('select');
		typeSelect.createEl('option', { value: 'add', text: '新增属性' });
		typeSelect.createEl('option', { value: 'modify', text: '修改属性' });
		typeSelect.createEl('option', { value: 'delete', text: '删除属性' });

		// 属性名输入
		const propertyInput = addOperationDiv.createEl('input', {
			type: 'text',
			placeholder: '属性名',
			cls: 'bangumi-property-input'
		});

		// 属性值输入
		const valueInput = addOperationDiv.createEl('input', {
			type: 'text',
			placeholder: '属性值',
			cls: 'bangumi-value-input'
		});

		// 添加按钮
		addOperationDiv.createEl('button', { text: '添加操作' }, btn => {
			btn.addEventListener('click', () => {
				const type = typeSelect.value as 'add' | 'modify' | 'delete';
				const property = propertyInput.value.trim();
				const value = valueInput.value.trim();

				if (!property) {
					new Notice('请输入属性名');
					return;
				}

				if ((type === 'add' || type === 'modify') && !value) {
					new Notice('新增或修改属性需要输入属性值');
					return;
				}

				this.operations.push({ type, property, value });
				this.renderOperationList();

				// 清空输入
				propertyInput.value = '';
				valueInput.value = '';
			});
		});

		// 操作按钮
		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

		buttonDiv.createEl('button', { text: '取消' }, btn => {
			btn.addEventListener('click', () => this.close());
		});

		buttonDiv.createEl('button', { text: '确认执行', cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', async () => {
				if (this.operations.length === 0) {
					new Notice('请至少添加一个操作');
					return;
				}

				await this.onConfirm(this.operations);
				this.close();
			});
		});
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 渲染操作列表
	 */
	private renderOperationList(): void {
		this.operationListEl.empty();

		if (this.operations.length === 0) {
			this.operationListEl.createDiv({
				cls: 'bangumi-operation-empty',
				text: '暂无操作，请添加要执行的属性操作'
			});
			return;
		}

		const list = this.operationListEl.createEl('ul', { cls: 'bangumi-operation-items' });

		this.operations.forEach((op, index) => {
			const item = list.createEl('li', { cls: 'bangumi-operation-item' });

			const typeLabel = op.type === 'add' ? '新增' : op.type === 'modify' ? '修改' : '删除';
			const typeClass = `bangumi-operation-type-${op.type}`;

			item.createSpan({ cls: `bangumi-operation-type ${typeClass}`, text: typeLabel });
			item.createSpan({ cls: 'bangumi-operation-property', text: op.property });

			if (op.value !== undefined) {
				item.createSpan({ cls: 'bangumi-operation-arrow', text: '→' });
				item.createSpan({ cls: 'bangumi-operation-value', text: op.value });
			}

			// 删除按钮
			item.createEl('button', { text: '×', cls: 'bangumi-operation-remove' }, btn => {
				btn.addEventListener('click', () => {
					this.operations.splice(index, 1);
					this.renderOperationList();
				});
			});
		});
	}
}

/**
 * Frontmatter 编辑器
 * 负责读取和修改文件的 frontmatter
 */
export class FrontmatterEditor {
	private app: App;
	private history: BatchEditHistory[] = [];
	private maxHistory: number = 10;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 读取文件的 frontmatter
	 */
	async readFrontmatter(filePath: string): Promise<Record<string, any> | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file) return null;

		const content = await this.app.vault.read(file as any);

		// 解析 frontmatter
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) return null;

		const frontmatter: Record<string, any> = {};
		const lines = match[1].split('\n');

		for (const line of lines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex > 0) {
				const key = line.substring(0, colonIndex).trim();
				let value: any = line.substring(colonIndex + 1).trim();

				// 移除引号
				if ((value.startsWith('"') && value.endsWith('"')) ||
					(value.startsWith("'") && value.endsWith("'"))) {
					value = value.slice(1, -1);
				}

				frontmatter[key] = value;
			}
		}

		return frontmatter;
	}

	/**
	 * 修改文件的 frontmatter
	 */
	async modifyFrontmatter(
		filePath: string,
		operations: BatchEditOperation[]
	): Promise<boolean> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!file) return false;

		const content = await this.app.vault.read(file as any);

		// 匹配 frontmatter
		const match = content.match(/^(---\n)([\s\S]*?)(\n---)/);
		if (!match) return false;

		const prefix = match[1];
		let frontmatterStr = match[2];
		const suffix = match[3];

		// 保存原始内容用于撤销
		const originalContent = content;

		// 应用操作
		for (const op of operations) {
			frontmatterStr = this.applyOperation(frontmatterStr, op);
		}

		// 重建文件内容
		const newContent = prefix + frontmatterStr + suffix + content.substring(match[0].length);

		await this.app.vault.modify(file as any, newContent);

		return true;
	}

	/**
	 * 应用单个操作到 frontmatter 字符串
	 */
	private applyOperation(frontmatterStr: string, operation: BatchEditOperation): string {
		const lines = frontmatterStr.split('\n');
		const propertyRegex = new RegExp(`^${operation.property}:`);

		if (operation.type === 'delete') {
			// 删除属性
			const newLines = lines.filter(line => !propertyRegex.test(line));
			return newLines.join('\n');
		}

		if (operation.type === 'modify') {
			// 修改属性
			const newLines = lines.map(line => {
				if (propertyRegex.test(line)) {
					return `${operation.property}: "${operation.value}"`;
				}
				return line;
			});
			return newLines.join('\n');
		}

		if (operation.type === 'add') {
			// 新增属性（如果不存在）
			const exists = lines.some(line => propertyRegex.test(line));
			if (!exists) {
				lines.push(`${operation.property}: "${operation.value}"`);
			}
			return lines.join('\n');
		}

		return frontmatterStr;
	}

	/**
	 * 批量修改多个文件
	 */
	async batchModify(
		filePaths: string[],
		operations: BatchEditOperation[]
	): Promise<{ success: number; failed: number }> {
		const originalContents = new Map<string, string>();
		const affectedFiles: string[] = [];

		// 保存原始内容
		for (const path of filePaths) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file) {
				const content = await this.app.vault.read(file as any);
				originalContents.set(path, content);
			}
		}

		let success = 0;
		let failed = 0;

		for (const path of filePaths) {
			const result = await this.modifyFrontmatter(path, operations);
			if (result) {
				success++;
				affectedFiles.push(path);
			} else {
				failed++;
			}
		}

		// 保存到历史记录
		if (success > 0) {
			this.history.push({
				operations,
				affectedFiles,
				originalContent: originalContents,
				timestamp: Date.now()
			});

			// 限制历史记录数量
			if (this.history.length > this.maxHistory) {
				this.history.shift();
			}
		}

		return { success, failed };
	}

	/**
	 * 撤销上一次操作
	 */
	async undo(): Promise<boolean> {
		if (this.history.length === 0) return false;

		const lastOperation = this.history.pop()!;
		let restored = 0;

		for (const [path, content] of lastOperation.originalContent) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file && lastOperation.affectedFiles.includes(path)) {
				await this.app.vault.modify(file as any, content);
				restored++;
			}
		}

		return restored > 0;
	}

	/**
	 * 是否可以撤销
	 */
	canUndo(): boolean {
		return this.history.length > 0;
	}
}
