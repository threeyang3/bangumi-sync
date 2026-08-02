import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { isDescendantPath, normalizePathCollisionKey } from '../../common/file/pathUtils';
import { SubjectDocumentService } from '../document/subjectDocumentService';
import { SubjectIdentitySource } from '../document/subjectIdentity';

export type SubjectNamingState = 'managed' | 'user-renamed' | 'unknown';
export type LocalFileProblemSeverity = 'safe-auto-fix' | 'needs-user-decision' | 'blocking-error';

export interface LocalSubjectRecord {
	subjectId: number;
	path: string;
	nameCn: string;
	identitySource: Exclude<SubjectIdentitySource, 'missing'>;
	namingState: SubjectNamingState;
}

export interface SubjectPathState {
	subjectId: number;
	currentPath: string;
	lastManagedPath?: string;
	namingState: Exclude<SubjectNamingState, 'unknown'>;
}

export interface LocalFileProblem {
	path: string;
	severity: LocalFileProblemSeverity;
	code: 'missing-id' | 'identity-conflict' | 'duplicate-id' | 'path-collision';
	message: string;
	subjectId?: number;
}

export class LocalSubjectRegistry {
	readonly idToRecord = new Map<number, LocalSubjectRecord>();
	readonly pathToId = new Map<string, number>();
	readonly duplicateIds = new Map<number, string[]>();
	readonly invalidFiles: LocalFileProblem[] = [];
	private readonly lastManagedPaths = new Map<number, string>();

	private readonly app: App;
	private readonly documentService: SubjectDocumentService;

	constructor(app: App, documentService = new SubjectDocumentService(app)) {
		this.app = app;
		this.documentService = documentService;
	}

	clear(): void {
		this.idToRecord.clear();
		this.pathToId.clear();
		this.duplicateIds.clear();
		this.invalidFiles.length = 0;
		this.lastManagedPaths.clear();
	}

	async scan(folderPath: string, onProgress?: (current: number, total: number) => void): Promise<number> {
		this.clear();
		const normalizedRoot = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalizedRoot);
		if (!(folder instanceof TFolder)) {
			return 0;
		}

		const files = this.app.vault.getMarkdownFiles().filter(file => isDescendantPath(file.path, normalizedRoot));
		let processed = 0;
		for (const file of files) {
			await this.indexFile(file);
			processed++;
			onProgress?.(processed, files.length);
		}
		return this.idToRecord.size;
	}

	async indexFile(file: TFile, namingState: SubjectNamingState = 'unknown'): Promise<void> {
		const content = await this.app.vault.read(file);
		const identity = this.documentService.getSubjectIdentityFromContent(content);
		if (identity.subjectId === null) {
			this.invalidFiles.push({
				path: file.path,
				severity: 'needs-user-decision',
				code: 'missing-id',
				message: 'No valid Bangumi subject ID was found.',
			});
			return;
		}
		if (identity.conflicts?.length) {
			this.invalidFiles.push({
				path: file.path,
				subjectId: identity.subjectId,
				severity: 'blocking-error',
				code: 'identity-conflict',
				message: `Conflicting subject IDs: ${identity.conflicts.map(conflict => `${conflict.source}=${conflict.value}`).join(', ')}`,
			});
			return;
		}

		const frontmatter = this.documentService.extractFrontmatterRecord(content);
		const nameValue = frontmatter['中文名'] ?? frontmatter.name_cn;
		this.register({
			subjectId: identity.subjectId,
			path: normalizePath(file.path),
			nameCn: typeof nameValue === 'string' ? nameValue.trim() : file.basename,
			identitySource: identity.source as Exclude<SubjectIdentitySource, 'missing'>,
			namingState,
		});
	}

	register(record: LocalSubjectRecord): void {
		const normalizedRecord = { ...record, path: normalizePath(record.path) };
		const collisionKey = normalizePathCollisionKey(normalizedRecord.path);
		const pathOwner = this.pathToId.get(collisionKey);
		if (pathOwner !== undefined && pathOwner !== record.subjectId) {
			this.invalidFiles.push({
				path: normalizedRecord.path,
				subjectId: record.subjectId,
				severity: 'blocking-error',
				code: 'path-collision',
				message: `Path is already owned by subject ${pathOwner}.`,
			});
			return;
		}

		const existing = this.idToRecord.get(record.subjectId);
		if (existing && normalizePathCollisionKey(existing.path) !== collisionKey) {
			const paths = Array.from(new Set([existing.path, normalizedRecord.path]));
			this.duplicateIds.set(record.subjectId, paths);
			this.idToRecord.delete(record.subjectId);
			for (const path of paths) {
				this.invalidFiles.push({
					path,
					subjectId: record.subjectId,
					severity: 'blocking-error',
					code: 'duplicate-id',
					message: `Subject ${record.subjectId} appears in multiple files.`,
				});
			}
			this.pathToId.set(collisionKey, record.subjectId);
			return;
		}

		const duplicatePaths = this.duplicateIds.get(record.subjectId);
		if (duplicatePaths) {
			if (!duplicatePaths.includes(normalizedRecord.path)) {
				duplicatePaths.push(normalizedRecord.path);
			}
			this.pathToId.set(collisionKey, record.subjectId);
			return;
		}

		this.idToRecord.set(record.subjectId, normalizedRecord);
		this.pathToId.set(collisionKey, record.subjectId);
	}

	getById(subjectId: number): LocalSubjectRecord | undefined {
		return this.duplicateIds.has(subjectId) ? undefined : this.idToRecord.get(subjectId);
	}

	getPathOwner(path: string): number | undefined {
		return this.pathToId.get(normalizePathCollisionKey(path));
	}

	upsert(record: LocalSubjectRecord): void {
		const previous = this.idToRecord.get(record.subjectId);
		if (previous) {
			this.pathToId.delete(normalizePathCollisionKey(previous.path));
			this.idToRecord.delete(record.subjectId);
		}
		this.register(record);
		if (record.namingState === 'managed') {
			this.lastManagedPaths.set(record.subjectId, normalizePath(record.path));
		}
	}

	reconcilePathStates(states: Readonly<Record<string, SubjectPathState>>): void {
		for (const [subjectId, record] of this.idToRecord) {
			const state = states[String(subjectId)];
			if (!state) {
				this.idToRecord.set(subjectId, { ...record, namingState: 'unknown' });
				continue;
			}
			if (state.lastManagedPath) {
				this.lastManagedPaths.set(subjectId, normalizePath(state.lastManagedPath));
			}
			const currentKey = normalizePathCollisionKey(record.path);
			const savedCurrentKey = normalizePathCollisionKey(state.currentPath);
			const lastManagedKey = state.lastManagedPath
				? normalizePathCollisionKey(state.lastManagedPath)
				: undefined;
			const namingState: SubjectNamingState = currentKey !== savedCurrentKey
				? 'user-renamed'
				: lastManagedKey === currentKey
					? 'managed'
					: state.namingState;
			this.idToRecord.set(subjectId, { ...record, namingState });
		}
	}

	exportPathStates(): Record<string, SubjectPathState> {
		const result: Record<string, SubjectPathState> = {};
		for (const [subjectId, record] of this.idToRecord) {
			const managed = record.namingState === 'managed';
			result[String(subjectId)] = {
				subjectId,
				currentPath: record.path,
				lastManagedPath: managed ? record.path : this.lastManagedPaths.get(subjectId),
				namingState: managed ? 'managed' : 'user-renamed',
			};
		}
		return result;
	}
}
