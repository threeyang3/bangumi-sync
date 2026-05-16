import { describe, expect, it } from 'vitest';
import { SubjectType, type InfoboxItem } from '../../common/api/types';
import { parseAnimeInfo, parseInfoByType, parseRealInfo } from '../../common/parser/infoboxParser';

describe('infoboxParser media serial status', () => {
	it('treats anime with 播放结束 as completed', () => {
		const infobox: InfoboxItem[] = [
			{ key: '放送开始', value: '2020-04-11' },
			{ key: '播放结束', value: '2020-06-27' },
			{ key: '话数', value: '12' },
		];

		const parsed = parseAnimeInfo(infobox, 'TV');

		expect(parsed.start).toBe('2020-04-11');
		expect(parsed.end).toBe('2020-06-27');
		expect(parsed.status).toBe('已完结');
		expect(parsed.progress).toBe('2020-04-11 - 2020-06-27');
	});

	it('treats real-world subjects with 播放结束 as completed', () => {
		const infobox: InfoboxItem[] = [
			{ key: '播放开始', value: '2024-01-01' },
			{ key: '播放结束', value: '2024-03-31' },
			{ key: '集数', value: '10' },
		];

		const parsed = parseRealInfo(infobox, '电视剧');

		expect(parsed.start).toBe('2024-01-01');
		expect(parsed.end).toBe('2024-03-31');
		expect(parsed.status).toBe('已完结');
	});

	it('routes anime parse-by-type through the same completed-status logic', () => {
		const infobox: InfoboxItem[] = [
			{ key: '放送开始', value: '2020-04-11' },
			{ key: '播放结束', value: '2020-06-27' },
		];

		const parsed = parseInfoByType(infobox, SubjectType.Anime, 'TV');

		expect(parsed.status).toBe('已完结');
		expect(parsed.end).toBe('2020-06-27');
	});
});
