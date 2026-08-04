import { describe, expect, it } from 'vitest';
import { setRequestUrlHandler } from '../mocks/obsidian';
import { FileManager } from '../../common/file/fileManager';
import { ImageHandler } from '../../common/file/imageHandler';
import { InMemoryVault } from '../mocks/inMemoryVault';

describe('ImageHandler transactional settings', () => {
	it('selects the configured image quality', () => {
		const vault = new InMemoryVault();
		const handler = new ImageHandler(vault.app, new FileManager(vault.app));
		handler.setImageQuality('small');
		expect(handler.selectImageUrlByQuality({ small: 'small', medium: 'medium', large: 'large' })).toBe('small');
		handler.setImageQuality('medium');
		expect(handler.selectImageUrlByQuality({ small: 'small', medium: 'medium', large: 'large' })).toBe('medium');
	});

	it('returns an existing binary unchanged without downloading when updateExisting is false', async () => {
		const vault = new InMemoryVault();
		vault.addBinaryFile('assets/1.jpg', new Uint8Array([1, 2, 3]));
		setRequestUrlHandler(() => Promise.reject(new Error('network must not run')));
		const handler = new ImageHandler(vault.app, new FileManager(vault.app));
		handler.setUpdateExisting(false);
		const result = await handler.downloadImageWithResult('https://example.com/1.jpg', 'assets/1.jpg');
		expect(result).toEqual({ path: 'assets/1.jpg', status: 'unchanged' });
		expect(Array.from(vault.binaryContents.get('assets/1.jpg') ?? [])).toEqual([1, 2, 3]);
	});

	it('journals the original bytes before updating an existing binary', async () => {
		const vault = new InMemoryVault();
		vault.addBinaryFile('assets/1.jpg', new Uint8Array([1, 2, 3]));
		setRequestUrlHandler(() => Promise.resolve({ status: 200, arrayBuffer: new Uint8Array([4, 5, 6]).buffer }));
		const handler = new ImageHandler(vault.app, new FileManager(vault.app));
		handler.setUpdateExisting(true);
		let observed: number[] = [];
		handler.setBeforeUpdateHook((_path, original) => {
			observed = Array.from(new Uint8Array(original));
			return Promise.resolve();
		});
		const result = await handler.downloadImageWithResult('https://example.com/1.jpg', 'assets/1.jpg');
		expect(result).toEqual({ path: 'assets/1.jpg', status: 'updated' });
		expect(observed).toEqual([1, 2, 3]);
		expect(Array.from(vault.binaryContents.get('assets/1.jpg') ?? [])).toEqual([4, 5, 6]);
	});
});
