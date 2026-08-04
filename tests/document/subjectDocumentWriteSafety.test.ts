import { describe, expect, it } from 'vitest';
import { SubjectDocumentService, SubjectIdentityMismatchError } from '../../src/document/subjectDocumentService';
import { InMemoryVault } from '../mocks/inMemoryVault';

describe('SubjectDocumentService ID-safe writes', () => {
	it('rejects a cross-ID write inside the atomic vault.process callback', async () => {
		const vault = new InMemoryVault();
		const file = vault.addFile('ACGN/one.md', '---\nid: 2\n---\noriginal');
		const service = new SubjectDocumentService(vault.app);

		await expect(service.processSubjectFile(file, 1, content => `${content}\nchanged`))
			.rejects.toBeInstanceOf(SubjectIdentityMismatchError);
		expect(vault.contents.get(file.path)).toBe('---\nid: 2\n---\noriginal');
	});

	it('rejects missing and conflicting identities but updates the matching subject', async () => {
		const vault = new InMemoryVault();
		const missing = vault.addFile('ACGN/missing.md', 'plain');
		const conflict = vault.addFile('ACGN/conflict.md', '---\nid: 1\nBangumiID: 2\n---\n');
		const matching = vault.addFile('ACGN/matching.md', '---\nid: 1\n---\nold');
		const service = new SubjectDocumentService(vault.app);

		await expect(service.processSubjectFile(missing, 1, content => content)).rejects.toBeInstanceOf(SubjectIdentityMismatchError);
		await expect(service.processSubjectFile(conflict, 1, content => content)).rejects.toBeInstanceOf(SubjectIdentityMismatchError);
		await service.processSubjectFile(matching, 1, content => content.replace('old', 'new'));
		expect(vault.contents.get(matching.path)).toContain('new');
	});
});
