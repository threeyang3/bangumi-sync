/** Shared by all Bangumi clients, including panel and preview clients. */
export class RequestScheduler {
	private active = 0;
	private limit = 3;
	private readonly queue: Array<() => void> = [];
	private readonly scopes = new Map<symbol, number>();

	setConcurrency(value: number): void {
		this.limit = this.normalize(value);
		this.drain();
	}

	acquireConcurrency(value: number): () => void {
		const key = Symbol();
		this.scopes.set(key, this.normalize(value));
		return () => { this.scopes.delete(key); this.drain(); };
	}

	private normalize(value: number): number {
		return Number.isFinite(value) ? Math.max(1, Math.min(5, Math.floor(value))) : 3;
	}

	run<T>(request: () => Promise<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.queue.push(() => {
				this.active++;
				void Promise.resolve().then(request).then(resolve, reject).finally(() => {
					this.active--;
					this.drain();
				});
			});
			this.drain();
		});
	}

	private drain(): void {
		const limit = Math.min(this.limit, ...this.scopes.values());
		while (this.active < limit && this.queue.length > 0) this.queue.shift()?.();
	}
}

export const bangumiRequestScheduler = new RequestScheduler();
