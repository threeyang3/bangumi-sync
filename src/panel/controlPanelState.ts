import type { ManagerState } from '../sync/syncManager';

export type ControlPanelActionStateKey = 'refresh' | 'write-action';

/** Keep refresh available for diagnostics while all Vault-writing panel actions follow manager state. */
export function isControlPanelActionBlocked(managerState: ManagerState, action: ControlPanelActionStateKey): boolean {
	return managerState !== 'idle' && action !== 'refresh';
}
