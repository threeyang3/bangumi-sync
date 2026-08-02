export function parseYaml(input: string): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	const lines = input.split('\n');
	let currentListKey: string | null = null;

	for (const rawLine of lines) {
		if (!rawLine.trim()) {
			continue;
		}

		const listItemMatch = rawLine.match(/^\s*-\s*(.+)$/);
		if (listItemMatch && currentListKey) {
			const current = result[currentListKey];
			if (Array.isArray(current)) {
				current.push(listItemMatch[1].trim().replace(/^"|"$/g, ''));
			}
			continue;
		}

		const fieldMatch = rawLine.match(/^([^:]+):\s*(.*)$/);
		if (!fieldMatch) {
			currentListKey = null;
			continue;
		}

		const key = fieldMatch[1].trim();
		const value = fieldMatch[2].trim();
		if (!value) {
			result[key] = [];
			currentListKey = key;
			continue;
		}

		currentListKey = null;
		if (/^\d+$/.test(value)) {
			result[key] = Number(value);
		} else if (value === 'true' || value === 'false') {
			result[key] = value === 'true';
		} else {
			result[key] = value.replace(/^"|"$/g, '');
		}
	}

	return result;
}

export class TAbstractFile {
	constructor(public path: string) {}
}

export class TFile extends TAbstractFile {
	basename: string;
	extension: string;
	stat: { mtime: number };

	constructor(path: string) {
		super(normalizePath(path));
		const name = this.path.split('/').pop() ?? '';
		const dotIndex = name.lastIndexOf('.');
		this.basename = dotIndex > 0 ? name.slice(0, dotIndex) : name;
		this.extension = dotIndex > 0 ? name.slice(dotIndex + 1) : '';
		this.stat = { mtime: 0 };
	}
}

export class TFolder extends TAbstractFile {}

export class Notice {
	constructor(_message: string) {}
}

export function getLanguage(): string {
	return 'en';
}

export function normalizePath(path: string): string {
	return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
}

export interface App {
	vault: {
		read(file: TFile): Promise<string>;
		getMarkdownFiles(): TFile[];
		getAbstractFileByPath(path: string): TAbstractFile | null;
		adapter: { exists(path: string): Promise<boolean> };
		create(path: string, content: string): Promise<TFile>;
		createFolder(path: string): Promise<void>;
		process(file: TFile, updater: (content: string) => string): Promise<void>;
	};
	metadataCache: {
		getFileCache(file: TFile): { frontmatter?: Record<string, unknown> } | null;
	};
	fileManager: {
		trashFile(file: TFile): Promise<void>;
		renameFile(file: TFile, newPath: string): Promise<void>;
	};
}
