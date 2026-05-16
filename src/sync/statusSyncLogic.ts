import { SubjectType } from '../../common/api/types';
import { normalizeShortComment } from '../comment/shortComment';
import { LocalPlatformSyncContext } from '../document/types';

export interface StatusSyncFieldDiff<T> {
	localValue: T | null;
	cloudValue: T | null;
	hasDiff: boolean;
}

export interface UserStatusSyncDiffInput {
	localRate: number | null;
	cloudRate: number | null;
	localComment: string | null;
	cloudComment: string | null;
	localTags: string[];
	cloudTags: string[] | null;
	localStatus: number | null;
	cloudStatus: number | null;
}

export interface UserStatusSyncDiffResult {
	rate: StatusSyncFieldDiff<number>;
	comment: StatusSyncFieldDiff<string>;
	tags: StatusSyncFieldDiff<string[]>;
	status: StatusSyncFieldDiff<number>;
	hasUserDiff: boolean;
}

export function supportsPlatformDataSync(subjectType: SubjectType): boolean {
	return subjectType === SubjectType.Anime
		|| subjectType === SubjectType.Real
		|| subjectType === SubjectType.Book;
}

export function isCompletedSerialState(value: string | null | undefined): boolean {
	if (!value) {
		return false;
	}

	const normalized = value.replace(/\s+/g, '');
	return /(已完结|完结|已结束|放送结束|已完播|全\d+(话|集|卷)|完)/.test(normalized);
}

export function isPlatformDataCandidate(context: LocalPlatformSyncContext): boolean {
	if (isCompletedSerialState(context.serialStatus)) {
		return false;
	}

	if (context.end && context.end.trim().length > 0) {
		return false;
	}

	if (isCompletedSerialState(context.progress)) {
		return false;
	}

	return true;
}

export function shouldLoadPlatformData(
	subjectType: SubjectType,
	context: LocalPlatformSyncContext,
): boolean {
	return supportsPlatformDataSync(subjectType) && isPlatformDataCandidate(context);
}

export function buildUserStatusSyncDiff(input: UserStatusSyncDiffInput): UserStatusSyncDiffResult {
	const commentLocal = normalizeShortComment(input.localComment);
	const commentCloud = normalizeShortComment(input.cloudComment);
	const cloudTags = input.cloudTags && input.cloudTags.length > 0 ? input.cloudTags : null;

	const rate: StatusSyncFieldDiff<number> = {
		localValue: input.localRate,
		cloudValue: input.cloudRate,
		hasDiff: input.localRate !== input.cloudRate,
	};

	const comment: StatusSyncFieldDiff<string> = {
		localValue: commentLocal,
		cloudValue: commentCloud,
		hasDiff: commentLocal !== commentCloud,
	};

	const tags: StatusSyncFieldDiff<string[]> = {
		localValue: input.localTags,
		cloudValue: cloudTags,
		hasDiff: hasTagDiff(input.localTags, cloudTags),
	};

	const status: StatusSyncFieldDiff<number> = {
		localValue: input.localStatus,
		cloudValue: input.cloudStatus,
		hasDiff: input.localStatus !== input.cloudStatus,
	};

	return {
		rate,
		comment,
		tags,
		status,
		hasUserDiff: rate.hasDiff || comment.hasDiff || tags.hasDiff || status.hasDiff,
	};
}

function hasTagDiff(localTags: string[], cloudTags: string[] | null): boolean {
	const localTagSet = new Set(localTags.map(tag => normalizeTag(tag)));
	const cloudTagSet = new Set((cloudTags ?? []).map(tag => normalizeTag(tag)));

	return localTagSet.size !== cloudTagSet.size
		|| ![...localTagSet].every(tag => cloudTagSet.has(tag));
}

function normalizeTag(tag: string): string {
	return tag.toLowerCase().trim();
}
