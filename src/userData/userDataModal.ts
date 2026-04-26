/**
 * 用户数据弹窗 UI
 *
 * 包含导出弹窗、导入弹窗、缺失字段处理弹窗
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import { UserDataExporter } from './userDataExporter';
import { UserDataImporter } from './userDataImporter';
import { ImportResult, MissingFieldDecision, ImportOptions, UserDataType } from './types';
import { tn, tnFormat } from '../i18n';

/**
 * 用户数据导出弹窗
 */
export class UserDataExportModal extends Modal {
    private exporter: UserDataExporter;
    private scanFolderPath: string;
    private outputDir: string;
    private onExport: (files: string[]) => void;

    constructor(
        app: App,
        scanFolderPath: string,
        onExport: (files: string[]) => void
    ) {
        super(app);
        this.exporter = new UserDataExporter(app);
        this.scanFolderPath = scanFolderPath;
        this.outputDir = scanFolderPath;
        this.onExport = onExport;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('bangumi-user-data-export');

        // 标题
        contentEl.createEl('h2', { text: tn('userData', 'exportTitle') });

        // 说明
        contentEl.createEl('p', {
            text: tn('userData', 'exportDesc'),
            cls: 'bangumi-modal-desc'
        });

        // 扫描文件夹路径
        new Setting(contentEl)
            .setName(tn('userData', 'scanFolder'))
            .setDesc(tn('userData', 'scanFolderDesc'))
            .addText(text => {
                text.setValue(this.scanFolderPath)
                    .onChange(value => {
                        this.scanFolderPath = value;
                    });
            });

        // 输出目录
        new Setting(contentEl)
            .setName(tn('userData', 'outputDir'))
            .setDesc(tn('userData', 'outputDirDesc'))
            .addText(text => {
                text.setValue(this.outputDir)
                    .onChange(value => {
                        this.outputDir = value;
                    });
            });

        // 操作按钮
        const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

        buttonDiv.createEl('button', { text: tn('userData', 'cancel') }, btn => {
            btn.addEventListener('click', () => this.close());
        });

        buttonDiv.createEl('button', {
            text: tn('userData', 'export'),
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', () => void this.doExport());
        });
    }

    private async doExport(): Promise<void> {
        const result = await this.exporter.exportBySubjectType(
            this.scanFolderPath,
            this.outputDir
        );

        if (result.success && result.files.length > 0) {
            new Notice(tnFormat('userData', 'exportSuccess', { count: result.files.length }));
            this.onExport(result.files);
            this.close();
        } else {
            new Notice(tnFormat('userData', 'exportFailed', { error: result.error || 'Unknown error' }));
        }
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * 用户数据导入弹窗
 */
export class UserDataImportModal extends Modal {
    private importer: UserDataImporter;
    private importFiles: Array<{ name: string; content: string }>;
    private onImport: (result: ImportResult) => void;

    constructor(
        app: App,
        importFiles: Array<{ name: string; content: string }>,
        onImport: (result: ImportResult) => void
    ) {
        super(app);
        this.importer = new UserDataImporter(app);
        this.importFiles = importFiles;
        this.onImport = onImport;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('bangumi-user-data-import');

        // 标题
        contentEl.createEl('h2', { text: tn('userData', 'importTitle') });

        // 说明
        contentEl.createEl('p', {
            text: tn('userData', 'importDesc'),
            cls: 'bangumi-modal-desc'
        });

        // 显示导入文件列表
        const fileListEl = contentEl.createDiv({ cls: 'bangumi-import-file-list' });
        for (const file of this.importFiles) {
            fileListEl.createEl('div', { text: file.name, cls: 'bangumi-import-file-item' });
        }

        // 操作按钮
        const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });

        buttonDiv.createEl('button', { text: tn('userData', 'cancel') }, btn => {
            btn.addEventListener('click', () => this.close());
        });

        buttonDiv.createEl('button', {
            text: tn('userData', 'import'),
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', () => void this.doImport());
        });
    }

    private async doImport(): Promise<void> {
        const options: ImportOptions = {
            mergeStrategy: 'smart',
            dataTypes: [UserDataType.ALL],
        };

        const result = await this.importer.importFromTexts(this.importFiles, options);

        if (result.success === 0 && result.skipped === 0 && result.missingFields.length === 0 && result.errors.length === 0) {
            new Notice(tnFormat('userData', 'importFailed', { error: 'No data imported' }));
            return;
        }

        this.onImport(result);
        this.close();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * 缺失字段处理弹窗
 */
export class MissingFieldModal extends Modal {
    private missingFields: MissingFieldDecision[];
    private decisions: Map<number, 'add' | 'skip'> = new Map();
    private onResolve: (decisions: MissingFieldDecision[]) => void;

    constructor(
        app: App,
        missingFields: MissingFieldDecision[],
        onResolve: (decisions: MissingFieldDecision[]) => void
    ) {
        super(app);
        this.missingFields = missingFields;
        this.onResolve = onResolve;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('bangumi-missing-field');

        // 标题
        contentEl.createEl('h2', { text: tn('userData', 'missingFieldTitle') });

        // 说明
        contentEl.createEl('p', {
            text: tn('userData', 'missingFieldDesc'),
            cls: 'bangumi-modal-desc'
        });

        // 快捷操作
        const quickDiv = contentEl.createDiv({ cls: 'bangumi-missing-field-quick' });
        quickDiv.createEl('button', { text: tn('userData', 'addAll') }, btn => {
            btn.addEventListener('click', () => this.resolveAll('add'));
        });
        quickDiv.createEl('button', { text: tn('userData', 'skipAll') }, btn => {
            btn.addEventListener('click', () => this.resolveAll('skip'));
        });

        // 缺失字段列表
        const listEl = contentEl.createDiv({ cls: 'bangumi-missing-field-list' });
        this.renderFieldList(listEl);

        // 确认按钮
        const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
        buttonDiv.createEl('button', {
            text: tn('userData', 'confirm'),
            cls: 'mod-cta'
        }, btn => {
            btn.addEventListener('click', () => this.doResolve());
        });
    }

    private renderFieldList(container: HTMLElement): void {
        for (let i = 0; i < this.missingFields.length; i++) {
            const field = this.missingFields[i];
            const itemEl = container.createDiv({ cls: 'bangumi-missing-field-item' });

            // 条目信息
            itemEl.createEl('div', {
                text: `${field.subjectName} (ID: ${field.subjectId})`,
                cls: 'bangumi-missing-field-subject'
            });

            // 字段信息
            const fieldInfoEl = itemEl.createDiv({ cls: 'bangumi-missing-field-info' });
            fieldInfoEl.createEl('span', { text: `${field.fieldName}: ` });
            fieldInfoEl.createEl('span', { text: String(field.fieldValue), cls: 'bangumi-missing-field-value' });

            // 操作按钮
            const actionEl = itemEl.createDiv({ cls: 'bangumi-missing-field-actions' });
            actionEl.createEl('button', { text: tn('userData', 'addField') }, btn => {
                btn.addEventListener('click', () => {
                    this.decisions.set(i, 'add');
                    itemEl.addClass('bangumi-missing-field-resolved-add');
                });
            });
            actionEl.createEl('button', { text: tn('userData', 'skipField') }, btn => {
                btn.addEventListener('click', () => {
                    this.decisions.set(i, 'skip');
                    itemEl.addClass('bangumi-missing-field-resolved-skip');
                });
            });
        }
    }

    private resolveAll(decision: 'add' | 'skip'): void {
        for (let i = 0; i < this.missingFields.length; i++) {
            this.decisions.set(i, decision);
        }

        // 更新 UI
        const items = this.contentEl.querySelectorAll('.bangumi-missing-field-item');
        items.forEach(item => {
            item.addClass(`bangumi-missing-field-resolved-${decision}`);
        });
    }

    private doResolve(): void {
        const resolvedDecisions: MissingFieldDecision[] = [];

        for (let i = 0; i < this.missingFields.length; i++) {
            const decision = this.decisions.get(i) || 'skip';
            resolvedDecisions.push({
                ...this.missingFields[i],
                decision,
            });
        }

        this.onResolve(resolvedDecisions);
        this.close();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}

/**
 * 导入结果弹窗
 */
export class ImportResultModal extends Modal {
    private result: ImportResult;
    private importer: UserDataImporter;

    constructor(app: App, result: ImportResult) {
        super(app);
        this.result = result;
        this.importer = new UserDataImporter(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('bangumi-import-result');

        // 标题
        contentEl.createEl('h2', { text: tn('userData', 'importResultTitle') });

        // 统计信息
        const statsEl = contentEl.createDiv({ cls: 'bangumi-import-result-stats' });
        statsEl.createEl('div', { text: tnFormat('userData', 'importSuccess', { count: this.result.success }) });
        statsEl.createEl('div', { text: tnFormat('userData', 'importSkipped', { count: this.result.skipped }) });

        if (this.result.errors.length > 0) {
            statsEl.createEl('div', {
                text: tnFormat('userData', 'importErrors', { count: this.result.errors.length }),
                cls: 'bangumi-import-result-error'
            });
        }

        // 如果有缺失字段，显示处理弹窗
        if (this.result.missingFields.length > 0) {
            contentEl.createEl('p', {
                text: tnFormat('userData', 'missingFieldPrompt', { count: this.result.missingFields.length }),
            });

            const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
            buttonDiv.createEl('button', {
                text: tn('userData', 'handleMissingFields'),
                cls: 'mod-cta'
            }, btn => {
                btn.addEventListener('click', () => {
                    this.close();
                    const modal = new MissingFieldModal(
                        this.app,
                        this.result.missingFields,
                        (decisions) => void this.applyDecisions(decisions)
                    );
                    modal.open();
                });
            });

            buttonDiv.createEl('button', { text: tn('userData', 'skipMissingFields') }, btn => {
                btn.addEventListener('click', () => this.close());
            });
        } else {
            const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
            buttonDiv.createEl('button', {
                text: tn('userData', 'close'),
                cls: 'mod-cta'
            }, btn => {
                btn.addEventListener('click', () => this.close());
            });
        }
    }

    private async applyDecisions(decisions: MissingFieldDecision[]): Promise<void> {
        await this.importer.applyMissingFieldDecisions(decisions);
        new Notice(tnFormat('userData', 'missingFieldsApplied', { count: decisions.filter(d => d.decision === 'add').length }));
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }
}
