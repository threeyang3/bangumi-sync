import { SubjectType } from '../api/types';

export type TemplateKey =
	| 'animeTemplateConfig'
	| 'novelTemplateConfig'
	| 'comicTemplateConfig'
	| 'gameTemplateConfig'
	| 'albumTemplateConfig'
	| 'musicTemplateConfig'
	| 'realTemplateConfig';

export interface TemplateCategoryOption {
	key: string;
	label: string;
	category: string;
	templateKey: TemplateKey;
}

export const TEMPLATE_CATEGORY_OPTIONS: TemplateCategoryOption[] = [
	{ key: 'anime-tv', label: 'TV', category: 'TV', templateKey: 'animeTemplateConfig' },
	{ key: 'anime-ova', label: 'OVA', category: 'OVA', templateKey: 'animeTemplateConfig' },
	{ key: 'anime-web', label: 'WEB', category: 'WEB', templateKey: 'animeTemplateConfig' },
	{ key: 'anime-movie', label: '剧场版', category: '剧场版', templateKey: 'animeTemplateConfig' },
	{ key: 'book-novel', label: '小说', category: '小说', templateKey: 'novelTemplateConfig' },
	{ key: 'book-light-novel', label: '轻小说', category: '轻小说', templateKey: 'novelTemplateConfig' },
	{ key: 'book-comic', label: '漫画', category: '漫画', templateKey: 'comicTemplateConfig' },
	{ key: 'book-album', label: '画集', category: '画集', templateKey: 'albumTemplateConfig' },
	{ key: 'book-picture-book', label: '画本', category: '画本', templateKey: 'albumTemplateConfig' },
	{ key: 'book-artbook', label: '画册', category: '画册', templateKey: 'albumTemplateConfig' },
	{ key: 'book-illustrated-book', label: '绘本', category: '绘本', templateKey: 'albumTemplateConfig' },
	{ key: 'book-guide-book', label: '公式书', category: '公式书', templateKey: 'albumTemplateConfig' },
	{ key: 'book-photo-book', label: '写真', category: '写真', templateKey: 'albumTemplateConfig' },
	{ key: 'game-main', label: '游戏', category: '游戏', templateKey: 'gameTemplateConfig' },
	{ key: 'game-expansion', label: '扩展包', category: '扩展包', templateKey: 'gameTemplateConfig' },
	{ key: 'music-main', label: '音乐', category: '音乐', templateKey: 'musicTemplateConfig' },
	{ key: 'real-movie', label: '电影', category: '电影', templateKey: 'realTemplateConfig' },
	{ key: 'real-jp-drama', label: '日剧', category: '日剧', templateKey: 'realTemplateConfig' },
	{ key: 'real-western-drama', label: '欧美剧', category: '欧美剧', templateKey: 'realTemplateConfig' },
	{ key: 'real-cn-drama', label: '华语剧', category: '华语剧', templateKey: 'realTemplateConfig' },
	{ key: 'real-tv', label: '电视剧', category: '电视剧', templateKey: 'realTemplateConfig' },
	{ key: 'real-stage', label: '演出', category: '演出', templateKey: 'realTemplateConfig' },
	{ key: 'real-variety', label: '综艺', category: '综艺', templateKey: 'realTemplateConfig' },
	{ key: 'real-other', label: '其他', category: '其他', templateKey: 'realTemplateConfig' },
	{ key: 'real-generic', label: '三次元', category: '三次元', templateKey: 'realTemplateConfig' },
];

export const TEMPLATE_CATEGORY_OPTIONS_BY_KEY = Object.fromEntries(
	TEMPLATE_CATEGORY_OPTIONS.map(option => [option.key, option])
) as Record<string, TemplateCategoryOption>;

export const TEMPLATE_CATEGORY_OPTIONS_BY_CATEGORY = Object.fromEntries(
	TEMPLATE_CATEGORY_OPTIONS.map(option => [option.category, option])
) as Record<string, TemplateCategoryOption>;

export function findTemplateCategoryOption(category?: string): TemplateCategoryOption | undefined {
	if (!category) {
		return undefined;
	}
	return TEMPLATE_CATEGORY_OPTIONS_BY_CATEGORY[category];
}

export function getTemplateKeyFallbackForSubjectType(subjectType: number): TemplateKey {
	switch (subjectType) {
		case SubjectType.Anime:
			return 'animeTemplateConfig';
		case SubjectType.Music:
			return 'musicTemplateConfig';
		case SubjectType.Game:
			return 'gameTemplateConfig';
		case SubjectType.Real:
			return 'realTemplateConfig';
		case SubjectType.Book:
		default:
			return 'novelTemplateConfig';
	}
}

export function resolveTemplateTarget(subjectType: number, category?: string): {
	categoryOption?: TemplateCategoryOption;
	templateKey: TemplateKey;
} {
	const categoryOption = findTemplateCategoryOption(category);
	if (categoryOption) {
		return { categoryOption, templateKey: categoryOption.templateKey };
	}

	return {
		categoryOption: undefined,
		templateKey: getTemplateKeyFallbackForSubjectType(subjectType),
	};
}

export function getTemplateFallbackLookupKey(templateKey: TemplateKey): string {
	return `__template_key__:${templateKey}`;
}
