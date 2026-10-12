import { normalizePathCollisionKey } from '../../common/file/pathUtils';
import type { PersistentRecoveryJournal } from './recoveryJournal';
import type { TransactionRecoveryExpectations, RecoveryCreatedFileExpectation } from './syncTransaction';

/** Preserve find's first-match semantics, including colliding spellings and missing facts. */
export function matchCreatedPathExpectations(
	expectations: readonly RecoveryCreatedFileExpectation[],
	paths: readonly string[],
): RecoveryCreatedFileExpectation[] {
	const firstByPath = new Map<string, RecoveryCreatedFileExpectation>();
	for (const item of expectations) {
		const key = normalizePathCollisionKey(item.createdPath);
		if (!firstByPath.has(key)) firstByPath.set(key, item);
	}
	return paths.map(path => firstByPath.get(normalizePathCollisionKey(path))
		?? { subjectId: -1, createdPath: path, expectedToExistAfterRollback: false });
}

/** Last value wins while the first insertion determines order, as with Map.set. */
class IndexedFacts<T, K> {
	private readonly positions = new Map<K, number>();
	private values: T[] = [];

	constructor(initial: readonly T[], private readonly keyOf: (item: T) => K, private readonly same: (left: T, right: T) => boolean) {
		this.merge(initial);
	}

	merge(incoming: readonly T[]): T[] {
		// Published arrays and their entries remain snapshots for queued journal writes.
		let next = this.values;
		for (const item of incoming) {
			const key = this.keyOf(item);
			const position = this.positions.get(key);
			if (position !== undefined && this.same(next[position], item)) continue;
			if (next === this.values) next = this.values.slice();
			if (position === undefined) {
				this.positions.set(key, next.length);
				next.push({ ...item });
			} else {
				next[position] = { ...item };
			}
		}
		this.values = next;
		return next;
	}
}

/** Owned by one journal object; caches are never serialized or shared across journals. */
export class RecoveryFactIndex {
	private readonly pathKeys = new Map<string, string>();
	private readonly created;
	private readonly contents;
	private readonly renames;

	constructor(journal: PersistentRecoveryJournal) {
		this.created = new IndexedFacts(journal.createdPathExpectations, item => this.pathKey(item.createdPath), (left, right) =>
			left.subjectId === right.subjectId && left.createdPath === right.createdPath
			&& left.expectedToExistAfterRollback === right.expectedToExistAfterRollback);
		this.contents = new IndexedFacts(journal.contentExpectations, item => this.pathKey(item.path), (left, right) =>
			left.subjectId === right.subjectId && left.path === right.path && left.expectedContentHash === right.expectedContentHash
			&& left.originalContentLength === right.originalContentLength && left.originalContent === right.originalContent);
		this.renames = new IndexedFacts(journal.renameExpectations, item => item.subjectId, (left, right) =>
			left.subjectId === right.subjectId && left.originalPath === right.originalPath && left.finalPath === right.finalPath
			&& left.temporaryPath === right.temporaryPath && left.expectedTerminalPath === right.expectedTerminalPath);
	}

	private pathKey(path: string): string {
		let key = this.pathKeys.get(path);
		if (key === undefined) {
			key = normalizePathCollisionKey(path);
			this.pathKeys.set(path, key);
		}
		return key;
	}

	mergeInto(journal: PersistentRecoveryJournal, facts: TransactionRecoveryExpectations): void {
		journal.createdPathExpectations = this.created.merge(facts.createdFiles);
		journal.contentExpectations = this.contents.merge(facts.updatedContents);
		journal.renameExpectations = this.renames.merge(facts.renames);
	}
}
