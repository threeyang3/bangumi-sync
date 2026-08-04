import { App, Modal, Notice, Setting } from 'obsidian';
import { LocalSubjectDiagnosticReport, PathMigrationPreview } from '../sync/pathDiagnostics';
import { tn, tnFormat } from '../i18n/translations';

export class PathDiagnosticModal extends Modal {
	constructor(
		app: App,
		private readonly report: LocalSubjectDiagnosticReport,
		private readonly onExport: () => Promise<string>,
	) {
		super(app);
	}

	onOpen(): void {
		new Setting(this.contentEl).setName(tn('pathTools', 'diagnosticTitle')).setHeading();
		this.contentEl.createEl('p', {
			text: tnFormat('pathTools', 'diagnosticSummary', {
				valid: this.report.validSubjects,
				issues: this.report.issues.length,
			}),
		});
		if (this.report.issues.length > 0) {
			const list = this.contentEl.createEl('ul', { cls: 'bangumi-diagnostic-list' });
			for (const issue of this.report.issues) {
				list.createEl('li', {
					text: `[${issue.severity}/${issue.code}] ${issue.subjectId ? `#${issue.subjectId} ` : ''}${issue.path ?? ''} — ${issue.message}`,
				});
			}
		}

		new Setting(this.contentEl)
			.addButton(button => button
				.setButtonText(tn('pathTools', 'exportReport'))
				.onClick(async () => {
					const path = await this.onExport();
					new Notice(tnFormat('pathTools', 'reportExported', { path }));
				}))
			.addButton(button => button
				.setButtonText(tn('pathTools', 'close'))
				.onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class PathMigrationPreviewModal extends Modal {
	private includeUnknown = false;
	private includeUserRenamed = false;
	private preview: PathMigrationPreview;

	constructor(
		app: App,
		preview: PathMigrationPreview,
		private readonly onApply: (preview: PathMigrationPreview) => Promise<{ renamed: number; failed: number }>,
		private readonly onRefresh: (options: { includeUnknown: boolean; includeUserRenamed: boolean }) => Promise<PathMigrationPreview>,
	) {
		super(app);
		this.preview = preview;
	}

	onOpen(): void {
		this.render();
	}

	private render(): void {
		this.contentEl.empty();
		new Setting(this.contentEl).setName(tn('pathTools', 'migrationTitle')).setHeading();
		new Setting(this.contentEl)
			.setName(tn('pathTools', 'includeUnknown'))
			.addToggle(toggle => toggle.setValue(this.includeUnknown).onChange(async value => {
				this.includeUnknown = value;
				await this.refreshPreview();
			}));
		new Setting(this.contentEl)
			.setName(tn('pathTools', 'includeUserRenamed'))
			.addToggle(toggle => toggle.setValue(this.includeUserRenamed).onChange(async value => {
				this.includeUserRenamed = value;
				await this.refreshPreview();
			}));
		const renameCount = this.preview.entries.filter(entry => entry.status === 'rename').length;
		const protectedCount = this.preview.entries.filter(entry => entry.status === 'protected').length;
		const failedCount = this.preview.entries.filter(entry => entry.status === 'failed').length;
		this.contentEl.createEl('p', {
			text: tnFormat('pathTools', 'migrationSummary', {
				rename: renameCount,
				protected: protectedCount,
				failed: failedCount,
			}),
		});
		if (renameCount === 0) {
			this.contentEl.createEl('p', { text: tn('pathTools', 'noRenames') });
		}
		const list = this.contentEl.createEl('ul', { cls: 'bangumi-path-migration-list' });
		for (const entry of this.preview.entries) {
			list.createEl('li', {
				text: entry.status === 'rename'
					? `#${entry.subjectId} ${entry.name}: ${entry.from} → ${entry.to}`
					: `#${entry.subjectId} ${entry.name}: ${entry.status}${entry.reason ? ` — ${entry.reason}` : ''}`,
			});
		}

		new Setting(this.contentEl)
			.addButton(button => {
				button
					.setButtonText(tn('pathTools', 'applyMigration'))
					.setCta()
					.setDisabled(renameCount === 0)
					.onClick(async () => {
						button.setDisabled(true);
						const result = await this.onApply(this.preview);
						new Notice(tnFormat('pathTools', 'migrationComplete', result));
						this.close();
					});
			})
			.addButton(button => button
				.setButtonText(tn('pathTools', 'close'))
				.onClick(() => this.close()));
	}

	private async refreshPreview(): Promise<void> {
		this.preview = await this.onRefresh({
			includeUnknown: this.includeUnknown,
			includeUserRenamed: this.includeUserRenamed,
		});
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
