/**
 * Bangumi API 端点常量
 */

export const API_BASE_URL = 'https://api.bgm.tv';

export const ENDPOINTS = {
	// 条目相关
	CALENDAR: '/calendar',
	SUBJECTS: '/v0/subjects',
	SUBJECT_BY_ID: (id: number) => `/v0/subjects/${id}`,
	SUBJECT_IMAGE: (id: number) => `/v0/subjects/${id}/image`,
	SUBJECT_PERSONS: (id: number) => `/v0/subjects/${id}/persons`,
	SUBJECT_CHARACTERS: (id: number) => `/v0/subjects/${id}/characters`,
	SUBJECT_RELATIONS: (id: number) => `/v0/subjects/${id}/subjects`,

	// 搜索相关
	SEARCH_SUBJECTS: '/v0/search/subjects',
	SEARCH_CHARACTERS: '/v0/search/characters',
	SEARCH_PERSONS: '/v0/search/persons',

	// 章节相关
	EPISODES: '/v0/episodes',
	EPISODE_BY_ID: (id: number) => `/v0/episodes/${id}`,

	// 角色相关
	CHARACTER_BY_ID: (id: number) => `/v0/characters/${id}`,
	CHARACTER_IMAGE: (id: number) => `/v0/characters/${id}/image`,

	// 人物相关
	PERSON_BY_ID: (id: number) => `/v0/persons/${id}`,
	PERSON_IMAGE: (id: number) => `/v0/persons/${id}/image`,

	// 用户相关
	USER_BY_NAME: (username: string) => `/v0/users/${username}`,
	USER_AVATAR: (username: string) => `/v0/users/${username}/avatar`,

	// 收藏相关
	USER_COLLECTIONS: (username: string) => `/v0/users/${username}/collections`,
	USER_COLLECTION_BY_ID: (username: string, subjectId: number) =>
		`/v0/users/${username}/collections/${subjectId}`,
	MY_COLLECTION_BY_ID: (subjectId: number) =>
		`/v0/users/-/collections/${subjectId}`,
	MY_COLLECTION_UPDATE: (subjectId: number) =>
		`/v0/users/-/collections/${subjectId}`,

	// 章节收藏相关
	USER_SUBJECT_EPISODES: (subjectId: number) =>
		`/v0/users/-/collections/${subjectId}/episodes`,
	UPDATE_EPISODE_STATUS: (episodeId: number) =>
		`/v0/users/-/collections/-/episodes/${episodeId}`,
} as const;

/**
 * 请求头配置
 */
export const DEFAULT_HEADERS = {
	'Content-Type': 'application/json',
	'User-Agent': 'Bangumi-Obsidian-Plugin/1.0.0',
} as const;
