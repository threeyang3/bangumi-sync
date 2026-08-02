import { limitPathLength, normalizePathCollisionKey, normalizePathValue } from '../../common/file/pathUtils';
import { SubjectNamingState } from './localSubjectRegistry';

export interface SubjectPathCandidate {
	subjectId: number;
	preferredPath: string;
	year?: string;
	currentPath?: string;
	namingState: SubjectNamingState;
}

export interface SubjectPathAllocation {
	subjectId: number;
	preferredPath: string;
	finalPath: string;
	collisionResolved: boolean;
	renameFrom?: string;
}

export interface SubjectPathPlan {
	allocations: Map<number, SubjectPathAllocation>;
	renamed: Array<{ subjectId: number; from: string; to: string }>;
}

function appendSuffix(path: string, suffix: string): string {
	const normalized = normalizePathValue(path);
	return limitPathLength(normalized.toLocaleLowerCase('en-US').endsWith('.md')
		? `${normalized.slice(0, -3)}${suffix}.md`
		: `${normalized}${suffix}.md`);
}

function collisionSuffix(candidate: SubjectPathCandidate, useYearOnly: boolean): string {
	const year = candidate.year?.match(/^\d{4}$/)?.[0];
	if (year && useYearOnly) {
		return `（${year}）`;
	}
	if (year) {
		return `（${year}）[bgm-${candidate.subjectId}]`;
	}
	return `[bgm-${candidate.subjectId}]`;
}

export class SubjectPathResolver {
	plan(
		candidates: SubjectPathCandidate[],
		occupiedPaths: ReadonlyMap<string, number> = new Map(),
	): SubjectPathPlan {
		const byId = new Map<number, SubjectPathCandidate>();
		for (const candidate of candidates) {
			if (byId.has(candidate.subjectId)) {
				throw new Error(`Duplicate subject ${candidate.subjectId} in path planning input.`);
			}
			byId.set(candidate.subjectId, {
				...candidate,
				preferredPath: normalizePathValue(candidate.preferredPath),
				currentPath: candidate.currentPath ? normalizePathValue(candidate.currentPath) : undefined,
			});
		}
		const sortedCandidates = Array.from(byId.values()).sort((left, right) => {
			const pathOrder = normalizePathCollisionKey(left.preferredPath)
				.localeCompare(normalizePathCollisionKey(right.preferredPath), 'en-US');
			return pathOrder || left.subjectId - right.subjectId;
		});

		const reservations = new Map<string, number>(occupiedPaths);
		const collisionGroups = new Map<string, SubjectPathCandidate[]>();
		for (const candidate of sortedCandidates) {
			const currentKey = candidate.currentPath ? normalizePathCollisionKey(candidate.currentPath) : undefined;
			const preferredKey = normalizePathCollisionKey(candidate.preferredPath);
			const group = collisionGroups.get(preferredKey) ?? [];
			group.push(candidate);
			collisionGroups.set(preferredKey, group);
			if (candidate.currentPath) {
				reservations.set(currentKey as string, candidate.subjectId);
			}
		}

		const allocations = new Map<number, SubjectPathAllocation>();
		const renamed: SubjectPathPlan['renamed'] = [];
		for (const group of collisionGroups.values()) {
			if (group.length < 2) continue;

			const movable = group.filter(candidate => !candidate.currentPath || (
				(candidate.namingState === 'managed' || candidate.namingState === 'inferred-managed')
				&& normalizePathCollisionKey(candidate.currentPath) === normalizePathCollisionKey(candidate.preferredPath)
			));
			for (const candidate of movable) {
				if (candidate.currentPath) {
					reservations.delete(normalizePathCollisionKey(candidate.currentPath));
				}
			}
			const years = group.map(candidate => candidate.year?.match(/^\d{4}$/)?.[0] ?? '');
			const useYearOnly = years.every(Boolean) && new Set(years).size === group.length;
			for (const candidate of movable) {
				const finalPath = this.reserveUnique(
					appendSuffix(candidate.preferredPath, collisionSuffix(candidate, useYearOnly)),
					candidate.subjectId,
					reservations,
				);
				const renameFrom = candidate.currentPath
					&& normalizePathCollisionKey(candidate.currentPath) !== normalizePathCollisionKey(finalPath)
					? candidate.currentPath
					: undefined;
				allocations.set(candidate.subjectId, {
					subjectId: candidate.subjectId,
					preferredPath: candidate.preferredPath,
					finalPath,
					collisionResolved: true,
					...(renameFrom ? { renameFrom } : {}),
				});
				if (renameFrom) {
					renamed.push({ subjectId: candidate.subjectId, from: renameFrom, to: finalPath });
				}
			}
		}

		for (const candidate of sortedCandidates) {
			if (allocations.has(candidate.subjectId)) continue;
			if (candidate.currentPath) {
				allocations.set(candidate.subjectId, {
					subjectId: candidate.subjectId,
					preferredPath: candidate.preferredPath,
					finalPath: candidate.currentPath,
					collisionResolved: false,
				});
				continue;
			}

			const preferredOwner = reservations.get(normalizePathCollisionKey(candidate.preferredPath));
			const needsSuffix = preferredOwner !== undefined && preferredOwner !== candidate.subjectId;
			const proposedPath = needsSuffix
				? appendSuffix(candidate.preferredPath, collisionSuffix(candidate, false))
				: candidate.preferredPath;
			const finalPath = this.reserveUnique(proposedPath, candidate.subjectId, reservations);
			allocations.set(candidate.subjectId, {
				subjectId: candidate.subjectId,
				preferredPath: candidate.preferredPath,
				finalPath,
				collisionResolved: normalizePathCollisionKey(finalPath) !== normalizePathCollisionKey(candidate.preferredPath),
			});
		}

		return { allocations, renamed };
	}

	private reserveUnique(path: string, subjectId: number, reservations: Map<string, number>): string {
		let candidatePath = path;
		let attempt = 1;
		while (true) {
			const key = normalizePathCollisionKey(candidatePath);
			const owner = reservations.get(key);
			if (owner === undefined || owner === subjectId) {
				reservations.set(key, subjectId);
				return candidatePath;
			}
			attempt++;
			candidatePath = appendSuffix(path, `［${attempt}］`);
		}
	}
}
