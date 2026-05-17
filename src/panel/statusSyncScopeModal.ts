import { App, Modal, Notice } from 'obsidian';
import { tn } from '../i18n';
import {
        PLATFORM_STATUS_SYNC_FIELD_KEYS,
        StatusSyncFieldSelection,
        USER_STATUS_SYNC_FIELD_KEYS,
        cloneStatusSyncFieldSelection,
        hasSelectedPlatformFields,
        hasSelectedUserFields,
} from '../sync/statusSyncTypes';

interface StatusSyncScopeFieldDescriptor<TKey extends string> {
        key: TKey;
        label: string;
        description: string;
}

export class StatusSyncScopeModal extends Modal {
        private selection: StatusSyncFieldSelection;
        private onConfirm: (selection: StatusSyncFieldSelection) => void;

        constructor(app: App, initialSelection: StatusSyncFieldSelection, onConfirm: (selection: StatusSyncFieldSelection) => void) {
                super(app);
                this.selection = cloneStatusSyncFieldSelection(initialSelection);
                this.onConfirm = onConfirm;
        }

        onOpen(): void {
                const { contentEl } = this;
                contentEl.empty();
                contentEl.addClass('bangumi-status-sync-scope-modal');

                contentEl.createEl('h2', { text: tn('statusSyncModal', 'scopeTitle') });
                contentEl.createEl('p', {
                        text: tn('statusSyncModal', 'scopeDescription'),
                        cls: 'bangumi-sync-description',
                });

                const grid = contentEl.createDiv({ cls: 'bangumi-status-sync-scope-grid' });
                this.renderSection(grid, 'user');
                this.renderSection(grid, 'platform');

                const footer = contentEl.createDiv({ cls: 'bangumi-status-sync-scope-footer' });
                footer.createDiv({
                        text: tn('statusSyncModal', 'scopeFooterHint'),
                        cls: 'bangumi-status-sync-scope-hint',
                });

                const actions = footer.createDiv({ cls: 'bangumi-status-sync-scope-actions' });
                actions.createEl('button', { text: tn('syncOptions', 'cancel') }, button => {
                        button.addEventListener('click', () => this.close());
                });
                actions.createEl('button', {
                        text: tn('statusSyncModal', 'startCompare'),
                        cls: 'mod-cta',
                }, button => {
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

        onClose(): void {
                this.contentEl.empty();
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
                        button.addEventListener('click', () => {
                                this.setSectionSelection(section, true);
                                this.onOpen();
                        });
                });
                tools.createEl('button', { text: tn('statusSyncModal', 'deselectAll') }, button => {
                        button.addEventListener('click', () => {
                                this.setSectionSelection(section, false);
                                this.onOpen();
                        });
                });

                header.createEl('p', {
                        text: section === 'user'
                                ? tn('statusSyncModal', 'scopeUserDescription')
                                : tn('statusSyncModal', 'scopePlatformDescription'),
                        cls: 'bangumi-status-sync-scope-desc',
                });

                const items = card.createDiv({ cls: 'bangumi-status-sync-scope-items' });
                if (section === 'user') {
                        const fields = this.getUserFieldDescriptors();
                        for (const field of fields) {
                                const isChecked = this.selection.user[field.key];
                                const item = items.createEl('label', {
                                        cls: `bangumi-status-sync-scope-item ${isChecked ? 'is-checked' : ''}`,
                                });
                                const checkbox = item.createEl('input', { type: 'checkbox' });
                                checkbox.checked = isChecked;
                                checkbox.addEventListener('change', () => {
                                        this.selection.user[field.key] = checkbox.checked;
                                        this.onOpen();
                                });

                                const content = item.createDiv({ cls: 'bangumi-status-sync-scope-item-content' });
                                content.createDiv({ text: field.label, cls: 'bangumi-status-sync-scope-item-name' });
                                content.createDiv({ text: field.description, cls: 'bangumi-status-sync-scope-item-meta' });
                        }
                } else {
                        const fields = this.getPlatformFieldDescriptors();
                        for (const field of fields) {
                                const isChecked = this.selection.platform[field.key];
                                const item = items.createEl('label', {
                                        cls: `bangumi-status-sync-scope-item ${isChecked ? 'is-checked' : ''}`,
                                });
                                const checkbox = item.createEl('input', { type: 'checkbox' });
                                checkbox.checked = isChecked;
                                checkbox.addEventListener('change', () => {
                                        this.selection.platform[field.key] = checkbox.checked;
                                        this.onOpen();
                                });

                                const content = item.createDiv({ cls: 'bangumi-status-sync-scope-item-content' });
                                content.createDiv({ text: field.label, cls: 'bangumi-status-sync-scope-item-name' });
                                content.createDiv({ text: field.description, cls: 'bangumi-status-sync-scope-item-meta' });
                        }
                }

                const selectedCount = section === 'user'
                        ? this.getUserFieldDescriptors().filter(field => this.selection.user[field.key]).length
                        : this.getPlatformFieldDescriptors().filter(field => this.selection.platform[field.key]).length;
                masterCheckbox.checked = selectedCount === fieldDescriptors.length && fieldDescriptors.length > 0;
                masterCheckbox.indeterminate = selectedCount > 0 && selectedCount < fieldDescriptors.length;
                masterCheckbox.addEventListener('change', () => {
                        this.setSectionSelection(section, masterCheckbox.checked);
                        this.onOpen();
                });
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
