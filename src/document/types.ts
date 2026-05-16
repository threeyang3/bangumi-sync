import { TFile } from 'obsidian';
import { LocalEpisodeStatus } from '../episode/types';

export interface LocalPlatformSyncContext {
	progress: string | null;
	start: string | null;
	end: string | null;
	episodeCount: number | null;
	chapterCount: number | null;
	volumeCount: number | null;
}

export interface PlatformMetadataUpdate {
	progress?: string | null;
	start?: string | null;
	end?: string | null;
	episodeCount?: number | null;
	chapterCount?: number | null;
	volumeCount?: number | null;
}

export interface LocalUserFieldsSnapshot {
	statusFieldName: string;
	rate: number | null;
	comment: string | null;
	tags: string[];
	status: number | null;
}

export interface LocalSectionSnapshot {
	record?: string;
	thoughts?: string;
}

export interface LocalSubjectSnapshot {
	file?: TFile;
	path?: string;
	mtime?: number;
	content: string;
	user: LocalUserFieldsSnapshot;
	platform: LocalPlatformSyncContext;
	sections: LocalSectionSnapshot;
	episodeStatusMap: Map<number, LocalEpisodeStatus>;
	shouldLoadEpisodeStatus: boolean;
	shouldLoadPlatformData: boolean;
}
