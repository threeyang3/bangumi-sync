/**
 * Timing helpers
 */

export function delay(ms: number, ownerWindow: Window | null | undefined): Promise<void> {
	return new Promise<void>(resolve => {
		const timerWindow = ownerWindow ?? activeWindow;
		timerWindow.setTimeout(resolve, ms);
	});
}
