import { TFile } from 'obsidian';
import { CollectionType, UserCollection } from '../../common/api/types';
import { LocalEpisodeStatus } from '../episode/types';
import { LocalSubjectSnapshot } from '../document/types';

export type FieldDecision = 'local' | 'cloud' | 'merge' | 'skip';

export interface FieldDiff<T> {
	localValue: T | null;
	cloudValue: T | null;
	hasDiff: boolean;
	decision: FieldDecision;
}

export type PlatformFieldKey = 'episodeCount' | 'chapterCount' | 'volumeCount' | 'serialState';
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
	serialStatus?: string | null;
	progress?: string | null;
	start?: string | null;
	end?: string | null;
	episodeCount?: number | null;
	chapterCount?: number | null;
	volumeCount?: number | null;
}

export type StatusSyncLoadState = 'pending' | 'loading' | 'ready' | 'failed';

export interface StatusSyncDiff {
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
