/**
 * 用户数据弹窗 UI
 *
 * 包含导出弹窗、导入弹窗、缺失字段处理弹窗
 */

import { App, Modal, Setting, Notice } from 'obsidian';
import { UserDataExporter } from './userDataExporter';
import { UserDataImporter } from './userDataImporter';
import { ImportResult, MissingFieldDecision, ImportOptions, UserDataType, PropertyManageMap, ImportItemDiff } from './types';
import { tn, tnFormat } from '../i18n';

type ImportMode = 'item' | 'property';

interface PropertyReviewGroup {
    fieldName: string;
    diffs: Array<{
        kind: 'diff';
        item: ImportItemDiff;
        diff: ImportItemDiff['diffs'][number];
    }>;
    missingFields: MissingFieldDecision[];
}

const DEFAULT_EXPORT_DATA_TYPES: UserDataType[] = [
    UserDataType.USER_PROPERTIES,
    UserDataType.CUSTOM_PROPERTIES,
    UserDataType.BODY_CONTENT,
];

/**
 * 用户数据导出弹窗
 */
export class UserDataExportModal extends Modal {
    private exporter: UserDataExporter;
    private scanFolderPath: string;
    private outputDir: string;
    private exportDataTypes: UserDataType[] = [...DEFAULT_EXPORT_DATA_TYPES];
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

        contentEl.createEl('h3', { text: tn('userData', 'exportDataTypes') });
        contentEl.createEl('p', {
            text: tn('userData', 'exportDataTypesDesc'),
            cls: 'bangumi-modal-desc',
        });
        this.addDataTypeToggle(contentEl, UserDataType.USER_PROPERTIES, 'userProperties', 'userPropertiesDesc');
        this.addDataTypeToggle(contentEl, UserDataType.CUSTOM_PROPERTIES, 'customProperties', 'customPropertiesDesc');
        this.addDataTypeToggle(contentEl, UserDataType.BODY_CONTENT, 'bodyContent', 'bodyContentDesc');

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
        if (this.exportDataTypes.length === 0) {
            new Notice(tn('userData', 'selectAtLeastOneDataType'));
            return;
        }

		const result = await this.exporter.exportByCategory(
			this.scanFolderPath,
			this.outputDir,
			this.exportDataTypes
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

    private addDataTypeToggle(
        container: HTMLElement,
        dataType: UserDataType,
        nameKey: 'userProperties' | 'customProperties' | 'bodyContent',
        descKey: 'userPropertiesDesc' | 'customPropertiesDesc' | 'bodyContentDesc'
    ): void {
        new Setting(container)
            .setName(tn('userData', nameKey))
            .setDesc(tn('userData', descKey))
            .addToggle(toggle => {
                toggle
                    .setValue(this.exportDataTypes.includes(dataType))
                    .onChange(value => {
                        this.exportDataTypes = updateDataTypeSelection(this.exportDataTypes, dataType, value);
                    });
            });
    }
}

/**
 * 用户数据导入弹窗
 */
export class UserDataImportModal extends Modal {
    private importer: UserDataImporter;
    private importFiles: Array<{ name: string; content: string }>;
    private onImport: (result: ImportResult) => void;
    private mergeStrategy: ImportOptions['mergeStrategy'] = 'smart';
    private importMode: ImportMode = 'item';
    private importDataTypes: UserDataType[] = [...DEFAULT_EXPORT_DATA_TYPES];

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

        new Setting(contentEl)
            .setName(tn('userData', 'mergeStrategy'))
            .setDesc(tn('userData', 'mergeStrategyDesc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('prefer_local', tn('userData', 'preferLocal'))
                    .addOption('prefer_import', tn('userData', 'preferImport'))
                    .addOption('smart', tn('userData', 'smartMerge'))
                    .setValue(this.mergeStrategy)
                    .onChange(value => {
                        this.mergeStrategy = value as ImportOptions['mergeStrategy'];
                    });
            });

        new Setting(contentEl)
            .setName(tn('userData', 'importMode'))
            .setDesc(tn('userData', 'importModeDesc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('item', tn('userData', 'itemImportMode'))
                    .addOption('property', tn('userData', 'propertyImportMode'))
                    .setValue(this.importMode)
                    .onChange(value => {
                        this.importMode = value as ImportMode;
                    });
            });

        contentEl.createEl('h3', { text: tn('userData', 'importDataTypes') });
        contentEl.createEl('p', {
            text: tn('userData', 'importDataTypesDesc'),
            cls: 'bangumi-modal-desc'
        });
        this.addDataTypeToggle(contentEl, UserDataType.USER_PROPERTIES, 'userProperties', 'userPropertiesDesc');
        this.addDataTypeToggle(contentEl, UserDataType.CUSTOM_PROPERTIES, 'customProperties', 'customPropertiesDesc');
        this.addDataTypeToggle(contentEl, UserDataType.BODY_CONTENT, 'bodyContent', 'bodyContentDesc');

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
        if (this.importDataTypes.length === 0) {
            new Notice(tn('userData', 'selectAtLeastOneDataType'));
            return;
        }

        const dataTypeOptions = { dataTypes: this.importDataTypes };
        // Step 1: 收集所有自定义属性名
        const propertyNames = this.importer.collectAllPropertyNames(this.importFiles, dataTypeOptions);
        const suggestedAliases = this.importer.getSuggestedPropertyAliases(this.importFiles, dataTypeOptions);

        if (propertyNames.size > 0) {
            // Step 2: 弹出属性管理弹窗
            this.close();
            new PropertyManageModal(this.app, propertyNames, suggestedAliases, (propertyManage) => {
                void this.continueImport(propertyManage);
            }).open();
        } else {
            // 无自定义属性，直接走旧流程
            await this.continueImport(undefined);
        }
    }

    private async continueImport(propertyManage?: PropertyManageMap): Promise<void> {
        const options: ImportOptions = {
            mergeStrategy: this.mergeStrategy,
            dataTypes: this.importDataTypes,
            propertyManage,
        };

        // Step 3: 对比导入数据
        const compareResult = await this.importer.compareImportData(
            this.importFiles,
            options
        );
        const { autoImported, diffs, missingFields, errors, skipped } = compareResult;

        if (diffs.length > 0) {
            this.close();

            if (this.importMode === 'property') {
                const propertyGroups = groupByProperty(diffs, missingFields);
                new PropertyImportReviewModal(this.app, propertyGroups, (resolvedDiffs, resolvedMissingFields) => {
                    void (async () => {
                        await this.finishImport(options, resolvedDiffs, resolvedMissingFields, {
                            autoImported,
                            errors,
                            skipped,
                        });
                    })();
                }).open();
                return;
            }

            // Step 4: 有差异，弹出对比弹窗
            new ImportCompareModal(this.app, diffs, (resolvedDiffs) => {
                void (async () => {
                    await this.finishImport(options, resolvedDiffs, missingFields, {
                        autoImported,
                        errors,
                        skipped,
                    });
                })();
            }).open();
        } else {
            if (this.importMode === 'property' && missingFields.length > 0) {
                this.close();
                const propertyGroups = groupByProperty([], missingFields);
                new PropertyImportReviewModal(this.app, propertyGroups, (resolvedDiffs, resolvedMissingFields) => {
                    void (async () => {
                        await this.finishImport(options, resolvedDiffs, resolvedMissingFields, {
                            autoImported,
                            errors,
                            skipped,
                        });
                    })();
                }).open();
                return;
            }

            await this.finishImport(options, [], missingFields, {
                autoImported,
                errors,
                skipped,
            });
        }
    }

    private async finishImport(
        options: ImportOptions,
        diffs: ImportItemDiff[],
        missingFields: MissingFieldDecision[],
        summary: {
            autoImported: number;
            errors: ImportResult['errors'];
            skipped: number;
        }
    ): Promise<void> {
        const finalize = async (resolvedMissingFields: MissingFieldDecision[]) => {
            const result = await this.importer.applyImportPlan(
                this.importFiles,
                options,
                diffs,
                resolvedMissingFields
            );
            result.autoImported = summary.autoImported;
            result.errors = [...summary.errors, ...result.errors];
            result.skipped = Math.max(summary.skipped, result.skipped);
            this.onImport(result);
        };

        if (missingFields.length > 0) {
            this.close();
            new MissingFieldModal(this.app, missingFields, (resolvedMissingFields) => {
                void finalize(resolvedMissingFields);
            }).open();
            return;
        }

        await finalize([]);
        this.close();
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
    }

    private addDataTypeToggle(
        container: HTMLElement,
        dataType: UserDataType,
        nameKey: 'userProperties' | 'customProperties' | 'bodyContent',
        descKey: 'userPropertiesDesc' | 'customPropertiesDesc' | 'bodyContentDesc'
    ): void {
        new Setting(container)
            .setName(tn('userData', nameKey))
            .setDesc(tn('userData', descKey))
            .addToggle(toggle => {
                toggle
                    .setValue(this.importDataTypes.includes(dataType))
                    .onChange(value => {
                        this.importDataTypes = updateDataTypeSelection(this.importDataTypes, dataType, value);
                    });
            });
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
        container.empty();
        for (let i = 0; i < this.missingFields.length; i++) {
            const field = this.missingFields[i];
            const currentDecision = this.decisions.get(i) || null;
            const itemEl = container.createDiv({ cls: 'bangumi-missing-field-item' });
            if (currentDecision) {
                itemEl.addClass(`bangumi-missing-field-resolved-${currentDecision}`);
            }

            // 条目信息
            itemEl.createEl('div', {
                text: `${field.subjectName} (ID: ${field.subjectId})`,
                cls: 'bangumi-missing-field-subject'
            });

            // 字段信息
            const fieldInfoEl = itemEl.createDiv({ cls: 'bangumi-missing-field-info' });
            fieldInfoEl.createEl('span', { text: `${field.fieldName}: ` });
            fieldInfoEl.createEl('span', { text: String(field.fieldValue), cls: 'bangumi-missing-field-value' });
            itemEl.createEl('div', {
                text: `${tn('userData', 'decision')}: ${missingDecisionLabel(currentDecision as MissingFieldDecision['decision'])}`,
                cls: 'bangumi-import-compare-diff-count',
            });

            // 操作按钮
            const actionEl = itemEl.createDiv({ cls: 'bangumi-missing-field-actions' });
            actionEl.createEl('button', {
                text: tn('userData', 'addField'),
                cls: currentDecision === 'add' ? 'mod-cta bangumi-decision-active' : '',
            }, btn => {
                btn.addEventListener('click', () => {
                    this.decisions.set(i, 'add');
                    this.renderFieldList(container);
                });
            });
            actionEl.createEl('button', {
                text: tn('userData', 'skipField'),
                cls: currentDecision === 'skip' ? 'mod-warning bangumi-decision-active' : '',
            }, btn => {
                btn.addEventListener('click', () => {
                    this.decisions.set(i, 'skip');
                    this.renderFieldList(container);
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
        const list = this.contentEl.querySelector('.bangumi-missing-field-list');
        if (list instanceof HTMLElement) {
            this.renderFieldList(list);
        } else {
            items.forEach(item => {
                item.addClass(`bangumi-missing-field-resolved-${decision}`);
            });
        }
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
    private suggestedAliases: Record<string, string>;
    private onConfirm: (propertyManage: PropertyManageMap) => void;
    private decisions: PropertyManageMap = {};

    constructor(
        app: App,
        propertyNames: Set<string>,
        suggestedAliases: Record<string, string>,
        onConfirm: (propertyManage: PropertyManageMap) => void
    ) {
        super(app);
        this.propertyNames = propertyNames;
        this.suggestedAliases = suggestedAliases;
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
                placeholder: this.suggestedAliases[name] || name,
                cls: 'bangumi-property-manage-alias-input',
            });
            const suggestedAlias = this.suggestedAliases[name];
            if (suggestedAlias) {
                aliasInput.value = suggestedAlias;
                this.decisions[name] = {
                    ignore: false,
                    aliasTo: suggestedAlias,
                };
            }
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
                select.createEl('option', { value: 'merge', text: tn('userData', 'smartMerge') });
                select.createEl('option', { value: 'skip', text: tn('userData', 'skip') });
                select.value = 'skip';

                select.addEventListener('change', () => {
                    diff.decision = select.value as 'local' | 'import' | 'merge' | 'skip';
                });
            }
        }
    }

    private batchDecision(decision: 'local' | 'import' | 'merge' | 'skip'): void {
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

export class PropertyImportReviewModal extends Modal {
    private propertyGroups: PropertyReviewGroup[];
    private currentIndex = 0;
    private onConfirm: (diffs: ImportItemDiff[], missingFields: MissingFieldDecision[]) => void;

    constructor(
        app: App,
        propertyGroups: PropertyReviewGroup[],
        onConfirm: (diffs: ImportItemDiff[], missingFields: MissingFieldDecision[]) => void
    ) {
        super(app);
        this.propertyGroups = propertyGroups;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('bangumi-property-import-review');

        if (this.propertyGroups.length === 0) {
            contentEl.createEl('h2', { text: tn('userData', 'propertyReviewTitle') });
            contentEl.createEl('p', { text: tn('userData', 'noDiff'), cls: 'bangumi-modal-desc' });
            const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
            buttonDiv.createEl('button', { text: tn('userData', 'close'), cls: 'mod-cta' }, btn => {
                btn.addEventListener('click', () => {
                    this.onConfirm([], []);
                    this.close();
                });
            });
            return;
        }

        const group = this.propertyGroups[this.currentIndex];

        contentEl.createEl('h2', { text: tn('userData', 'propertyReviewTitle') });
        contentEl.createEl('p', {
            text: tnFormat('userData', 'propertyReviewProgress', {
                current: this.currentIndex + 1,
                total: this.propertyGroups.length,
                field: group.fieldName,
            }),
            cls: 'bangumi-modal-desc',
        });

        const actionBar = contentEl.createDiv({ cls: 'bangumi-import-compare-actions' });
        actionBar.createEl('button', { text: tn('userData', 'allLocal') }, btn => {
            btn.addEventListener('click', () => this.applyGroupDecision(group, 'local'));
        });
        actionBar.createEl('button', { text: tn('userData', 'allImport') }, btn => {
            btn.addEventListener('click', () => this.applyGroupDecision(group, 'import'));
        });
        actionBar.createEl('button', { text: tn('userData', 'smartMerge') }, btn => {
            btn.addEventListener('click', () => this.applyGroupDecision(group, 'merge'));
        });
        actionBar.createEl('button', { text: tn('userData', 'allSkip') }, btn => {
            btn.addEventListener('click', () => this.applyGroupDecision(group, 'skip'));
        });

        const listEl = contentEl.createDiv({ cls: 'bangumi-import-compare-list' });
        for (const diffEntry of group.diffs) {
            const itemEl = listEl.createDiv({ cls: 'bangumi-import-compare-item' });
            itemEl.createEl('div', {
                text: `${diffEntry.item.name_cn} (ID: ${diffEntry.item.subjectId})`,
                cls: 'bangumi-import-compare-subject',
            });
            const table = itemEl.createEl('table', { cls: 'bangumi-import-compare-table' });
            const tbody = table.createEl('tbody');
            const tr = tbody.createEl('tr');
            tr.createEl('td', { text: tn('userData', 'localValue') });
            tr.createEl('td', {
                text: formatDisplayValue(diffEntry.diff.localValue),
                cls: 'bangumi-import-compare-value',
            });
            const tr2 = tbody.createEl('tr');
            tr2.createEl('td', { text: tn('userData', 'importValue') });
            tr2.createEl('td', {
                text: formatDisplayValue(diffEntry.diff.importValue),
                cls: 'bangumi-import-compare-value',
            });

            const decisionRow = itemEl.createDiv({ cls: 'bangumi-missing-field-actions' });
            addDecisionButton(decisionRow, tn('userData', 'keepLocal'), () => {
                diffEntry.diff.decision = 'local';
                this.render();
            });
            addDecisionButton(decisionRow, tn('userData', 'keepImport'), () => {
                diffEntry.diff.decision = 'import';
                this.render();
            });
            addDecisionButton(decisionRow, tn('userData', 'smartMerge'), () => {
                diffEntry.diff.decision = 'merge';
                this.render();
            });
            addDecisionButton(decisionRow, tn('userData', 'skip'), () => {
                diffEntry.diff.decision = 'skip';
                this.render();
            });
            itemEl.createEl('div', {
                text: `${tn('userData', 'decision')}: ${decisionLabel(diffEntry.diff.decision)}`,
                cls: 'bangumi-import-compare-diff-count',
            });
        }

        for (const missingField of group.missingFields) {
            const itemEl = listEl.createDiv({ cls: 'bangumi-missing-field-item' });
            itemEl.createEl('div', {
                text: `${missingField.subjectName} (ID: ${missingField.subjectId})`,
                cls: 'bangumi-missing-field-subject',
            });
            itemEl.createEl('div', {
                text: formatDisplayValue(missingField.fieldValue),
                cls: 'bangumi-missing-field-value',
            });
            const actionEl = itemEl.createDiv({ cls: 'bangumi-missing-field-actions' });
            addDecisionButton(actionEl, tn('userData', 'addField'), () => {
                missingField.decision = 'add';
                this.render();
            });
            addDecisionButton(actionEl, tn('userData', 'skipField'), () => {
                missingField.decision = 'skip';
                this.render();
            });
            itemEl.createEl('div', {
                text: `${tn('userData', 'decision')}: ${missingDecisionLabel(missingField.decision)}`,
                cls: 'bangumi-import-compare-diff-count',
            });
        }

        const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
        if (this.currentIndex > 0) {
            buttonDiv.createEl('button', { text: tn('userData', 'previousProperty') }, btn => {
                btn.addEventListener('click', () => {
                    this.currentIndex--;
                    this.render();
                });
            });
        }

        if (this.currentIndex < this.propertyGroups.length - 1) {
            buttonDiv.createEl('button', { text: tn('userData', 'nextProperty'), cls: 'mod-cta' }, btn => {
                btn.addEventListener('click', () => {
                    this.currentIndex++;
                    this.render();
                });
            });
        } else {
            buttonDiv.createEl('button', { text: tn('userData', 'executeImport'), cls: 'mod-cta' }, btn => {
                btn.addEventListener('click', () => {
                    this.onConfirm(extractDiffs(this.propertyGroups), extractMissingFields(this.propertyGroups));
                    this.close();
                });
            });
        }
    }

    private applyGroupDecision(group: PropertyReviewGroup, decision: 'local' | 'import' | 'merge' | 'skip'): void {
        for (const diff of group.diffs) {
            diff.diff.decision = decision;
        }
        for (const missingField of group.missingFields) {
            missingField.decision = decision === 'skip' || decision === 'local' ? 'skip' : 'add';
        }
        this.render();
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

function groupByProperty(diffs: ImportItemDiff[], missingFields: MissingFieldDecision[]): PropertyReviewGroup[] {
    const grouped = new Map<string, PropertyReviewGroup>();

    for (const item of diffs) {
        for (const diff of item.diffs) {
            const group = grouped.get(diff.fieldName) ?? {
                fieldName: diff.fieldName,
                diffs: [],
                missingFields: [],
            };
            group.diffs.push({
                kind: 'diff',
                item,
                diff,
            });
            grouped.set(diff.fieldName, group);
        }
    }

    for (const missingField of missingFields) {
        const group = grouped.get(missingField.fieldName) ?? {
            fieldName: missingField.fieldName,
            diffs: [],
            missingFields: [],
        };
        group.missingFields.push(missingField);
        grouped.set(missingField.fieldName, group);
    }

    return Array.from(grouped.values()).sort((left, right) => left.fieldName.localeCompare(right.fieldName, 'zh-CN'));
}

function extractDiffs(groups: PropertyReviewGroup[]): ImportItemDiff[] {
    const grouped = new Map<number, ImportItemDiff>();

    for (const group of groups) {
        for (const entry of group.diffs) {
            const existing = grouped.get(entry.item.subjectId) ?? {
                subjectId: entry.item.subjectId,
                name_cn: entry.item.name_cn,
                diffs: [],
                hasDiff: true,
            };
            existing.diffs.push(entry.diff);
            grouped.set(entry.item.subjectId, existing);
        }
    }

    return Array.from(grouped.values());
}

function extractMissingFields(groups: PropertyReviewGroup[]): MissingFieldDecision[] {
    return groups.flatMap(group => group.missingFields);
}

function addDecisionButton(container: HTMLElement, text: string, onClick: () => void): void {
    container.createEl('button', { text }, btn => {
        btn.addEventListener('click', onClick);
    });
}

function decisionLabel(decision: ImportItemDiff['diffs'][number]['decision']): string {
    switch (decision) {
        case 'local':
            return tn('userData', 'keepLocal');
        case 'import':
            return tn('userData', 'keepImport');
        case 'merge':
            return tn('userData', 'smartMerge');
        case 'skip':
            return tn('userData', 'skip');
        default:
            return tn('statusSyncModal', 'empty');
    }
}

function missingDecisionLabel(decision: MissingFieldDecision['decision']): string {
    switch (decision) {
        case 'add':
            return tn('userData', 'addField');
        case 'skip':
            return tn('userData', 'skipField');
        default:
            return tn('statusSyncModal', 'empty');
    }
}

function updateDataTypeSelection(
    selected: UserDataType[],
    dataType: UserDataType,
    enabled: boolean
): UserDataType[] {
    const next = new Set(selected);
    if (enabled) {
        next.add(dataType);
    } else {
        next.delete(dataType);
    }
    return Array.from(next);
}
