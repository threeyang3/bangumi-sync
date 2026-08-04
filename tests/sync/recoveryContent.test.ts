import { describe, expect, it } from 'vitest';
import { hashRecoveryContent, sha256Fallback } from '../../src/sync/recoveryContent';

describe('recovery SHA-256', () => {
	it.each([
		['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
		['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
	])('matches the standard vector for %j', async (content, expected) => {
		expect(await hashRecoveryContent(content)).toBe(expected);
		expect(sha256Fallback(new TextEncoder().encode(content))).toBe(expected);
	});

	it('hashes exact UTF-8 bytes without newline normalization', async () => {
		expect(await hashRecoveryContent('中文🙂\r\n')).not.toBe(await hashRecoveryContent('中文🙂\n'));
		expect(sha256Fallback(new TextEncoder().encode('中文🙂'))).toBe(await hashRecoveryContent('中文🙂'));
	});
});
