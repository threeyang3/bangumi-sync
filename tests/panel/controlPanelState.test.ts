import { describe, expect, it } from 'vitest';
import type { ManagerState } from '../../src/sync/syncManager';
import { isControlPanelActionBlocked } from '../../src/panel/controlPanelState';

describe('ControlPanel manager-state gating', () => {
	it.each(['running', 'awaiting-decision', 'committing', 'rolling-back', 'recovery-required', 'configuration-updating'] as ManagerState[])
		('disables write actions while manager state is %s but leaves refresh available', state => {
			expect(isControlPanelActionBlocked(state, 'write-action')).toBe(true);
			expect(isControlPanelActionBlocked(state, 'refresh')).toBe(false);
		});

	it('re-enables write actions after the terminal idle notification', () => {
		expect(isControlPanelActionBlocked('committing', 'write-action')).toBe(true);
		expect(isControlPanelActionBlocked('idle', 'write-action')).toBe(false);
	});
});
