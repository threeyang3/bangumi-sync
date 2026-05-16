import { describe, expect, it } from 'vitest';
import { SubjectType } from '../../common/api/types';
import {
	importValuesEqual,
	mapLegacyRatingField,
	mergeSectionValues,
	normalizeImportValueForWrite,
	smartMergeImportValues,
} from '../../src/userData/importLogic';

describe('importLogic', () => {
	it('smart-merges list fields with deduplication', () => {
		expect(
			smartMergeImportValues(['悬疑', '热血'], '热血, 科幻', 'tags')
		).toEqual(['悬疑', '热血', '科幻']);

		expect(normalizeImportValueForWrite('纸质, Kindle, 纸质', '存储')).toEqual(['纸质', 'Kindle']);
	});

	it('smart-merges text sections with a separator', () => {
		expect(mergeSectionValues('本地感想', '导入感想')).toBe('本地感想\n\n---\n\n导入感想');
		expect(smartMergeImportValues('本地感想', '导入感想', '短评')).toBe('本地感想\n\n---\n\n导入感想');
	});

	it('compares values with list and numeric normalization', () => {
		expect(importValuesEqual(['悬疑', '热血'], '热血, 悬疑', 'tags')).toBe(true);
		expect(importValuesEqual('8', 8, '评分')).toBe(true);
		expect(importValuesEqual(' 第一段 \r\n第二段 ', '第一段\n第二段', '短评')).toBe(true);
		expect(importValuesEqual(['悬疑'], ['科幻'], 'tags')).toBe(false);
	});

	it('maps legacy rating fields by subject type and work type', () => {
		expect(mapLegacyRatingField({
			id: 1,
			name_cn: '动画',
			type: SubjectType.Anime,
		}, 'music')).toBe('音乐评分');

		expect(mapLegacyRatingField({
			id: 2,
			name_cn: '游戏',
			type: SubjectType.Game,
		}, 'fun')).toBe('趣味评分');

		expect(mapLegacyRatingField({
			id: 3,
			name_cn: '剧集',
			type: SubjectType.Real,
		}, 'character')).toBe('演技评分');

		expect(mapLegacyRatingField({
			id: 4,
			name_cn: '漫画',
			type: SubjectType.Book,
			workType: 'comic',
		}, 'drawing')).toBe('画工评分');

		expect(mapLegacyRatingField({
			id: 5,
			name_cn: '画集',
			type: SubjectType.Book,
			workType: 'album',
		}, 'character')).toBe('人设评分');

		expect(mapLegacyRatingField({
			id: 6,
			name_cn: '小说',
			type: SubjectType.Book,
			workType: 'novel',
		}, 'writing')).toBe('文笔评分');
	});
});
