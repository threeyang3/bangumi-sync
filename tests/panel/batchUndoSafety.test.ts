import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), Modal: class {} }));
import { FrontmatterEditor } from '../../src/panel/batchEditorModal';
import { InMemoryVault } from '../mocks/inMemoryVault';

const original = '---\nid: 1\n评分: 5\n---\nKeep my body';
function setup() {
	const vault = new InMemoryVault(); const file = vault.addFile('ACGN/one.md', original);
	return { vault, file, editor: new FrontmatterEditor(vault.app) };
}

describe('batch undo snapshot safety', () => {
	it.each(['delete', 'move'] as const)('does not report success when a later file disappears by %s after preflight', async mode => {
		const { vault, file, editor } = setup();
		const otherOriginal = original.replace('id: 1', 'id: 2');
		const other = vault.addFile('ACGN/two.md', otherOriginal);
		const otherPath = other.path;
		await editor.batchModify([file.path, otherPath], [{ type: 'modify', property: '评分', value: '8' }]);
		const otherAfter = vault.contents.get(otherPath)!;
		const process = vault.app.vault.process.bind(vault.app.vault);
		const spy = vi.spyOn(vault.app.vault, 'process').mockImplementationOnce(async (target, updater) => {
			const result = await process(target, updater);
			if (mode === 'delete') await vault.app.fileManager.trashFile(other);
			else await vault.app.fileManager.renameFile(other, 'ACGN/moved.md');
			return result;
		});
		await expect(editor.undo()).rejects.toThrow('Undo did not complete');
		expect(editor.canUndo()).toBe(true);
		expect(vault.contents.get(file.path)).toBe(original);
		if (mode === 'move') {
			expect(vault.contents.get(other.path)).toBe(otherAfter);
			await vault.app.fileManager.renameFile(other, otherPath);
		} else vault.addFile(otherPath, otherAfter);
		spy.mockRestore();
		expect(await editor.undo()).toBe(true); expect(editor.canUndo()).toBe(false);
		expect(vault.contents.get(otherPath)).toBe(otherOriginal);
	});

	it('refuses to erase post-edit text and retains history for retry', async () => {
		const { vault, file, editor } = setup();
		await editor.batchModify([file.path], [{ type: 'modify', property: '评分', value: '8' }]);
		const after = vault.contents.get(file.path)!; vault.contents.set(file.path, after + '\nNew thoughts');
		await expect(editor.undo()).rejects.toThrow();
		expect(vault.contents.get(file.path)).toBe(after + '\nNew thoughts'); expect(editor.canUndo()).toBe(true);
		vault.contents.set(file.path, after); expect(await editor.undo()).toBe(true);
		expect(vault.contents.get(file.path)).toBe(original); expect(editor.canUndo()).toBe(false);
	});

	it('captures the original inside the actual update, including edits before it', async () => {
		const { vault, file, editor } = setup(); const process = vault.app.vault.process.bind(vault.app.vault);
		vi.spyOn(vault.app.vault, 'process').mockImplementationOnce((target, updater) => {
			vault.contents.set(file.path, original + '\nBefore update'); return process(target, updater);
		});
		await editor.batchApplyPerItemUpdates([{ filePath: file.path, subjectId: 1, properties: { '评分': 8 } }]);
		await editor.undo(); expect(vault.contents.get(file.path)).toBe(original + '\nBefore update');
	});

	it('preflights all files, rechecks in process, and retains partial restore progress on IO failure', async () => {
		const { vault, file, editor } = setup(); const other = vault.addFile('ACGN/two.md', original.replace('id: 1', 'id: 2'));
		await editor.batchModify([file.path, other.path], [{ type: 'modify', property: '评分', value: '8' }]);
		const afterOne = vault.contents.get(file.path)!; const afterTwo = vault.contents.get(other.path)!;
		vault.contents.set(other.path, afterTwo + '\nNew edit');
		await expect(editor.undo()).rejects.toThrow(); expect(vault.contents.get(file.path)).toBe(afterOne);
		vault.contents.set(other.path, afterTwo);
		const process = vault.app.vault.process.bind(vault.app.vault);
		const spy = vi.spyOn(vault.app.vault, 'process').mockImplementation((target, updater) => target === other
			? Promise.reject(new Error('Injected disk failure')) : process(target, updater));
		await expect(editor.undo()).rejects.toThrow('disk failure'); expect(editor.canUndo()).toBe(true);
		expect(vault.contents.get(file.path)).toBe(original);
		spy.mockRestore(); expect(await editor.undo()).toBe(true); expect(editor.canUndo()).toBe(false);
	});
});
