import { App, Modal, Notice } from 'obsidian';
import { CollectionType, SubjectType, getCollectionStatusLabel } from '../../common/api/types';
import { tn } from '../i18n';
import { StatusSyncService } from '../sync/statusSyncService';
import {
        FieldDecision,
        FieldDiff,
        PlatformFieldDiff,
        PlatformFieldDecision,
        StatusSyncDiff,
        StatusSyncFieldSelection,
        StatusSyncLoadState,
        hasSelectedPlatformFields,
        hasSelectedUserFields,
} from '../sync/statusSyncTypes';

type UserDecisionFieldKey = 'rate' | 'comment' | 'tags' | 'status' | 'episodeStatus';

export class StatusSyncModal extends Modal {
        private selection: StatusSyncFieldSelection;
        private diffs: StatusSyncDiff[];
        private diffIndexBySubjectId: Map<number, number>;
        private statusSyncService: StatusSyncService;
        private onComplete: () => void;

        private tableEl!: HTMLElement;
        private statusEl!: HTMLElement;
        private renderTimer: number | null = null;
        private isDisposedFlag = false;
        private backgroundCompleted = 0;
        private backgroundTotal = 0;

        constructor(
                app: App,
                statusSyncService: StatusSyncService,
                selection: StatusSyncFieldSelection,
                diffs: StatusSyncDiff[],
                onComplete: () => void,
        ) {
                super(app);
                this.statusSyncService = statusSyncService;
                this.selection = selection;
                this.diffs = diffs;
                this.diffIndexBySubjectId = new Map(diffs.map((diff, index) => [diff.subjectId, index]));
                this.onComplete = onComplete;
        }

        onOpen(): void {
                const { contentEl } = this;
                this.isDisposedFlag = false;
                contentEl.empty();
                contentEl.addClass('bangumi-status-sync-modal');

                contentEl.createEl('h2', { text: this.getTitle() });
                contentEl.createEl('p', {
                        text: this.getDescription().replace('{count}', String(this.diffs.length)),
                        cls: 'bangumi-sync-description',
                });

                const actionBar = contentEl.createDiv({ cls: 'bangumi-status-sync-actions' });
                actionBar.createEl('button', { text: tn('statusSyncModal', 'allCloud') }, button => {
                        button.addEventListener('click', () => this.selectAll('cloud'));
                });
                if (hasSelectedUserFields(this.selection)) {
                        actionBar.createEl('button', { text: tn('statusSyncModal', 'allLocal') }, button => {
                                button.addEventListener('click', () => this.selectAll('local'));
                        });
                        actionBar.createEl('button', { text: tn('statusSyncModal', 'smartMerge') }, button => {
                                button.addEventListener('click', () => this.smartMerge());
                        });
                }
                actionBar.createEl('button', { text: tn('statusSyncModal', 'allSkip') }, button => {
                        button.addEventListener('click', () => this.selectAll('skip'));
                });

                this.statusEl = contentEl.createDiv({ cls: 'bangumi-status-sync-status' });
                this.updateStatusSummary();

                this.tableEl = contentEl.createDiv({ cls: 'bangumi-status-sync-table' });
                this.renderTable();

                const footer = contentEl.createDiv({ cls: 'bangumi-status-sync-footer' });
                footer.createEl('button', { text: tn('statusSyncModal', 'execute'), cls: 'mod-cta' }, button => {
                        button.addEventListener('click', () => {
                                void this.executeSync();
                        });
                });
                footer.createEl('button', { text: tn('statusSyncModal', 'cancel') }, button => {
                        button.addEventListener('click', () => this.close());
                });
        }

        onClose(): void {
                this.isDisposedFlag = true;
                if (this.renderTimer !== null) {
                        this.getOwnerWindow().clearTimeout(this.renderTimer);
                        this.renderTimer = null;
                }
                this.contentEl.empty();
        }

        isDisposed(): boolean {
                return this.isDisposedFlag;
        }

        updateBackgroundProgress(completed: number, total: number): void {
                if (this.isDisposedFlag) {
                        return;
                }
                this.backgroundCompleted = completed;
                this.backgroundTotal = total;
                this.updateStatusSummary();
        }

        updateDiff(subjectId: number, patch: Partial<StatusSyncDiff>): void {
                if (this.isDisposedFlag) {
                        return;
                }

                const diffIndex = this.diffIndexBySubjectId.get(subjectId);
                if (diffIndex === undefined) {
                        return;
                }

                const diff = this.diffs[diffIndex];
                Object.assign(diff, patch);
                this.recalculateDiffState(diff);
                this.updateStatusSummary();
                this.scheduleRender();
        }

        private renderTable(): void {
                this.tableEl.empty();

                const visibleDiffs = this.getVisibleDiffs();
                if (visibleDiffs.length === 0) {
                        this.tableEl.createDiv({ text: tn('statusSyncModal', 'noDiff'), cls: 'bangumi-empty-message' });
                        return;
                }

                const table = this.tableEl.createEl('table');
                const thead = table.createEl('thead');
                const headerRow = thead.createEl('tr');
                headerRow.createEl('th', { text: tn('statusSyncModal', 'subjectName') });
                headerRow.createEl('th', { text: tn('statusSyncModal', 'diffFields') });
                headerRow.createEl('th', { text: tn('statusSyncModal', 'action') });

                const tbody = table.createEl('tbody');
                visibleDiffs.forEach(diff => {
                        const index = this.diffIndexBySubjectId.get(diff.subjectId);
                        if (index === undefined) {
                                return;
                        }

                        const row = tbody.createEl('tr', { cls: 'bangumi-status-row' });
                        const nameCell = row.createEl('td', { cls: 'bangumi-name-cell' });
                        nameCell.createSpan({ text: diff.name_cn || diff.name || 'Unknown' });
                        this.appendDiffIcons(nameCell, diff);

                        const fieldsCell = row.createEl('td', { cls: 'bangumi-fields-cell' });
                        const diffFields = this.getDiffFields(diff);
                        fieldsCell.setText(diffFields.length > 0 ? diffFields.join('/') : this.getLoadingHint(diff));

                        const actionCell = row.createEl('td', { cls: 'bangumi-action-cell' });
                        actionCell.createEl('button', {
                                text: diff.expanded ? tn('statusSyncModal', 'collapse') : tn('statusSyncModal', 'expand'),
                                cls: 'bangumi-expand-btn',
                        }, button => {
                                button.addEventListener('click', () => {
                                        this.diffs[index].expanded = !this.diffs[index].expanded;
                                        this.renderTable();
                                });
                        });

                        if (diff.expanded) {
                                const detailRow = tbody.createEl('tr', { cls: 'bangumi-detail-row' });
                                const detailCell = detailRow.createEl('td', { attr: { colspan: '3' } });
                                this.renderDetailTable(detailCell, diff, index);
                        }
                });
        }

        private appendDiffIcons(el: HTMLElement, diff: StatusSyncDiff): void {
                const icons: string[] = [];
                if (this.selection.user.rate && diff.rate.hasDiff) icons.push('⭐');
                if (this.selection.user.comment && diff.comment.hasDiff) icons.push('📝');
                if (this.selection.user.tags && diff.tags.hasDiff) icons.push('🏷️');
                if (this.selection.user.status && diff.status.hasDiff) icons.push('📊');
                if (this.selection.user.episodeStatus && diff.episodeStatus.hasDiff) icons.push('🎞️');
                if (diff.hasPlatformDiff) icons.push('📚');
                if (icons.length > 0) {
                        el.createSpan({ text: ` ${icons.join('')}`, cls: 'bangumi-diff-icons' });
                }
        }

        private getDiffFields(diff: StatusSyncDiff): string[] {
                const fields: string[] = [];
                if (this.selection.user.rate && diff.rate.hasDiff) fields.push(tn('statusSyncModal', 'fieldRate'));
                if (this.selection.user.comment && diff.comment.hasDiff) fields.push(tn('statusSyncModal', 'fieldComment'));
                if (this.selection.user.tags && diff.tags.hasDiff) fields.push(tn('statusSyncModal', 'fieldTags'));
                if (this.selection.user.status && diff.status.hasDiff) fields.push(tn('statusSyncModal', 'fieldStatus'));
                if (this.selection.user.episodeStatus && diff.episodeStatus.hasDiff) fields.push(tn('statusSyncModal', 'fieldEpisodeStatus'));
                for (const platformField of diff.platformFields) {
                        if (platformField.hasDiff) {
                                fields.push(platformField.label);
                        }
                }
                return fields;
        }

        private getVisibleDiffs(): StatusSyncDiff[] {
                return this.diffs.filter(diff => diff.hasAnyDiff || this.isDiffLoading(diff));
        }

        private isDiffLoading(diff: StatusSyncDiff): boolean {
                return diff.episodeStatusLoadState !== 'ready' || diff.platformLoadState !== 'ready';
        }

        private getLoadingHint(diff: StatusSyncDiff): string {
                if (diff.backgroundError) {
                        return this.getLoadStateText('failed');
                }
                if (diff.episodeStatusLoadState === 'loading' || diff.platformLoadState === 'loading') {
                        return this.getLoadStateText('loading');
                }
                if (this.isDiffLoading(diff)) {
                        return this.getLoadStateText('pending');
                }
                return tn('statusSyncModal', 'noDiff');
        }

        private renderDetailTable(el: HTMLElement, diff: StatusSyncDiff, index: number): void {
                const detailTable = el.createEl('table', { cls: 'bangumi-detail-table' });
                const thead = detailTable.createEl('thead');
                const headerRow = thead.createEl('tr');
                headerRow.createEl('th', { text: tn('statusSyncModal', 'field') });
                headerRow.createEl('th', { text: tn('statusSyncModal', 'local') });
                headerRow.createEl('th', { text: tn('statusSyncModal', 'cloud') });
                headerRow.createEl('th', { text: tn('statusSyncModal', 'decision') });

                const tbody = detailTable.createEl('tbody');
                if (diff.hasUserDiff) {
                        this.renderSectionHeader(tbody, tn('statusSyncModal', 'userDataGroup'));
                }

                if (this.selection.user.rate && diff.rate.hasDiff) {
                        this.renderFieldRow(
                                tbody,
                                tn('statusSyncModal', 'fieldRate'),
                                diff.rate.localValue ? String(diff.rate.localValue) : tn('statusSyncModal', 'empty'),
                                diff.rate.cloudValue ? String(diff.rate.cloudValue) : tn('statusSyncModal', 'empty'),
                                'rate',
                                index,
                                false,
                        );
                }

                if (this.selection.user.comment && diff.comment.hasDiff) {
                        this.renderFieldRow(
                                tbody,
                                tn('statusSyncModal', 'fieldComment'),
                                diff.comment.localValue || tn('statusSyncModal', 'empty'),
                                diff.comment.cloudValue || tn('statusSyncModal', 'empty'),
                                'comment',
                                index,
                                false,
                        );
                }

                if (this.selection.user.tags && diff.tags.hasDiff) {
                        this.renderFieldRow(
                                tbody,
                                tn('statusSyncModal', 'fieldTags'),
                                diff.tags.localValue ? diff.tags.localValue.join(', ') : tn('statusSyncModal', 'empty'),
                                diff.tags.cloudValue ? diff.tags.cloudValue.join(', ') : tn('statusSyncModal', 'empty'),
                                'tags',
                                index,
                                true,
                        );
                }

                if (this.selection.user.status && diff.status.hasDiff) {
                        this.renderFieldRow(
                                tbody,
                                tn('statusSyncModal', 'fieldStatus'),
                                this.getStatusText(diff.status.localValue, diff.collection.subject_type),
                                this.getStatusText(diff.status.cloudValue, diff.collection.subject_type),
                                'status',
                                index,
                                false,
                        );
                }

                if (this.selection.user.episodeStatus && diff.episodeStatus.hasDiff) {
                        this.renderFieldRow(
                                tbody,
                                tn('statusSyncModal', 'fieldEpisodeStatus'),
                                diff.episodeStatus.localValue || tn('statusSyncModal', 'empty'),
                                diff.episodeStatus.cloudValue || tn('statusSyncModal', 'empty'),
                                'episodeStatus',
                                index,
                                false,
                        );
                } else if (this.selection.user.episodeStatus && diff.episodeStatusLoadState !== 'ready') {
                        this.renderLoadingRow(tbody, tn('statusSyncModal', 'fieldEpisodeStatus'), diff.episodeStatusLoadState);
                }

                if (diff.hasPlatformDiff) {
                        this.renderSectionHeader(tbody, tn('statusSyncModal', 'platformDataGroup'));
                        diff.platformFields
                                .filter(field => field.hasDiff)
                                .forEach(field => this.renderPlatformFieldRow(tbody, field, index));
                } else if (hasSelectedPlatformFields(this.selection) && diff.platformLoadState !== 'ready') {
                        this.renderSectionHeader(tbody, tn('statusSyncModal', 'platformDataGroup'));
                        this.renderLoadingRow(tbody, tn('statusSyncModal', 'platformDataGroup'), diff.platformLoadState);
                }

                if (diff.backgroundError) {
                        const row = tbody.createEl('tr');
                        row.createEl('td', { text: tn('statusSyncModal', 'backgroundLoading'), cls: 'bangumi-field-name' });
                        row.createEl('td', { text: diff.backgroundError, attr: { colspan: '3' } });
                }
        }

        private renderSectionHeader(tbody: HTMLElement, text: string): void {
                const row = tbody.createEl('tr', { cls: 'bangumi-detail-section-row' });
                row.createEl('td', { text, attr: { colspan: '4' }, cls: 'bangumi-field-name' });
        }

        private renderFieldRow(
                tbody: HTMLElement,
                fieldName: string,
                localValue: string,
                cloudValue: string,
                fieldKey: UserDecisionFieldKey,
                diffIndex: number,
                supportMerge: boolean,
        ): void {
                const fieldDiff = this.getUserDecisionField(this.diffs[diffIndex], fieldKey);
                const row = tbody.createEl('tr');
                row.createEl('td', { text: fieldName, cls: 'bangumi-field-name' });
                row.createEl('td', { text: localValue, cls: 'bangumi-local-value bangumi-sync-value' });
                row.createEl('td', { text: cloudValue, cls: 'bangumi-cloud-value bangumi-sync-value' });

                const decisionCell = row.createEl('td');
                const select = decisionCell.createEl('select', { cls: 'bangumi-sync-decision-select' });
                select.createEl('option', { value: 'skip', text: tn('statusSyncModal', 'skip') });
                select.createEl('option', { value: 'local', text: tn('statusSyncModal', 'keepLocal') });
                select.createEl('option', { value: 'cloud', text: tn('statusSyncModal', 'keepCloud') });
                if (supportMerge) {
                        select.createEl('option', { value: 'merge', text: tn('statusSyncModal', 'merge') });
                }
                select.value = fieldDiff.decision;
                select.addEventListener('change', () => {
                        fieldDiff.decision = select.value as FieldDecision;
                });
        }

        private renderPlatformFieldRow(
                tbody: HTMLElement,
                field: PlatformFieldDiff,
                diffIndex: number,
        ): void {
                const row = tbody.createEl('tr');
                row.createEl('td', { text: field.label, cls: 'bangumi-field-name' });
                row.createEl('td', { text: field.localValue || tn('statusSyncModal', 'empty'), cls: 'bangumi-local-value bangumi-sync-value' });
                row.createEl('td', { text: field.cloudValue || tn('statusSyncModal', 'empty'), cls: 'bangumi-cloud-value bangumi-sync-value' });

                const decisionCell = row.createEl('td');
                const select = decisionCell.createEl('select', { cls: 'bangumi-sync-decision-select' });
                select.createEl('option', { value: 'skip', text: tn('statusSyncModal', 'skip') });
                select.createEl('option', { value: 'cloud', text: tn('statusSyncModal', 'keepCloudOnly') });
                select.value = field.decision;
                select.addEventListener('change', () => {
                        const platformField = this.diffs[diffIndex].platformFields.find(item => item.key === field.key);
                        if (platformField) {
                                platformField.decision = select.value as PlatformFieldDecision;
                        }
                });
        }

        private renderLoadingRow(tbody: HTMLElement, fieldName: string, state: StatusSyncLoadState): void {
                const row = tbody.createEl('tr');
                row.createEl('td', { text: fieldName, cls: 'bangumi-field-name' });
                row.createEl('td', { text: this.getLoadStateText(state), attr: { colspan: '3' } });
        }

        private getStatusText(status: number | null, subjectType: SubjectType): string {
                if (status === null) return tn('statusSyncModal', 'empty');
                const validStatus = this.toValidCollectionType(status);
                if (validStatus === null) {
                        return tn('statusSyncModal', 'empty');
                }
                return getCollectionStatusLabel(validStatus, subjectType, true) || tn('statusSyncModal', 'empty');
        }

        private getUserDecisionField(diff: StatusSyncDiff, fieldKey: UserDecisionFieldKey): FieldDiff<number> | FieldDiff<string> | FieldDiff<string[]> {
                switch (fieldKey) {
                        case 'rate':
                                return diff.rate;
                        case 'comment':
                                return diff.comment;
                        case 'tags':
                                return diff.tags;
                        case 'status':
                                return diff.status;
                        case 'episodeStatus':
                                return diff.episodeStatus;
                }
        }

        private toValidCollectionType(value: number): CollectionType | null {
                switch (value) {
                        case 1:
                                return CollectionType.Wish;
                        case 2:
                                return CollectionType.Done;
                        case 3:
                                return CollectionType.Doing;
                        case 4:
                                return CollectionType.OnHold;
                        case 5:
                                return CollectionType.Dropped;
                        default:
                                return null;
                }
        }

        private selectAll(decision: FieldDecision): void {
                if (!hasSelectedUserFields(this.selection) && hasSelectedPlatformFields(this.selection)) {
                        this.diffs.forEach(diff => {
                                diff.platformFields.forEach(field => {
                                        field.decision = decision === 'cloud' ? 'cloud' : 'skip';
                                });
                        });
                } else {
                        this.statusSyncService.applyDecisionPreset(this.diffs, decision);
                }
                this.updateStatusSummary();
                this.renderTable();
        }

        private smartMerge(): void {
                if (!hasSelectedUserFields(this.selection)) {
                        return;
                }
                this.statusSyncService.applyDecisionPreset(this.diffs, 'smart');
                this.updateStatusSummary();
                this.renderTable();
        }

        private async executeSync(): Promise<void> {
                this.statusEl.setText(tn('statusSyncModal', 'syncProgress'));
                const { successCount, failCount } = await this.statusSyncService.executeSync(this.diffs);

                const message = tn('statusSyncModal', 'syncComplete')
                        .replace('{success}', String(successCount))
                        .replace('{failed}', String(failCount));
                this.statusEl.setText(message);

                if (successCount > 0) {
                        new Notice(message);
                        this.onComplete();
                        this.close();
                        return;
                }

                new Notice(tn('statusSyncModal', 'syncFailed'));
        }

        private scheduleRender(): void {
                if (this.renderTimer !== null || this.isDisposedFlag) {
                        return;
                }

                this.renderTimer = this.getOwnerWindow().setTimeout(() => {
                        this.renderTimer = null;
                        if (!this.isDisposedFlag) {
                                this.renderTable();
                        }
                }, 200);
        }

        private getOwnerWindow(): Window {
                const ownerWindow = this.containerEl.ownerDocument.defaultView;
                return ownerWindow ?? activeWindow;
        }

        private updateStatusSummary(): void {
                if (!this.statusEl) {
                        return;
                }

                const visibleCount = this.getVisibleDiffs().length;
                if (this.backgroundTotal > 0 && this.backgroundCompleted < this.backgroundTotal) {
                        this.statusEl.setText(
                                tn('statusSyncModal', 'progressSummaryLoading')
                                        .replace('{completed}', String(this.backgroundCompleted))
                                        .replace('{total}', String(this.backgroundTotal))
                                        .replace('{visible}', String(visibleCount)),
                        );
                        return;
                }

                if (this.backgroundTotal > 0) {
                        this.statusEl.setText(
                                tn('statusSyncModal', 'progressSummaryDone')
                                        .replace('{completed}', String(this.backgroundCompleted))
                                        .replace('{total}', String(this.backgroundTotal))
                                        .replace('{visible}', String(visibleCount)),
                        );
                        return;
                }

                this.statusEl.setText(
                        tn('statusSyncModal', 'progressSummaryVisible')
                                .replace('{visible}', String(visibleCount)),
                );
        }

        private recalculateDiffState(diff: StatusSyncDiff): void {
                diff.hasUserDiff = hasSelectedUserFields(this.selection) && (
                        (this.selection.user.rate && diff.rate.hasDiff) ||
                        (this.selection.user.comment && diff.comment.hasDiff) ||
                        (this.selection.user.tags && diff.tags.hasDiff) ||
                        (this.selection.user.status && diff.status.hasDiff) ||
                        (this.selection.user.episodeStatus && diff.episodeStatus.hasDiff)
                );
                diff.hasPlatformDiff = diff.platformFields.some(field => field.hasDiff);
                diff.hasAnyDiff = diff.hasUserDiff || diff.hasPlatformDiff;
        }

        private getLoadStateText(state: StatusSyncLoadState): string {
                switch (state) {
                        case 'failed':
                                return tn('statusSyncModal', 'backgroundLoadFailed');
                        case 'loading':
                                return tn('statusSyncModal', 'loadInProgress');
                        case 'pending':
                                return tn('statusSyncModal', 'loadPending');
                        case 'ready':
                        default:
                                return tn('statusSyncModal', 'noDiff');
                }
        }

        private getTitle(): string {
                if (hasSelectedUserFields(this.selection) && hasSelectedPlatformFields(this.selection)) {
                        return tn('statusSyncModal', 'title');
                }
                return hasSelectedUserFields(this.selection)
                        ? tn('statusSyncModal', 'userTitle')
                        : tn('statusSyncModal', 'platformTitle');
        }

        private getDescription(): string {
                if (hasSelectedUserFields(this.selection) && hasSelectedPlatformFields(this.selection)) {
                        return tn('statusSyncModal', 'description');
                }
                return hasSelectedUserFields(this.selection)
                        ? tn('statusSyncModal', 'userDescription')
                        : tn('statusSyncModal', 'platformDescription');
        }
}
