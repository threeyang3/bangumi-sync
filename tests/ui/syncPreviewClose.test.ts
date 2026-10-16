import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';

vi.mock('obsidian', () => ({
	Modal: class {
		contentEl = { empty: vi.fn() };
		close(): void { this.onClose(); }
		onClose(): void {}
	},
	Setting: class {},
}));
import { SyncPreviewModal } from '../../src/ui/syncPreviewModal';

describe('preview close lifecycle', () => {
	it('reports cancellation exactly once when closed without confirmation', () => {
		const confirm = vi.fn();
		const modal = new SyncPreviewModal({} as App, [], confirm);
		modal.close(); modal.close();
		expect(confirm).toHaveBeenCalledExactlyOnceWith({ items: [], action: 'cancel' });
	});

	it('does not report cancellation or a second import after explicit confirmation', () => {
		const confirm = vi.fn();
		const modal = new SyncPreviewModal({} as App, [], confirm);
		const actions = modal as unknown as { confirm(action: 'all'): void };
		actions.confirm('all'); actions.confirm('all'); modal.close();
		expect(confirm).toHaveBeenCalledExactlyOnceWith({ items: [], action: 'all' });
	});
});
