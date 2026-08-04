export type SubjectIdentitySource = 'id' | 'BangumiID' | 'bangumi-url' | 'cover-path' | 'missing';

export interface SubjectIdentityConflict {
	source: Exclude<SubjectIdentitySource, 'missing'>;
	value: number;
}

export interface SubjectIdentity {
	subjectId: number | null;
	source: SubjectIdentitySource;
	conflicts?: SubjectIdentityConflict[];
}

export function parsePositiveSubjectId(value: unknown): number | null {
	if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
		return value;
	}
	if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
		const parsed = Number(value.trim());
		return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
	}
	return null;
}
