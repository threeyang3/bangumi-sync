import { App, Notice, TFile, normalizePath } from 'obsidian';
import { Subject } from '../../common/api/types';
import { generateFilePath } from '../../common/template/pathTemplate';
import { BangumiPluginSettings } from '../settings/settings';
import { BangumiClient } from '../api/client';
import { renderContentTemplate } from '../template/contentTemplate';

interface SubjectNoteContext {
	subject: Subject;
	localFile: TFile;
	heading: string;
}

interface NoteMatch {
	file: TFile;
	ids: number[];
}

export class SubjectNoteManager {
	constructor(
		private readonly app: App,
		private readonly client: BangumiClient,
		private readonly settings: BangumiPluginSettings,
	) {}

	async createOrAppendForCurrentFile(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!(file instanceof TFile)) {
			new Notice('当前活动文件不是已同步条目文件');
			return;
		}

		await this.createOrAppendForLocalFile(file);
	}

	async createOrAppendForLocalFile(localFile: TFile): Promise<void> {
		if (!this.settings.notePathTemplate.trim()) {
			new Notice('请先在设置中配置笔记路径模板');
			return;
		}

		const context = await this.resolveContext(localFile);
		if (!context) {
			new Notice('当前文件缺少有效的条目 ID，无法创建条目笔记');
			return;
		}

		const candidateIds = await this.buildCandidateIds(context.subject, localFile);
		const match = await this.findExistingNote(context.subject.id, candidateIds);
		const targetFile = match
			? await this.updateExistingNote(match, candidateIds, context.heading)
			: await this.createNewNote(context, candidateIds);

		await this.updateLocalNoteLink(localFile, targetFile.path, context.heading);
		await this.app.workspace.openLinkText(
			`${targetFile.path.replace(/\.md$/i, '')}#${context.heading}`,
			localFile.path,
			true
		);
		new Notice(match ? '已追加到共享笔记' : '已创建共享笔记');
	}

	private async resolveContext(localFile: TFile): Promise<SubjectNoteContext | null> {
		const cache = this.app.metadataCache.getFileCache(localFile);
		const frontmatter = cache?.frontmatter;
		const rawId: unknown = frontmatter?.id;
		const subjectId = this.toNumber(rawId);
		if (!subjectId) {
			return null;
		}

		const subject = await this.client.getSubject(subjectId);
		return {
			subject,
			localFile,
			heading: localFile.basename,
		};
	}

	private async buildCandidateIds(subject: Subject, localFile: TFile): Promise<number[]> {
		const ids = new Set<number>([subject.id]);
		const visited = new Set<string>();
		const queue: TFile[] = [localFile];

		while (queue.length > 0 && visited.size < 100) {
			const file = queue.shift();
			if (!(file instanceof TFile) || visited.has(file.path)) {
				continue;
			}

			visited.add(file.path);
			const content = await this.app.vault.read(file);
			const currentId = this.extractSubjectId(content);
			if (currentId) {
				ids.add(currentId);
			}

			for (const relatedFile of this.resolveRelatedFiles(content, file)) {
				if (visited.has(relatedFile.path)) {
					continue;
				}

				const relatedContent = await this.app.vault.read(relatedFile);
				const relatedId = this.extractSubjectId(relatedContent);
				if (relatedId) {
					ids.add(relatedId);
					queue.push(relatedFile);
				}
			}
		}

		return Array.from(ids).sort((a, b) => a - b);
	}

	private async findExistingNote(currentSubjectId: number, candidateIds: number[]): Promise<NoteMatch | null> {
		const files = this.app.vault.getMarkdownFiles();
		const matches: NoteMatch[] = [];

		for (const file of files) {
			const ids = await this.readNoteIds(file);
			if (ids.includes(currentSubjectId) || ids.some(id => candidateIds.includes(id))) {
				matches.push({ file, ids });
			}
		}

		if (matches.length === 0) {
			return null;
		}

		matches.sort((a, b) => a.file.path.localeCompare(b.file.path, 'zh-CN'));
		return matches[0];
	}

	private findLocalSubjectFile(subjectId: number): TFile | null {
		const scanRoot = normalizePath(this.settings.scanFolderPath || '');
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (scanRoot && !file.path.startsWith(scanRoot)) {
				continue;
			}

			const cache = this.app.metadataCache.getFileCache(file);
			const rawId: unknown = cache?.frontmatter?.id;
			if (this.toNumber(rawId) === subjectId) {
				return file;
			}
		}

		return null;
	}

	private extractSubjectId(content: string): number | null {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) {
			return null;
		}

		const idMatch = frontmatterMatch[1].match(/^id:\s*"?(\d+)"?\s*$/m);
		return idMatch ? Number(idMatch[1]) : null;
	}

	private resolveRelatedFiles(content: string, sourceFile: TFile): TFile[] {
		const relatedLinks = this.extractRelatedLinks(content);
		const files: TFile[] = [];

		for (const link of relatedLinks) {
			const linkPath = this.extractLinkPath(link);
			if (!linkPath) {
				continue;
			}

			const target = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourceFile.path);
			if (target instanceof TFile) {
				files.push(target);
			}
		}

		return files;
	}

	private extractRelatedLinks(content: string): string[] {
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
		if (!frontmatterMatch) {
			return [];
		}

		const frontmatter = frontmatterMatch[1];
		const arrayMatch = frontmatter.match(/^相关:\s*\n((?:\s+- .+\n?)+)/m);
		if (arrayMatch) {
			return arrayMatch[1]
				.split('\n')
				.map(line => {
					const match = line.match(/^\s+- ["']?(.+?)["']?$/);
					return match ? match[1].trim() : '';
				})
				.filter(link => link.includes('[[') && link.includes(']]'));
		}

		const inlineMatch = frontmatter.match(/^相关:\s*(.+)$/m);
		if (!inlineMatch) {
			return [];
		}

		return inlineMatch[1]
			.split(',')
			.map(link => link.trim().replace(/^["']|["']$/g, ''))
			.filter(link => link.includes('[[') && link.includes(']]'));
	}

	private extractLinkPath(link: string): string | null {
		const match = link.match(/^\[\[([^|\]]+)/);
		if (!match) {
			return null;
		}

		return match[1].split('#')[0].trim();
	}

	private async createNewNote(context: SubjectNoteContext, candidateIds: number[]): Promise<TFile> {
		const notePath = normalizePath(generateFilePath(this.settings.notePathTemplate, context.subject));
		const existing = this.app.vault.getAbstractFileByPath(notePath);
		if (existing instanceof TFile) {
			const ids = await this.readNoteIds(existing);
			return this.updateExistingNote({ file: existing, ids }, candidateIds, context.heading);
		}

		await this.ensureParentFolder(notePath);
		const content = this.renderNoteTemplate(context.subject, candidateIds, context.heading);
		return this.app.vault.create(notePath, content);
	}

	private async updateExistingNote(match: NoteMatch, candidateIds: number[], heading: string): Promise<TFile> {
		const mergedIds = Array.from(new Set([...match.ids, ...candidateIds])).sort((a, b) => a - b);

		await this.app.vault.process(match.file, (content) => {
			let nextContent = this.upsertNoteIds(content, mergedIds);
			if (!this.hasHeading(nextContent, heading)) {
				nextContent = this.appendEntrySection(nextContent, heading);
			}
			return nextContent;
		});

		return match.file;
	}

	private renderNoteTemplate(subject: Subject, ids: number[], heading: string): string {
		return renderContentTemplate(this.settings.noteTemplateContent, {
			id_yaml: this.formatNoteIds(ids),
			primary_id: String(subject.id),
			name: subject.name || '',
			name_cn: subject.name_cn || '',
			entry_heading: heading,
		});
	}

	private async updateLocalNoteLink(localFile: TFile, notePath: string, heading: string): Promise<void> {
		const noteTarget = notePath.replace(/\.md$/i, '');
		const noteLink = `[[${noteTarget}#${heading}|${heading}笔记]]`;

		await this.app.vault.process(localFile, (content) => this.upsertFrontmatterField(content, '笔记', noteLink));
	}

	private async ensureParentFolder(filePath: string): Promise<void> {
		const slashIndex = filePath.lastIndexOf('/');
		if (slashIndex < 0) {
			return;
		}

		const folderPath = filePath.slice(0, slashIndex);
		if (!folderPath) {
			return;
		}

		const segments = folderPath.split('/').filter(Boolean);
		let current = '';
		for (const segment of segments) {
			current = current ? `${current}/${segment}` : segment;
			if (!this.app.vault.getAbstractFileByPath(current)) {
				await this.app.vault.createFolder(current);
			}
		}
	}

	private async readNoteIds(file: TFile): Promise<number[]> {
		const cache = this.app.metadataCache.getFileCache(file);
		const frontmatterNoteId: unknown = cache?.frontmatter?.['笔记ID'];
		const cachedIds = this.normalizeIdValues(frontmatterNoteId);
		if (cachedIds.length > 0) {
			return cachedIds;
		}

		const content = await this.app.vault.read(file);
		const match = content.match(/^---\n([\s\S]*?)\n---/);
		if (!match) {
			return [];
		}

		const lines = match[1].split('\n');
		const ids: number[] = [];
		let collecting = false;
		for (const line of lines) {
			if (/^笔记ID:\s*\[.*\]\s*$/.test(line)) {
				return this.parseInlineNoteIds(line);
			}
			if (/^笔记ID:\s*$/.test(line)) {
				collecting = true;
				continue;
			}
			if (collecting) {
				const itemMatch = line.match(/^\s*-\s*(\d+)\s*$/);
				if (itemMatch) {
					ids.push(Number(itemMatch[1]));
					continue;
				}
				if (/^\S/.test(line)) {
					break;
				}
			}
		}
		return Array.from(new Set(ids)).sort((a, b) => a - b);
	}

	private normalizeIdValues(value: unknown): number[] {
		if (typeof value === 'string') {
			const inlineMatch = value.match(/^\[(.*)\]$/);
			if (inlineMatch) {
				return inlineMatch[1]
					.split(',')
					.map(item => this.toNumber(item.trim()))
					.filter((item): item is number => item !== null)
					.sort((a, b) => a - b);
			}
		}

		if (Array.isArray(value)) {
			return value
				.map(item => this.toNumber(item))
				.filter((item): item is number => item !== null)
				.sort((a, b) => a - b);
		}

		const single = this.toNumber(value);
		return single ? [single] : [];
	}

	private parseInlineNoteIds(line: string): number[] {
		const match = line.match(/^笔记ID:\s*\[(.*)\]\s*$/);
		if (!match) {
			return [];
		}

		return match[1]
			.split(',')
			.map(item => this.toNumber(item.trim()))
			.filter((item): item is number => item !== null)
			.sort((a, b) => a - b);
	}

	private formatNoteIds(ids: number[]): string {
		return ids.map(id => `  - ${id}`).join('\n');
	}

	private toNumber(value: unknown): number | null {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
			return Number(value.trim());
		}
		return null;
	}

	private upsertNoteIds(content: string, ids: number[]): string {
		const idBlock = `笔记ID:\n${this.formatNoteIds(ids)}`;
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

		if (!frontmatterMatch) {
			return `---\n${idBlock}\n---\n\n${content.trimStart()}`;
		}

		const body = frontmatterMatch[1];
		let nextBody: string;
		if (/^笔记ID:.*(?:\n(?:\s*-\s*.+\s*)+)*/m.test(body)) {
			nextBody = body.replace(/^笔记ID:.*(?:\n(?:\s*-\s*.+\s*)+)*/m, idBlock);
		} else {
			nextBody = `${idBlock}\n${body}`;
		}

		return content.replace(/^---\n[\s\S]*?\n---/, `---\n${nextBody}\n---`);
	}

	private hasHeading(content: string, heading: string): boolean {
		const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return new RegExp(`^#\\s+${escaped}\\s*$`, 'm').test(content);
	}

	private appendEntrySection(content: string, heading: string): string {
		const suffix = `# ${heading}\n\n## 记录\n\n## 感想\n`;
		return `${content.replace(/\s*$/, '')}\n\n${suffix}`;
	}

	private upsertFrontmatterField(content: string, fieldName: string, value: string): string {
		const fieldLine = `${fieldName}: "${value.replace(/"/g, '\\"')}"`;
		const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

		if (!frontmatterMatch) {
			return `---\n${fieldLine}\n---\n\n${content.trimStart()}`;
		}

		const body = frontmatterMatch[1];
		const fieldPattern = new RegExp(`^${fieldName}:.*$`, 'm');
		const nextBody = fieldPattern.test(body)
			? body.replace(fieldPattern, fieldLine)
			: `${body}\n${fieldLine}`;

		return content.replace(/^---\n[\s\S]*?\n---/, `---\n${nextBody}\n---`);
	}
}
