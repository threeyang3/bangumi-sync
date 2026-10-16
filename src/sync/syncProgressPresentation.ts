import { tn, type TranslationStrings } from '../i18n';
import type { SyncPhase, SyncProgress } from './syncStatus';

const phaseKeys: Record<SyncPhase, keyof TranslationStrings['syncModal']> = {
	details: 'phaseDetails', planning: 'phasePlanning', rendering: 'phaseRendering', writing: 'phaseWriting',
	finalizing: 'phaseFinalizing', linking: 'phaseLinking', 'awaiting-decision': 'pendingDecision',
	recovering: 'phaseRecovering',
};

/** Counts are completed attempts within one phase; unknown totals must not retain an old percentage. */
export function getSyncProgressPresentation(progress: SyncProgress): { text: string; percent: number | null } {
	const total = Number.isFinite(progress.total) ? Math.max(0, Math.trunc(progress.total)) : 0;
	const current = Number.isFinite(progress.current) ? Math.min(total, Math.max(0, Math.trunc(progress.current))) : 0;
	const percent = progress.status === 'completed' ? 100 : total > 0 ? Math.floor(current / total * 100) : null;
	const label = progress.phase ? tn('syncModal', phaseKeys[progress.phase])
		: progress.message ?? tn('syncModal', progress.status === 'completed' ? 'completed' : 'preparing');
	return { text: progress.phase && total > 0 ? `${label} ${current}/${total} (${percent}%)` : label, percent };
}

/** Limit DOM work, while phase transitions and the final count are always visible. */
export class SyncProgressThrottle {
	private lastKey = '';
	private lastAt = -Infinity;

	shouldUpdate(progress: SyncProgress, now = performance.now()): boolean {
		const key = `${progress.status}:${progress.phase ?? progress.message ?? ''}`;
		if (key === this.lastKey && !(progress.total > 0 && progress.current >= progress.total) && now - this.lastAt < 100) return false;
		this.lastKey = key;
		this.lastAt = now;
		return true;
	}
}
