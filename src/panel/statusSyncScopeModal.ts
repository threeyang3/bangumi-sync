import { App, Modal, Notice } from 'obsidian';
import { tn } from '../i18n';
import {
        PLATFORM_STATUS_SYNC_FIELD_KEYS,
        PartialStatusSyncFieldSelection,
        StatusSyncFieldSelection,
        USER_STATUS_SYNC_FIELD_KEYS,
        cloneStatusSyncFieldSelection,
        hasSelectedPlatformFields,
        hasSelectedUserFields,
        normalizeStatusSyncFieldSelection,
} from '../sync/statusSyncTypes';

interface StatusSyncScopeFieldDescriptor<TKey extends string> {
        key: TKey;
        label: string;
        description: string;
}

export class StatusSyncScopeModal extends Modal {
        private selection: StatusSyncFieldSelection;
        private readonly onConfirm: (selection: StatusSyncFieldSelection) => void;

        constructor(
                app: App,
                initialSelection: StatusSyncFieldSelection | PartialStatusSyncFieldSelection | null | undefined,
                onConfirm: (selection: StatusSyncFieldSelection) => void,
        ) {
                super(app);
                this.selection = normalizeStatusSyncFieldSelection(initialSelection);
                this.onConfirm = onConfirm;
        }

        onOpen(): void {
                this.modalEl.addClass('bangumi-status-sync-scope-window');
                this.render();
        }

        onClose(): void {
                this.modalEl.removeClass('bangumi-status-sync-scope-window');
                this.contentEl.empty();
        }

        private render(): void {
                const { contentEl } = this;
                contentEl.empty();
                contentEl.addClass('bangumi-status-sync-scope-modal');
                this.selection = normalizeStatusSyncFieldSelection(this.selection);

                const header = contentEl.createDiv({ cls: 'bangumi-status-sync-scope-header' });
                header.createEl('h2', {
                        text: tn('statusSyncModal', 'scopeTitle'),
                        cls: 'bangumi-status-sync-scope-heading',
                });
                header.createEl('p', {
                        text: tn('statusSyncModal', 'scopeDescription'),
                        cls: 'bangumi-status-sync-scope-subtitle',
                });

                const body = contentEl.createDiv({ cls: 'bangumi-status-sync-scope-body' });
                const grid = body.createDiv({ cls: 'bangumi-status-sync-scope-grid' });
                this.renderSectionSafely(grid, 'user');
                this.renderSectionSafely(grid, 'platform');

                const footer = contentEl.createDiv({ cls: 'bangumi-status-sync-scope-footer' });
                footer.createDiv({
                        text: tn('statusSyncModal', 'scopeFooterHint'),
                        cls: 'bangumi-status-sync-scope-hint',
                });

                const actions = footer.createDiv({ cls: 'bangumi-status-sync-scope-actions' });
                actions.createEl('button', {
                        text: tn('syncOptions', 'cancel'),
                        cls: 'bangumi-status-sync-scope-cancel',
                }, button => {
                        button.type = 'button';
                        button.addEventListener('click', () => this.close());
                });
                actions.createEl('button', {
                        text: tn('statusSyncModal', 'startCompare'),
                        cls: 'mod-cta bangumi-status-sync-scope-submit',
                }, button => {
                        button.type = 'button';
                        button.addEventListener('click', () => {
                                if (!hasSelectedUserFields(this.selection) && !hasSelectedPlatformFields(this.selection)) {
                                        new Notice(tn('statusSyncModal', 'selectAtLeastOne'));
                                        return;
                                }

                                this.onConfirm(cloneStatusSyncFieldSelection(this.selection));
                                this.close();
                        });
                });
        }

        private renderSectionSafely(container: HTMLElement, section: 'user' | 'platform'): void {
                try {
                        this.renderSection(container, section);
                } catch (error) {
                        console.error('[Bangumi Sync] 状态同步范围选择弹窗渲染失败:', section, error);
                        this.renderSectionFallback(container, section);
                }
        }

        private renderSection(container: HTMLElement, section: 'user' | 'platform'): void {
                const card = container.createDiv({
                        cls: `bangumi-status-sync-scope-card ${section === 'user' ? 'is-default' : ''}`,
                });
                const fieldDescriptors = section === 'user'
                        ? this.getUserFieldDescriptors()
                        : this.getPlatformFieldDescriptors();

                const header = card.createDiv({ cls: 'bangumi-status-sync-scope-head' });
                const topLine = header.createDiv({ cls: 'bangumi-status-sync-scope-topline' });
                const titleWrap = topLine.createDiv({ cls: 'bangumi-status-sync-scope-title-wrap' });
                const masterLabel = titleWrap.createEl('label', { cls: 'bangumi-status-sync-scope-master' });
                const masterCheckbox = masterLabel.createEl('input', { type: 'checkbox' });
                masterLabel.createSpan({
                        text: section === 'user'
                                ? tn('statusSyncModal', 'userDataGroup')
                                : tn('statusSyncModal', 'platformDataGroup'),
                        cls: 'bangumi-status-sync-scope-title',
                });
                titleWrap.createSpan({
                        text: section === 'user'
                                ? tn('statusSyncModal', 'scopeDefaultUser')
                                : tn('statusSyncModal', 'scopeDefaultPlatform'),
                        cls: 'bangumi-status-sync-scope-badge',
                });

                const tools = topLine.createDiv({ cls: 'bangumi-status-sync-scope-tools' });
                tools.createEl('button', { text: tn('statusSyncModal', 'selectAll') }, button => {
                        button.type = 'button';
                        button.addEventListener('click', () => {
                                this.setSectionSelection(section, true);
                                this.render();
                        });
                });
                tools.createEl('button', { text: tn('statusSyncModal', 'deselectAll') }, button => {
                        button.type = 'button';
                        button.addEventListener('click', () => {
                                this.setSectionSelection(section, false);
                                this.render();
                        });
                });

                header.createEl('p', {
                        text: section === 'user'
                                ? tn('statusSyncModal', 'scopeUserDescription')
                                : tn('statusSyncModal', 'scopePlatformDescription'),
                        cls: 'bangumi-status-sync-scope-desc',
                });

                const items = card.createDiv({ cls: 'bangumi-status-sync-scope-items' });
                for (const field of fieldDescriptors) {
                        const isChecked = this.getFieldChecked(section, field.key);
                        const item = items.createEl('label', {
                                cls: `bangumi-status-sync-scope-item ${isChecked ? 'is-checked' : ''}`,
                        });
                        const checkbox = item.createEl('input', { type: 'checkbox' });
                        checkbox.checked = isChecked;
                        checkbox.addEventListener('change', () => {
                                this.setFieldChecked(section, field.key, checkbox.checked);
                                this.render();
                        });

                        const content = item.createDiv({ cls: 'bangumi-status-sync-scope-item-content' });
                        content.createDiv({ text: field.label, cls: 'bangumi-status-sync-scope-item-name' });
                        content.createDiv({ text: field.description, cls: 'bangumi-status-sync-scope-item-meta' });
                }

                const selectedCount = fieldDescriptors.filter(field => this.getFieldChecked(section, field.key)).length;
                masterCheckbox.checked = selectedCount === fieldDescriptors.length && fieldDescriptors.length > 0;
                masterCheckbox.indeterminate = selectedCount > 0 && selectedCount < fieldDescriptors.length;
                masterCheckbox.addEventListener('change', () => {
                        this.setSectionSelection(section, masterCheckbox.checked);
                        this.render();
                });
        }

        private renderSectionFallback(container: HTMLElement, section: 'user' | 'platform'): void {
                const card = container.createDiv({ cls: 'bangumi-status-sync-scope-card' });
                const header = card.createDiv({ cls: 'bangumi-status-sync-scope-head' });
                header.createEl('div', {
                        text: section === 'user'
                                ? tn('statusSyncModal', 'userDataGroup')
                                : tn('statusSyncModal', 'platformDataGroup'),
                        cls: 'bangumi-status-sync-scope-title',
                });
                card.createDiv({
                        text: tn('statusSyncModal', 'backgroundLoadFailed'),
                        cls: 'bangumi-status-sync-scope-desc',
                });
        }

        private getFieldChecked(section: 'user' | 'platform', key: string): boolean {
                if (section === 'user') {
                        return Boolean(this.selection.user[key as (typeof USER_STATUS_SYNC_FIELD_KEYS)[number]]);
                }
                return Boolean(this.selection.platform[key as (typeof PLATFORM_STATUS_SYNC_FIELD_KEYS)[number]]);
        }

        private setFieldChecked(section: 'user' | 'platform', key: string, checked: boolean): void {
                if (section === 'user') {
                        this.selection.user[key as (typeof USER_STATUS_SYNC_FIELD_KEYS)[number]] = checked;
                        return;
                }
                this.selection.platform[key as (typeof PLATFORM_STATUS_SYNC_FIELD_KEYS)[number]] = checked;
        }

        private setSectionSelection(section: 'user' | 'platform', checked: boolean): void {
                if (section === 'user') {
                        for (const key of USER_STATUS_SYNC_FIELD_KEYS) {
                                this.selection.user[key] = checked;
                        }
                        return;
                }

                for (const key of PLATFORM_STATUS_SYNC_FIELD_KEYS) {
                        this.selection.platform[key] = checked;
                }
        }

        private getUserFieldDescriptors(): StatusSyncScopeFieldDescriptor<(typeof USER_STATUS_SYNC_FIELD_KEYS)[number]>[] {
                return [
                        { key: 'rate', label: tn('statusSyncModal', 'fieldRate'), description: tn('statusSyncModal', 'scopeFieldRate') },
                        { key: 'comment', label: tn('statusSyncModal', 'fieldComment'), description: tn('statusSyncModal', 'scopeFieldComment') },
                        { key: 'tags', label: tn('statusSyncModal', 'fieldTags'), description: tn('statusSyncModal', 'scopeFieldTags') },
                        { key: 'status', label: tn('statusSyncModal', 'fieldStatus'), description: tn('statusSyncModal', 'scopeFieldStatus') },
                        { key: 'episodeStatus', label: tn('statusSyncModal', 'fieldEpisodeStatus'), description: tn('statusSyncModal', 'scopeFieldEpisodeStatus') },
                ];
        }

        private getPlatformFieldDescriptors(): StatusSyncScopeFieldDescriptor<(typeof PLATFORM_STATUS_SYNC_FIELD_KEYS)[number]>[] {
                return [
                        { key: 'episodeCount', label: tn('statusSyncModal', 'fieldEpisodeCount'), description: tn('statusSyncModal', 'scopeFieldEpisodeCount') },
                        { key: 'chapterCount', label: tn('statusSyncModal', 'fieldChapterCount'), description: tn('statusSyncModal', 'scopeFieldChapterCount') },
                        { key: 'volumeCount', label: tn('statusSyncModal', 'fieldVolumeCount'), description: tn('statusSyncModal', 'scopeFieldVolumeCount') },
                        { key: 'start', label: tn('statusSyncModal', 'fieldStart'), description: tn('statusSyncModal', 'scopeFieldStart') },
                        { key: 'end', label: tn('statusSyncModal', 'fieldEnd'), description: tn('statusSyncModal', 'scopeFieldEnd') },
                        { key: 'progress', label: tn('statusSyncModal', 'fieldProgress'), description: tn('statusSyncModal', 'scopeFieldProgress') },
                ];
        }
}
