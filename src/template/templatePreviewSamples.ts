import { CollectionType, Episode, Subject, SubjectType, UserCollection } from '../../common/api/types';
import { CharacterInfo } from '../../common/parser/characterParser';
import { TemplateKey } from '../../common/template/templateRegistry';
import { templateNode } from '../../common/template/templateSystem';

const profiles: Record<TemplateKey, { type: SubjectType; category: string; title: string; fields: Record<string, string> }> = {
	animeTemplateConfig: { type: SubjectType.Anime, category: 'TV', title: '星海列车', fields: { 导演: '示例动画导演', 动画制作: '星海动画工作室', 原作: '原创动画', 音乐: '示例作曲家', 话数: '3', 脚本: '示例编剧' } },
	novelTemplateConfig: { type: SubjectType.Book, category: '小说', title: '风之图书馆', fields: { 作者: '示例小说作者', 插图: '示例插画师', 出版社: '星光文库', 书系: '幻想故事系列', 册数: '3', 开始: '2026-01-01' } },
	comicTemplateConfig: { type: SubjectType.Book, category: '漫画', title: '云端画室', fields: { 作者: '示例漫画原作', 作画: '示例漫画家', 出版社: '青空出版社', 连载杂志: '月刊示例漫画', 册数: '3', 话数: '3', 开始: '2026-01-01' } },
	albumTemplateConfig: { type: SubjectType.Book, category: '画集', title: '四季色彩集', fields: { 作者: '示例画师', 出版社: '色彩出版社', 页数: '128', ISBN: '9780000000002' } },
	gameTemplateConfig: { type: SubjectType.Game, category: '游戏', title: '浮岛探险', fields: { 开发: '浮岛游戏工作室', 发行: '示例发行商', 平台: 'PC', 游玩人数: '1人', 剧本: '示例游戏编剧', 原画: '示例原画师', 音乐: '示例游戏音乐家', 制作人: '示例制作人', 售价: '68元' } },
	musicTemplateConfig: { type: SubjectType.Music, category: '音乐', title: '晨光旋律', fields: { 艺术家: '示例音乐人', 作曲: '示例作曲家', 厂牌: '晨光唱片', 碟片数量: '1' } },
	realTemplateConfig: { type: SubjectType.Real, category: '电视剧', title: '街角故事', fields: { 导演: '示例影视导演', 编剧: '示例影视编剧', 主演: '示例演员甲、示例演员乙', '国家/地区': '中国', 语言: '中文', 集数: '3', 每集长: '45分钟', 电视台: '示例电视台' } },
};

/** Fresh, fictional offline data for the selected node; never reads a user's vault or account. */
export function createTemplatePreviewSample(nodeId: string) {
	const node = templateNode(nodeId);
	const profile = profiles[node.templateKey];
	const category = node.category ?? profile.category;
	const title = `${profile.title}（${category}示例）`;
	const subject: Subject = {
		id: 900000 + Object.keys(profiles).indexOf(node.templateKey), type: profile.type,
		name: `Sample ${node.templateKey.replace('TemplateConfig', '')}`, name_cn: title,
		summary: `这是虚构的${category}内置示例，用于展示相应模板的排版与字段，不代表真实作品。`,
		date: '2026-01-01', platform: category, images: {},
		infobox: Object.entries({ ...profile.fields, 类型: category, ...(profile.type === SubjectType.Game ? { 游戏类型: category } : {}) }).map(([key, value]) => ({ key, value })),
		rating: { rank: 120, total: 100, score: 8.2, count: {} },
		collection: { wish: 12, collect: 30, doing: 8, on_hold: 2, dropped: 1 },
		tags: [], nsfw: false, locked: false, series: false, volumes: profile.type === SubjectType.Book ? 3 : 0,
		eps: 3, total_episodes: 3, meta_tags: [],
	};
	const hasEpisodes = ['animeTemplateConfig', 'novelTemplateConfig', 'comicTemplateConfig', 'realTemplateConfig'].includes(node.templateKey);
	const episodes: Episode[] = hasEpisodes ? ['启程', '相遇', '归途'].map((name, index) => ({
		id: subject.id * 10 + index, subject_id: subject.id, type: 0, sort: index + 1,
		name: `Sample ${index + 1}`, name_cn: `${node.templateKey === 'novelTemplateConfig' ? '卷' : '第'}${index + 1}：${name}`,
		airdate: `2026-01-0${index + 1}`, duration: '24m', desc: '虚构章节示例', comment: 0,
	})) : [];
	const characters: CharacterInfo[] = ['animeTemplateConfig', 'novelTemplateConfig', 'comicTemplateConfig', 'gameTemplateConfig'].includes(node.templateKey)
		? [{ name: '示例主角·小光', role: '主角', cv: profile.type === SubjectType.Anime || profile.type === SubjectType.Game ? '示例配音演员' : '', image: '' }] : [];
	const collection: UserCollection = {
		subject_id: subject.id, subject_type: subject.type, type: CollectionType.Doing, rate: 8,
		comment: `这是${category}的虚构短评示例。`, tags: ['内置示例', category], ep_status: 1, vol_status: 1,
		updated_at: '2026-01-02T00:00:00Z', private: false,
		subject: { ...subject, short_summary: subject.summary, collection_total: 53, score: 8.2, rank: 120 },
	};
	return { subject, collection, characters, episodes, userEpisodeStatus: episodes.map((episode, index) => ({ episode, type: index === 0 ? 2 : 0, updated_at: 0 })) };
}
