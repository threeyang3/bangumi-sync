/**
 * 用户数据弹窗 UI
 *
 * 包含导出弹窗、导入弹窗、缺失字段处理弹窗
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import { UserDataExporter } from './userDataExporter';
import { UserDataImporter } from './userDataImporter';
import { ImportResult, MissingFieldDecision, ImportOptions, UserDataType, PropertyManageMap, ImportItemDiff, UserDataExport } from './types';
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
        // Step 1: 收集所有自定义属性名
        const propertyNames = this.importer.collectAllPropertyNames(this.importFiles);

        if (propertyNames.size > 0) {
            // Step 2: 弹出属性管理弹窗
            this.close();
            new PropertyManageModal(this.app, propertyNames, (propertyManage) => {
                void this.continueImport(propertyManage);
            }).open();
        } else {
            // 无自定义属性，直接走旧流程
            await this.continueImport(undefined);
        }
    }

    private async continueImport(propertyManage?: PropertyManageMap): Promise<void> {
        const options: ImportOptions = {
            mergeStrategy: 'smart',
            dataTypes: [UserDataType.ALL],
            propertyManage,
        };

        // Step 3: 对比导入数据
        const { autoImported, diffs } = await this.importer.compareImportData(
            this.importFiles,
            options
        );

        if (diffs.length > 0) {
            // Step 4: 有差异，弹出对比弹窗
            this.close();
            new ImportCompareModal(this.app, diffs, (resolvedDiffs) => {
                void (async () => {
                    const applied = await this.importer.applyImportDecisions(resolvedDiffs);
                    const result: ImportResult = {
                        success: applied + autoImported,
                        skipped: 0,
                        autoImported,
                        errors: [],
                        missingFields: [],
                    };
                    new ImportResultModal(this.app, result).open();
                })();
            }).open();
        } else if (autoImported > 0) {
            // 只有自动导入，无差异
            const result: ImportResult = {
                success: autoImported,
                skipped: 0,
                autoImported,
                errors: [],
                missingFields: [],
            };
            this.onImport(result);
            this.close();
        } else {
            // 无差异也无自动导入
            const result: ImportResult = {
                success: 0,
                skipped: this.importFiles.reduce((sum, f) => {
                    try {
                        const data = JSON.parse(f.content) as UserDataExport;
                        return sum + (data.items ? Object.keys(data.items).length : 0);
                    } catch {
                        return sum;
                    }
                }, 0),
                autoImported: 0,
                errors: [],
                missingFields: [],
            };
            this.onImport(result);
            this.close();
        }
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
 * 属性管理弹窗
 *
 * 导入前识别所有自定义属性，允许用户忽略或别名某个属性
 */
export class PropertyManageModal extends Modal {
    private propertyNames: Set<string>;
    private onConfirm: (propertyManage: PropertyManageMap) => void;
    private decisions: PropertyManageMap = {};

    constructor(
        app: App,
        propertyNames: Set<string>,
        onConfirm: (propertyManage: PropertyManageMap) => void
    ) {
        super(app);
        this.propertyNames = propertyNames;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('bangumi-property-manage-modal');

        contentEl.createEl('h2', { text: tn('userData', 'propertyManageTitle') });
        contentEl.createEl('p', {
            text: tn('userData', 'propertyManageDesc'),
            cls: 'bangumi-modal-desc',
        });

        // 表头
        const table = contentEl.createEl('table', { cls: 'bangumi-property-manage-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: tn('userData', 'propertyName') });
        headerRow.createEl('th', { text: tn('userData', 'ignore') });
        headerRow.createEl('th', { text: tn('userData', 'alias') });

        const tbody = table.createEl('tbody');

        for (const name of this.propertyNames) {
            const row = tbody.createEl('tr');

            // 属性名
            row.createEl('td', { text: name, cls: 'bangumi-property-manage-name' });

            // 忽略开关
            const ignoreCell = row.createEl('td');
            const ignoreCheckbox = ignoreCell.createEl('input', { type: 'checkbox' });
            ignoreCheckbox.addEventListener('change', () => {
                if (!this.decisions[name]) {
                    this.decisions[name] = { ignore: false };
                }
                this.decisions[name].ignore = ignoreCheckbox.checked;
            });

            // 别名输入框
            const aliasCell = row.createEl('td');
            const aliasInput = aliasCell.createEl('input', {
                type: 'text',
                placeholder: name,
                cls: 'bangumi-property-manage-alias-input',
            });
            aliasInput.addEventListener('input', () => {
                const alias = aliasInput.value.trim();
                if (!this.decisions[name]) {
                    this.decisions[name] = { ignore: false };
                }
                this.decisions[name].aliasTo = alias || undefined;
            });
        }

        // 按钮
        const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
        buttonDiv.createEl('button', { text: tn('userData', 'cancel') }, btn => {
            btn.addEventListener('click', () => this.close());
        });
        buttonDiv.createEl('button', {
            text: tn('userData', 'continueImport'),
            cls: 'mod-cta',
        }, btn => {
            btn.addEventListener('click', () => {
                this.onConfirm(this.decisions);
                this.close();
            });
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

/**
 * 导入对比弹窗
 *
 * 显示有差异的条目，让用户逐个选择保留本地/导入/跳过
 */
export class ImportCompareModal extends Modal {
    private diffs: ImportItemDiff[];
    private onConfirm: (diffs: ImportItemDiff[]) => void;

    constructor(
        app: App,
        diffs: ImportItemDiff[],
        onConfirm: (diffs: ImportItemDiff[]) => void
    ) {
        super(app);
        this.diffs = diffs;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.addClass('bangumi-import-compare-modal');

        contentEl.createEl('h2', { text: tn('userData', 'compareTitle') });
        contentEl.createEl('p', {
            text: tnFormat('userData', 'compareDesc', { count: this.diffs.length }),
            cls: 'bangumi-modal-desc',
        });

        // 批量操作
        const actionBar = contentEl.createDiv({ cls: 'bangumi-import-compare-actions' });
        actionBar.createEl('button', { text: tn('userData', 'allLocal') }, btn => {
            btn.addEventListener('click', () => this.batchDecision('local'));
        });
        actionBar.createEl('button', { text: tn('userData', 'allImport') }, btn => {
            btn.addEventListener('click', () => this.batchDecision('import'));
        });
        actionBar.createEl('button', { text: tn('userData', 'allSkip') }, btn => {
            btn.addEventListener('click', () => this.batchDecision('skip'));
        });

        // 差异列表
        const listEl = contentEl.createDiv({ cls: 'bangumi-import-compare-list' });
        this.renderDiffList(listEl);

        // 执行按钮
        const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
        buttonDiv.createEl('button', { text: tn('userData', 'cancel') }, btn => {
            btn.addEventListener('click', () => this.close());
        });
        buttonDiv.createEl('button', {
            text: tn('userData', 'executeImport'),
            cls: 'mod-cta',
        }, btn => {
            btn.addEventListener('click', () => {
                this.onConfirm(this.diffs);
                this.close();
            });
        });
    }

    private renderDiffList(container: HTMLElement): void {
        for (const item of this.diffs) {
            const itemEl = container.createDiv({ cls: 'bangumi-import-compare-item' });

            // 条目标题行
            const headerRow = itemEl.createDiv({ cls: 'bangumi-import-compare-header' });
            headerRow.createEl('span', {
                text: `${item.name_cn} (ID: ${item.subjectId})`,
                cls: 'bangumi-import-compare-subject',
            });
            headerRow.createEl('span', {
                text: tnFormat('userData', 'diffFieldCount', { count: item.diffs.length }),
                cls: 'bangumi-import-compare-diff-count',
            });

            // 展开/折叠按钮
            const expandBtn = headerRow.createEl('button', {
                text: tn('statusSyncModal', 'expand'),
                cls: 'bangumi-import-compare-expand-btn',
            });

            // 差异详情（默认隐藏）
            const detailEl = itemEl.createDiv({ cls: 'bangumi-import-compare-detail bangumi-hidden' });

            expandBtn.addEventListener('click', () => {
                const isHidden = detailEl.hasClass('bangumi-hidden');
                detailEl.toggleClass('bangumi-hidden', !isHidden);
                expandBtn.textContent = isHidden
                    ? tn('statusSyncModal', 'collapse')
                    : tn('statusSyncModal', 'expand');
            });

            // 差异表格
            const table = detailEl.createEl('table', { cls: 'bangumi-import-compare-table' });
            const thead = table.createEl('thead');
            const headerTr = thead.createEl('tr');
            headerTr.createEl('th', { text: tn('userData', 'field') });
            headerTr.createEl('th', { text: tn('userData', 'localValue') });
            headerTr.createEl('th', { text: tn('userData', 'importValue') });
            headerTr.createEl('th', { text: tn('userData', 'decision') });

            const tbody = table.createEl('tbody');
            for (let j = 0; j < item.diffs.length; j++) {
                const diff = item.diffs[j];
                const tr = tbody.createEl('tr');

                tr.createEl('td', { text: diff.fieldName });
                const localText = diff.localValue != null && diff.localValue !== ''
                    ? formatDisplayValue(diff.localValue)
                    : tn('statusSyncModal', 'empty');
                const importText = diff.importValue != null && diff.importValue !== ''
                    ? formatDisplayValue(diff.importValue)
                    : tn('statusSyncModal', 'empty');
                tr.createEl('td', {
                    text: localText,
                    cls: 'bangumi-import-compare-value',
                });
                tr.createEl('td', {
                    text: importText,
                    cls: 'bangumi-import-compare-value',
                });

                // 决策下拉
                const selectCell = tr.createEl('td');
                const select = selectCell.createEl('select', { cls: 'bangumi-import-compare-select' });
                select.createEl('option', { value: 'local', text: tn('userData', 'keepLocal') });
                select.createEl('option', { value: 'import', text: tn('userData', 'keepImport') });
                select.createEl('option', { value: 'skip', text: tn('userData', 'skip') });
                select.value = 'skip';

                select.addEventListener('change', () => {
                    diff.decision = select.value as 'local' | 'import' | 'skip';
                });
            }
        }
    }

    private batchDecision(decision: 'local' | 'import' | 'skip'): void {
        for (const item of this.diffs) {
            for (const diff of item.diffs) {
                diff.decision = decision;
            }
        }

        // 更新所有 select 元素
        const selects = this.contentEl.querySelectorAll<HTMLSelectElement>('.bangumi-import-compare-select');
        selects.forEach(select => {
            select.value = decision;
        });
    }

    onClose(): void {
        this.contentEl.empty();
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
        if (this.result.autoImported > 0) {
            statsEl.createEl('div', { text: tnFormat('userData', 'autoImported', { count: this.result.autoImported }) });
        }
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

function formatDisplayValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object' && value !== null) return JSON.stringify(value);
    return '';
}
