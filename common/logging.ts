/** Shared only within this plugin runtime; settings are read at the point of use. */
let diagnosticsEnabled: () => boolean = () => false;

/** An old plugin instance cannot detach the provider installed by a newer instance. */
export function registerDiagnosticLogging(provider: () => boolean): () => void {
	diagnosticsEnabled = provider;
	return () => {
		if (diagnosticsEnabled === provider) diagnosticsEnabled = () => false;
	};
}

/** Do not build detailed strings, enumerate objects, or join arrays when disabled. */
export function debugLog(message: () => string): void {
	if (diagnosticsEnabled()) console.debug(message());
}

export function reportSyncSummary(result: {
	created: number; updated: number; unchanged: number; skipped: number; failed: number;
	completion: string; duration: number;
}): void {
	console.info('[Bangumi Sync] Sync summary', {
		completion: result.completion, created: result.created, updated: result.updated,
		unchanged: result.unchanged, skipped: result.skipped, failed: result.failed, durationMs: result.duration,
	});
}
