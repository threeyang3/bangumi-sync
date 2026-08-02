import { App, TFile, TFolder, normalizePath, parseYaml } from 'obsidian';

type TestTFileConstructor = new (path: string) => TFile;
type TestTFolderConstructor = new (path: string) => TFolder;

function createFile(path: string): TFile {
	return new (TFile as unknown as TestTFileConstructor)(path);
}

function createFolder(path: string): TFolder {
	return new (TFolder as unknown as TestTFolderConstructor)(path);
}

function updateFilePath(file: TFile, path: string): void {
	const normalized = normalizePath(path);
	const name = normalized.split('/').pop() ?? '';
	const dotIndex = name.lastIndexOf('.');
	Object.assign(file, {
		path: normalized,
		basename: dotIndex > 0 ? name.slice(0, dotIndex) : name,
		extension: dotIndex > 0 ? name.slice(dotIndex + 1) : '',
	});
}

export class InMemoryVault {
	readonly contents = new Map<string, string>();
	readonly files = new Map<string, TFile>();
	readonly folders = new Map<string, TFolder>();
	readonly trashed: string[] = [];
	readonly app: App;

	constructor() {
		this.folders.set('', createFolder(''));
		const vault = {
			adapter: {
				exists: (path: string) => Promise.resolve(
					this.files.has(normalizePath(path)) || this.folders.has(normalizePath(path)),
				),
			},
			getMarkdownFiles: () => Array.from(this.files.values()).filter(file => file.extension === 'md'),
			getAbstractFileByPath: (path: string) => this.files.get(normalizePath(path)) ?? this.folders.get(normalizePath(path)) ?? null,
			read: (file: TFile) => Promise.resolve(this.contents.get(file.path) ?? ''),
			create: (path: string, content: string) => Promise.resolve(this.addFile(path, content)),
			createFolder: (path: string) => {
				this.addFolder(path);
				return Promise.resolve();
			},
			process: (file: TFile, updater: (content: string) => string) => {
				this.contents.set(file.path, updater(this.contents.get(file.path) ?? ''));
				return Promise.resolve();
			},
		};
		this.app = {
			vault,
			metadataCache: {
				getFileCache: (file: TFile) => {
					const content = this.contents.get(file.path) ?? '';
					const match = content.match(/^---\n([\s\S]*?)\n---/);
					const parsed: unknown = match ? parseYaml(match[1]) : null;
					return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
						? { frontmatter: parsed as Record<string, unknown> }
						: null;
				},
			},
			fileManager: {
				trashFile: (file: TFile) => {
					this.trashed.push(file.path);
					this.files.delete(file.path);
					this.contents.delete(file.path);
					return Promise.resolve();
				},
				renameFile: (file: TFile, newPath: string) => {
					const normalized = normalizePath(newPath);
					if (this.files.has(normalized)) throw new Error(`File exists: ${normalized}`);
					const content = this.contents.get(file.path) ?? '';
					this.files.delete(file.path);
					this.contents.delete(file.path);
					updateFilePath(file, normalized);
					this.files.set(normalized, file);
					this.contents.set(normalized, content);
					return Promise.resolve();
				},
			},
		} as unknown as App;
	}

	addFolder(path: string): TFolder {
		const normalized = normalizePath(path);
		const existing = this.folders.get(normalized);
		if (existing) return existing;
		const slash = normalized.lastIndexOf('/');
		if (slash >= 0) this.addFolder(normalized.slice(0, slash));
		const folder = createFolder(normalized);
		this.folders.set(normalized, folder);
		return folder;
	}

	addFile(path: string, content: string): TFile {
		const normalized = normalizePath(path);
		if (this.files.has(normalized)) throw new Error(`File exists: ${normalized}`);
		const slash = normalized.lastIndexOf('/');
		if (slash >= 0) this.addFolder(normalized.slice(0, slash));
		const file = createFile(normalized);
		this.files.set(normalized, file);
		this.contents.set(normalized, content);
		return file;
	}
}
