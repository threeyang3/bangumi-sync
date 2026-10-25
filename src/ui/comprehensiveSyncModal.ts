import { App, Modal, Notice } from 'obsidian';
import { SubjectDetailSession } from '../api/subjectDetailSession';
import { SubjectDocumentService } from '../document/subjectDocumentService';
import { EpisodeStatusManager } from '../episode/episodeStatusManager';
import { tn, tnFormat } from '../i18n';
import { StatusSyncModal } from '../panel/statusSyncModal';
import { StatusSyncScopeModal } from '../panel/statusSyncScopeModal';
import { ComprehensiveSyncOutcome, ComprehensiveSyncPlan, ComprehensiveSyncResult, ComprehensiveSyncService } from '../sync/comprehensiveSyncService';
import { StatusSyncService } from '../sync/statusSyncService';
import { SyncManager } from '../sync/syncManager';
import { createCancellationSignal } from '../sync/syncStatus';
import { StatusSyncFieldSelection, createDefaultStatusSyncFieldSelection, hasSelectedStatusChanges } from '../sync/statusSyncTypes';
import { LocalPropertyModal, LocalPropertyModalResult, hasLocalPropertyFieldsForCollections, loadSubjectsForCollections } from './localPropertyModal';
import { SyncModal } from './syncModal';

const PAGE_SIZE = 40;

export class ComprehensiveSyncModal extends Modal {
	private readonly service: ComprehensiveSyncService;
	private selection: StatusSyncFieldSelection = createDefaultStatusSyncFieldSelection();
	private plan?: ComprehensiveSyncPlan;
	private result?: ComprehensiveSyncResult;
	private selected = new Set<number>();
	private disposed = false;
	private busy = false;
	private executing = false;
	private error: string | null = null;
	private pages = new Map<string, number>();
	private progressEl?: HTMLElement;
	private decisionModal?: SyncModal;

	constructor(app: App, private readonly manager: SyncManager, episodes: EpisodeStatusManager | null,
		private readonly concurrency: number, private readonly onComplete: () => void, private readonly openRecovery: () => void) {
		super(app);
		const episodeManager = episodes ?? new EpisodeStatusManager(app, manager.client);
		const status = new StatusSyncService(app, manager.client, new SubjectDocumentService(app, episodeManager), episodeManager);
		this.service = new ComprehensiveSyncService(manager, status, concurrency);
		for (const key of Object.keys(this.selection.platform) as Array<keyof StatusSyncFieldSelection['platform']>) this.selection.platform[key] = true;
	}

	onOpen(): void {
		this.disposed = false;
		this.modalEl.addClass('bangumi-comprehensive-window');
		this.contentEl.addClass('bangumi-comprehensive-sync');
		this.render();
	}

	close(): void {
		if (this.executing) return;
		if (this.result?.importResult?.canRollback && this.manager.getManagerState() === 'awaiting-decision') {
			this.openImportDecision(); return;
		}
		super.close();
	}
	onClose(): void { this.disposed = true; this.contentEl.empty(); }

	private button(parent: HTMLElement, label: string, action: () => void, primary = false): HTMLButtonElement {
		const button = parent.createEl('button', { text: label, cls: primary ? 'mod-cta' : '' });
		button.type = 'button';
		button.disabled = this.busy;
		button.addEventListener('click', action);
		return button;
	}

	private paged<T>(parent: HTMLElement, key: string, title: string, rows: T[], render: (parent: HTMLElement, row: T) => void): T[] {
		const section = parent.createEl('section');
		section.createEl('h3', { text: `${title} (${rows.length})` });
		const total = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
		const page = Math.min(this.pages.get(key) ?? 0, total - 1);
		const slice = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
		for (const row of slice) render(section, row);
		if (total > 1) {
			const navigation = section.createDiv({ cls: 'bangumi-comprehensive-actions' });
			this.button(navigation, tn('comprehensiveSync', 'previous'), () => { this.pages.set(key, page - 1); this.render(); }).disabled = this.busy || page === 0;
			navigation.createSpan({ text: tnFormat('comprehensiveSync', 'page', { page: page + 1, total }) });
			this.button(navigation, tn('comprehensiveSync', 'next'), () => { this.pages.set(key, page + 1); this.render(); }).disabled = this.busy || page + 1 === total;
		}
		return slice;
	}

	private render(): void {
		if (this.disposed) return;
		const el = this.contentEl;
		el.empty();
		el.createEl('h2', { text: tn('comprehensiveSync', this.result ? 'result' : 'title') });
		el.createEl('p', { text: tn('comprehensiveSync', 'description') });
		if (this.error) el.createEl('p', { text: this.error, attr: { role: 'alert' } });
		if (this.busy) this.progressEl = el.createEl('p', { text: this.executing ? tn('statusSyncModal', 'syncProgress') : tn('comprehensiveSync', 'loading'), attr: { role: 'status', 'aria-live': 'polite' } });
		if (this.result) { this.renderResult(el); return; }
		if (!this.plan) {
			this.button(el, tn('comprehensiveSync', 'compare'), () => this.chooseScope(), true);
		} else {
			const plan = this.plan;
			el.createEl('p', { text: tnFormat('comprehensiveSync', 'summary', {
				additions: plan.additions.length, differences: plan.diffs.length, unchanged: plan.unchanged.length, failed: plan.failures.length,
			}), cls: 'bangumi-sync-stats' });
			el.createEl('p', { text: tnFormat('comprehensiveSync', 'localOnly', { count: plan.localOnlyCount }) });
			el.createEl('p', { text: tnFormat('comprehensiveSync', 'choices', { count: plan.diffs.filter(hasSelectedStatusChanges).length }) });
			const actions = el.createDiv({ cls: 'bangumi-comprehensive-actions' });
			this.button(actions, tn('comprehensiveSync', 'all'), () => { this.selected = new Set(plan.additions.map(item => item.subject_id)); this.render(); });
			this.button(actions, tn('comprehensiveSync', 'none'), () => { this.selected.clear(); this.render(); });
			this.paged(el, 'additions', tn('comprehensiveSync', 'additions'), plan.additions, (parent, item) => {
				const label = parent.createEl('label', { cls: 'bangumi-comprehensive-row' });
				const checkbox = label.createEl('input', { type: 'checkbox' });
				checkbox.checked = this.selected.has(item.subject_id);
				checkbox.disabled = this.busy;
				label.createSpan({ text: item.subject.name_cn || item.subject.name || String(item.subject_id) });
				checkbox.addEventListener('change', () => { if (checkbox.checked) this.selected.add(item.subject_id); else this.selected.delete(item.subject_id); });
			});
			const slice = this.paged(el, 'diffs', tn('comprehensiveSync', 'differences'), plan.diffs,
				(parent, item) => { parent.createDiv({ text: item.name_cn || item.name, cls: 'bangumi-comprehensive-row' }); });
			if (slice.length > 0) this.button(el, tn('comprehensiveSync', 'review'), () => {
				new StatusSyncModal(this.app, this.service.statusService, plan.selection, slice, () => undefined, reviewed => {
					if (this.disposed || this.plan !== plan) return;
					const replacements = new Map(reviewed.map(diff => [diff.subjectId, diff]));
					plan.diffs = plan.diffs.map(diff => replacements.get(diff.subjectId) ?? diff);
					this.render();
				}).open();
			});
			this.paged(el, 'unchanged', tn('comprehensiveSync', 'unchanged'), plan.unchanged,
				(parent, item) => { parent.createDiv({ text: item.subject.name_cn || item.subject.name }); });
			this.paged(el, 'failures', tn('comprehensiveSync', 'failed'), plan.failures,
				(parent, item) => { parent.createEl('p', { text: `${item.name}: ${item.error}` }); });
			el.createEl('p', { text: tn('comprehensiveSync', 'boundary') });
			const footer = el.createDiv({ cls: 'bangumi-comprehensive-actions' });
			this.button(footer, tn('comprehensiveSync', 'execute'), () => { void this.execute(); }, true);
			this.button(footer, tn('comprehensiveSync', 'refresh'), () => { void this.prepare(); });
			this.button(footer, tn('comprehensiveSync', 'compare'), () => this.chooseScope());
		}
		this.button(el, tn('comprehensiveSync', 'close'), () => this.close());
	}

	private chooseScope(): void {
		new StatusSyncScopeModal(this.app, this.selection, selection => { this.selection = selection; void this.prepare(); }).open();
	}

	private async prepare(): Promise<void> {
		if (this.busy) return;
		this.busy = true; this.error = null; this.plan = undefined; this.pages.clear(); this.render();
		try {
			const plan = await this.service.prepare(this.selection, () => this.disposed, (current, total) => {
				if (!this.disposed) this.progressEl?.setText(`${tn('comprehensiveSync', 'loading')} ${current}/${total}`);
			});
			if (!this.disposed) { this.plan = plan; this.selected = new Set(plan.additions.map(item => item.subject_id)); }
		} catch (error) { this.error = error instanceof Error ? error.message : String(error); }
		finally { this.busy = false; this.render(); }
	}

	private async collectProperties(details: SubjectDetailSession): Promise<LocalPropertyModalResult | null> {
		const additions = this.plan!.additions.filter(item => this.selected.has(item.subject_id));
		// Match the existing bulk-import policy; larger batches use template defaults.
		if (additions.length === 0 || additions.length > 10) return { propertyValuesBySubjectId: new Map() };
		const subjects = await loadSubjectsForCollections(additions, this.manager.client, undefined, undefined, { session: details, concurrency: this.concurrency });
		if (!hasLocalPropertyFieldsForCollections(additions, subjects, this.manager.getCustomTemplates())) return { propertyValuesBySubjectId: new Map() };
		return new Promise(resolve => {
			let settled = false;
			const modal = new LocalPropertyModal(this.app, additions, subjects, this.manager.getCustomTemplates(), result => {
				settled = true; resolve(result);
			});
			const original = modal.onClose.bind(modal);
			modal.onClose = () => { original(); if (!settled) resolve(null); };
			modal.open();
		});
	}

	private async execute(): Promise<void> {
		if (this.busy || !this.plan) return;
		this.busy = true; this.executing = true; this.error = null; this.render();
		const details = new SubjectDetailSession(this.manager.client, this.concurrency);
		try {
			const properties = await this.collectProperties(details);
			if (!properties) return;
			this.result = await this.service.execute(this.plan, this.selected, properties.propertyValuesBySubjectId, details);
			this.pages.clear();
			this.onComplete();
		} catch (error) { this.error = error instanceof Error ? error.message : String(error); new Notice(this.error); }
		finally { details.dispose(); this.busy = false; this.executing = false; this.render(); }
	}

	private renderResult(el: HTMLElement): void {
		const result = this.result!;
		const counts = new Map<ComprehensiveSyncOutcome['status'], number>();
		for (const item of result.outcomes) counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
		for (const [key, count] of counts) el.createEl('p', { text: `${tn('comprehensiveSync', key === 'rolled-back' ? 'rolledBack' : key)}: ${count}` });
		this.paged(el, 'results', tn('comprehensiveSync', 'result'), result.outcomes, (parent, item) => {
			parent.createEl('p', { text: `${item.name} · ${tn('comprehensiveSync', item.status === 'rolled-back' ? 'rolledBack' : item.status)}${item.error ? `: ${item.error}` : ''}` });
		});
		el.createEl('p', { text: tn('comprehensiveSync', 'boundary') });
		if (result.importResult?.canRollback || this.manager.getRecoveryRequired()) this.button(el, tn('comprehensiveSync', 'importDecision'), () => this.openImportDecision());
		this.button(el, tn('comprehensiveSync', 'close'), () => this.close());
	}

	private openImportDecision(): void {
		const result = this.result;
		if (!result?.importResult) { this.openRecovery(); return; }
		if (this.decisionModal?.containerEl.isConnected) return;
			const modal = new SyncModal(this.app, createCancellationSignal());
			this.decisionModal = modal;
			modal.setRollbackHandler(async () => {
				const decision = await this.manager.rollbackBatch();
				if (decision.result) result.importResult = decision.result;
				if (decision.status === 'rolled-back') for (const outcome of result.outcomes) if (outcome.status === 'pending') outcome.status = 'rolled-back';
				this.render(); return decision;
			});
			modal.setCommitHandler(async () => {
				const decision = await this.manager.commitPendingBatch();
				if (decision.result) result.importResult = decision.result;
				if (decision.status === 'committed') for (const outcome of result.outcomes) if (outcome.status === 'pending') outcome.status = 'created';
				this.render(); return decision;
			});
			modal.setRecoveryStateSubscriber(listener => this.manager.subscribeRecoveryState(listener));
			modal.setRecoveryCenterHandler(this.openRecovery);
			modal.open();
			if (result.importResult) modal.showCompleted(result.importResult);
	}
}
