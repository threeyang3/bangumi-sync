import { TFile } from 'obsidian';
import { CollectionType, UserCollection } from '../../common/api/types';
import { LocalEpisodeStatus } from '../episode/types';
import { LocalSubjectSnapshot } from '../document/types';

export type FieldDecision = 'local' | 'cloud' | 'merge' | 'skip';
export type StatusSyncScope = 'user' | 'platform' | 'mixed';
export type UserStatusSyncFieldKey = 'rate' | 'comment' | 'tags' | 'status' | 'episodeStatus';
export type PlatformFieldKey = 'episodeCount' | 'chapterCount' | 'volumeCount' | 'start' | 'end' | 'progress';

export interface StatusSyncFieldSelection {
        user: Record<UserStatusSyncFieldKey, boolean>;
        platform: Record<PlatformFieldKey, boolean>;
}

export interface PartialStatusSyncFieldSelection {
        user?: Partial<Record<UserStatusSyncFieldKey, boolean>>;
        platform?: Partial<Record<PlatformFieldKey, boolean>>;
}

export const USER_STATUS_SYNC_FIELD_KEYS: readonly UserStatusSyncFieldKey[] = [
        'rate',
        'comment',
        'tags',
        'status',
        'episodeStatus',
] as const;

export const PLATFORM_STATUS_SYNC_FIELD_KEYS: readonly PlatformFieldKey[] = [
        'episodeCount',
        'chapterCount',
        'volumeCount',
        'start',
        'end',
        'progress',
] as const;

export function createDefaultStatusSyncFieldSelection(): StatusSyncFieldSelection {
        return {
                user: {
                        rate: true,
                        comment: true,
                        tags: true,
                        status: true,
                        episodeStatus: true,
                },
                platform: {
                        episodeCount: false,
                        chapterCount: false,
                        volumeCount: false,
                        start: false,
                        end: false,
                        progress: false,
                },
        };
}

export function normalizeStatusSyncFieldSelection(
        selection?: PartialStatusSyncFieldSelection | null,
): StatusSyncFieldSelection {
        const defaults = createDefaultStatusSyncFieldSelection();
        return {
                user: {
                        ...defaults.user,
                        ...(selection?.user ?? {}),
                },
                platform: {
                        ...defaults.platform,
                        ...(selection?.platform ?? {}),
                },
        };
}

export function cloneStatusSyncFieldSelection(selection: StatusSyncFieldSelection): StatusSyncFieldSelection {
        return normalizeStatusSyncFieldSelection(selection);
}

export function hasSelectedUserFields(selection: StatusSyncFieldSelection): boolean {
        return USER_STATUS_SYNC_FIELD_KEYS.some(key => selection.user[key]);
}

export function hasSelectedPlatformFields(selection: StatusSyncFieldSelection): boolean {
        return PLATFORM_STATUS_SYNC_FIELD_KEYS.some(key => selection.platform[key]);
}

export function getStatusSyncScope(selection: StatusSyncFieldSelection): StatusSyncScope {
        const hasUser = hasSelectedUserFields(selection);
        const hasPlatform = hasSelectedPlatformFields(selection);
        if (hasUser && hasPlatform) {
                return 'mixed';
        }
        if (hasPlatform) {
                return 'platform';
        }
        return 'user';
}

export interface FieldDiff<T> {
	localValue: T | null;
	cloudValue: T | null;
	hasDiff: boolean;
	decision: FieldDecision;
}

export type PlatformFieldDecision = 'cloud' | 'skip';

export interface PlatformFieldDiff {
	key: PlatformFieldKey;
	label: string;
	localValue: string | null;
	cloudValue: string | null;
	hasDiff: boolean;
	decision: PlatformFieldDecision;
}

export interface PlatformSyncPayload {
	progress?: string | null;
	start?: string | null;
	end?: string | null;
	episodeCount?: number | null;
	chapterCount?: number | null;
	volumeCount?: number | null;
}

export type StatusSyncLoadState = 'pending' | 'loading' | 'ready' | 'failed';

export interface StatusSyncDiff {
	scope: StatusSyncScope;
	subjectId: number;
	name_cn: string;
	name: string;
	localPath: string;
	collection: UserCollection;
	statusFieldName: string;
	rate: FieldDiff<number>;
	comment: FieldDiff<string>;
	tags: FieldDiff<string[]>;
	status: FieldDiff<number>;
	episodeStatus: FieldDiff<string>;
	platformFields: PlatformFieldDiff[];
	platformSyncPayload?: PlatformSyncPayload;
	hasUserDiff: boolean;
	hasPlatformDiff: boolean;
	hasAnyDiff: boolean;
	expanded: boolean;
	episodeStatusLoadState: StatusSyncLoadState;
	platformLoadState: StatusSyncLoadState;
	backgroundError: string | null;
}

export interface StatusSyncLocalSubjectInfo {
	id: number;
	path: string;
	name_cn: string;
}

export interface StatusSyncSnapshot {
	subjectId: number;
	collection: UserCollection;
	localInfo: StatusSyncLocalSubjectInfo;
	file: TFile;
	localSnapshot: LocalSubjectSnapshot;
}

export interface StatusSyncBuildContext {
	subjectCache: Map<number, Promise<import('../../common/api/types').Subject>>;
	cloudEpisodeStatusCache: Map<number, Promise<Map<number, LocalEpisodeStatus>>>;
	platformDiffCache: Map<number, Promise<{ fields: PlatformFieldDiff[]; payload?: PlatformSyncPayload }>>;
}

export interface StatusSyncExecutionSummary {
	successCount: number;
	failCount: number;
}

export type CloudCollectionUpdates = {
	type?: CollectionType;
	rate?: number;
	comment?: string;
	tags?: string[];
};
