import { describe, expect, it } from 'vitest';
import { setRequestUrlHandler } from '../mocks/obsidian';
import { FileManager } from '../../common/file/fileManager';
import { ImageHandler, ImageMutationUncertainError } from '../../common/file/imageHandler';
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

	it('returns a network failure without classifying it as an uncertain Vault mutation', async () => {
		const vault = new InMemoryVault();
		setRequestUrlHandler(() => Promise.reject(new Error('network unavailable')));
		const handler = new ImageHandler(vault.app, new FileManager(vault.app));
		expect(await handler.downloadImageWithResult('https://example.com/1.jpg', 'assets/1.jpg'))
			.toEqual({ path: 'https://example.com/1.jpg', status: 'failed' });
	});

	it('throws an uncertain update error when modify writes bytes and then rejects', async () => {
		const vault = new InMemoryVault();
		const file = vault.addBinaryFile('assets/1.jpg', new Uint8Array([1, 2, 3]));
		setRequestUrlHandler(() => Promise.resolve({ status: 200, arrayBuffer: new Uint8Array([4, 5, 6]).buffer }));
		const handler = new ImageHandler(vault.app, new FileManager(vault.app));
		handler.setUpdateExisting(true);
		handler.setBeforeUpdateHook(() => Promise.resolve());
		vault.app.vault.modifyBinary = (_target, content) => {
			vault.binaryContents.set(file.path, new Uint8Array(content).slice());
			return Promise.reject(new Error('injected post-write failure'));
		};

		await expect(handler.downloadImageWithResult('https://example.com/1.jpg', 'assets/1.jpg')).rejects.toMatchObject({
			name: 'ImageMutationUncertainError', operation: 'update', path: 'assets/1.jpg', recoveryFactsPersisted: true,
		});
		expect(Array.from(vault.binaryContents.get('assets/1.jpg') ?? [])).toEqual([4, 5, 6]);
	});

	it('throws an uncertain create error when create writes the file and then rejects', async () => {
		const vault = new InMemoryVault();
		setRequestUrlHandler(() => Promise.resolve({ status: 200, arrayBuffer: new Uint8Array([7, 8, 9]).buffer }));
		const handler = new ImageHandler(vault.app, new FileManager(vault.app));
		handler.setBeforeCreateHook(() => Promise.resolve());
		vault.app.vault.createBinary = (path, content) => {
			vault.addBinaryFile(path, new Uint8Array(content));
			return Promise.reject(new Error('injected post-create failure'));
		};

		await expect(handler.downloadImageWithResult('https://example.com/1.jpg', 'assets/1.jpg'))
			.rejects.toBeInstanceOf(ImageMutationUncertainError);
		expect(Array.from(vault.binaryContents.get('assets/1.jpg') ?? [])).toEqual([7, 8, 9]);
	});
});
