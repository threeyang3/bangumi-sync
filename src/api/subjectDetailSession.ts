import { requestBudgetForItems } from './requestScheduler';
import type { Subject } from '../../common/api/types';
import type { BangumiClient } from './client';

/** Full subject responses belong only to one preview/import operation. */
export class SubjectDetailSession {
	private readonly successes = new Map<number, Subject>();
	private readonly pending = new Map<number, Promise<Subject>>();
	private readonly queue: Array<() => void> = [];
	private readonly cancelWaiters = new Set<() => void>();
	private active = 0;
	private disposed = false;
	private readonly revision: number;
	private readonly limit: number;
	private readonly releaseRequests: (() => void) | undefined;

	constructor(
		private readonly client: BangumiClient,
		concurrency = 3,
		private readonly cancelled: () => boolean = () => false,
		private readonly timeoutMs = 15000,
	) {
		this.revision = client.subjectDetailRevision;
		this.limit = Number.isFinite(concurrency) ? Math.max(1, Math.min(5, Math.floor(concurrency))) : 3;
		this.releaseRequests = client.acquireRequestConcurrency?.(requestBudgetForItems(this.limit));
	}

	get isValid(): boolean {
		return !this.disposed && !this.cancelled() && this.client.subjectDetailRevision === this.revision;
	}

	dispose(): void {
		this.releaseRequests?.();
		this.disposed = true;
		this.successes.clear();
		this.queue.length = 0;
		for (const cancel of this.cancelWaiters) cancel();
	}

	getSubject(subjectId: number): Promise<Subject> {
		if (!this.isValid) return Promise.reject(new Error('Subject detail session cancelled or invalidated'));
		const cached = this.successes.get(subjectId);
		if (cached) return Promise.resolve(cached);
		const pending = this.pending.get(subjectId);
		if (pending) return pending;

		let expired = false;
		const request = new Promise<Subject>((resolve, reject) => {
			const timerWindow = activeWindow;
			let timer: number;
			const finish = (subject?: Subject, error?: Error) => {
				if (expired) return;
				expired = true;
				timerWindow.clearTimeout(timer);
				this.cancelWaiters.delete(cancel);
				if (error) reject(error);
				else if (subject && this.isValid) {
					this.successes.set(subjectId, subject);
					resolve(subject);
				} else reject(new Error('Subject detail session cancelled or invalidated'));
			};
			const cancel = () => finish(undefined, new Error('Subject detail session cancelled'));
			this.cancelWaiters.add(cancel);
			const deadline = Date.now() + this.timeoutMs;
			const check = () => {
				if (!this.isValid) cancel();
				else if (Date.now() >= deadline) finish(undefined, new Error(`Subject ${subjectId} detail timed out`));
				else timer = timerWindow.setTimeout(check, Math.min(100, Math.max(1, deadline - Date.now())));
			};
			timer = timerWindow.setTimeout(check, Math.min(100, this.timeoutMs));
			this.queue.push(() => {
				if (expired || !this.isValid) { cancel(); return; }
				this.active++;
				void Promise.resolve().then(() => {
					if (!this.isValid) throw new Error('Subject detail session cancelled or invalidated');
					return this.client.getSubject(subjectId, () => expired || !this.isValid);
				}).then(
					subject => subject.id === subjectId
						? finish(subject) : finish(undefined, new Error('Subject detail identity mismatch')),
					error => finish(undefined, error instanceof Error ? error : new Error(String(error))),
				).finally(() => {
					// A timeout cannot abort requestUrl: retain the slot until it actually settles.
					this.active--;
					this.drain();
				});
			});
			this.drain();
		});
		this.pending.set(subjectId, request);
		void request.then(() => this.pending.delete(subjectId), () => this.pending.delete(subjectId));
		return request;
	}

	private drain(): void {
		while (this.isValid && this.active < this.limit && this.queue.length > 0) this.queue.shift()?.();
	}
}
