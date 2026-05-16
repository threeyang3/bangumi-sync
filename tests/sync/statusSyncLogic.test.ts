import { describe, expect, it } from 'vitest';
import { SubjectType } from '../../common/api/types';
import {
	buildUserStatusSyncDiff,
	isCompletedSerialState,
	isPlatformDataCandidate,
	shouldLoadPlatformData,
	supportsPlatformDataSync,
} from '../../src/sync/statusSyncLogic';

describe('statusSyncLogic', () => {
	it('compares user data independently from platform completion state', () => {
		const result = buildUserStatusSyncDiff({
			localRate: 8,
			cloudRate: 9,
			localComment: '第一段。\n\n第二段。',
			cloudComment: '第一段。\n第二段。',
			localTags: ['热血', '悬疑'],
			cloudTags: ['悬疑', '热血'],
			localStatus: 3,
			cloudStatus: 2,
		});

		expect(result.rate.hasDiff).toBe(true);
		expect(result.comment.hasDiff).toBe(false);
		expect(result.tags.hasDiff).toBe(false);
		expect(result.status.hasDiff).toBe(true);
		expect(result.hasUserDiff).toBe(true);
	});

	it('marks completed serial states as non-candidates for platform sync', () => {
		expect(isCompletedSerialState('已完结')).toBe(true);
		expect(isCompletedSerialState('放送结束')).toBe(true);
		expect(isCompletedSerialState('全12话')).toBe(true);
		expect(isCompletedSerialState('连载中')).toBe(false);

		expect(isPlatformDataCandidate({
			serialStatus: '已完结',
			progress: null,
			start: null,
			end: null,
			episodeCount: 12,
			chapterCount: null,
			volumeCount: null,
		})).toBe(false);
	});

	it('allows incomplete or unknown local entries to request platform data', () => {
		expect(isPlatformDataCandidate({
			serialStatus: '连载中',
			progress: '更新至第12集',
			start: '2024-01-01',
			end: null,
			episodeCount: 12,
			chapterCount: null,
			volumeCount: null,
		})).toBe(true);

		expect(isPlatformDataCandidate({
			serialStatus: null,
			progress: null,
			start: null,
			end: null,
			episodeCount: null,
			chapterCount: null,
			volumeCount: null,
		})).toBe(true);
	});

	it('loads platform data only for supported subject types', () => {
		const context = {
			serialStatus: '连载中',
			progress: null,
			start: null,
			end: null,
			episodeCount: null,
			chapterCount: null,
			volumeCount: null,
		};

		expect(supportsPlatformDataSync(SubjectType.Anime)).toBe(true);
		expect(supportsPlatformDataSync(SubjectType.Real)).toBe(true);
		expect(supportsPlatformDataSync(SubjectType.Book)).toBe(true);
		expect(supportsPlatformDataSync(SubjectType.Game)).toBe(false);

		expect(shouldLoadPlatformData(SubjectType.Anime, context)).toBe(true);
		expect(shouldLoadPlatformData(SubjectType.Book, context)).toBe(true);
		expect(shouldLoadPlatformData(SubjectType.Game, context)).toBe(false);
	});

	it('blocks platform loading when local end metadata already indicates completion', () => {
		expect(shouldLoadPlatformData(SubjectType.Book, {
			serialStatus: null,
			progress: null,
			start: '2020-01-01',
			end: '2021-01-01',
			episodeCount: null,
			chapterCount: 98,
			volumeCount: 10,
		})).toBe(false);
	});
});
