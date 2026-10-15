/** Shared by all Bangumi clients, including panel and preview clients. */
export class RequestScheduler {
	private active = 0;
	private limit = 3;
	private readonly queue: Array<() => void> = [];

	setConcurrency(value: number): void {
		this.limit = Number.isFinite(value) ? Math.max(1, Math.min(5, Math.floor(value))) : 3;
		this.drain();
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
		while (this.active < this.limit && this.queue.length > 0) this.queue.shift()?.();
	}
}

export const bangumiRequestScheduler = new RequestScheduler();
