/**
 * Bangumi API 客户端
 * 处理与 Bangumi API 的所有通信
 */

import { requestUrl, RequestUrlParam } from 'obsidian';
import {
	Subject,
	SubjectType,
	UserCollection,
	PagedResult,
	RelatedCharacter,
	RelatedPerson,
	APIError,
	PagedEpisodes,
	UserEpisodeCollection,
} from '../../common/api/types';
import { API_BASE_URL, ENDPOINTS, DEFAULT_HEADERS } from '../../common/api/endpoints';

export class BangumiClient {
	private accessToken: string;
	private baseUrl: string;

	constructor(accessToken: string = '', baseUrl: string = API_BASE_URL) {
		this.accessToken = accessToken;
		this.baseUrl = baseUrl;
	}

	/**
	 * 设置 Access Token
	 */
	setAccessToken(token: string): void {
		this.accessToken = token;
	}

	/**
	 * 获取请求头
	 */
	private getHeaders(): Record<string, string> {
		const headers: Record<string, string> = { ...DEFAULT_HEADERS };
		if (this.accessToken) {
			headers['Authorization'] = `Bearer ${this.accessToken}`;
		}
		return headers;
	}

	/**
	 * 发送 API 请求
	 */
	private async request<T>(
		method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
		endpoint: string,
		data?: unknown
	): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;

		const options: RequestUrlParam = {
			url,
			method,
			headers: this.getHeaders(),
			body: data ? JSON.stringify(data) : undefined,
		};

		try {
			console.debug(`[Bangumi Sync] ${method} ${url}`);
			const response = await requestUrl(options);

			console.debug(`[Bangumi Sync] Response status: ${response.status}`);

			if (response.status >= 400) {
				const error: APIError = response.json || {
					title: 'API Error',
					description: `HTTP ${response.status}`,
				};
				const errorMsg = error.title + (error.description ? `: ${error.description}` : '');
				console.error(`[Bangumi Sync] API Error:`, errorMsg);
				throw new Error(errorMsg);
			}

			// 204 No Content 表示成功但无返回内容
			if (response.status === 204) {
				return {} as T;
			}

			return response.json as T;
		} catch (error) {
			console.error(`[Bangumi Sync] Request failed:`, error);
			if (error instanceof Error) {
				throw error;
			}
			throw new Error(`Request failed: ${String(error)}`);
		}
	}

	/**
	 * 验证 Access Token 是否有效，并获取用户名
	 */
	async validateToken(): Promise<{ valid: boolean; username?: string; error?: string }> {
		if (!this.accessToken) {
			return { valid: false, error: '未配置 Access Token' };
		}

		console.debug('[Bangumi Sync] 验证 Token...');

		try {
			const headers = this.getHeaders();
			const response = await requestUrl({
				url: `${this.baseUrl}/v0/me`,
				method: 'GET',
				headers: headers,
			});

			console.debug(`[Bangumi Sync] /v0/me 响应状态: ${response.status}`);

			if (response.status === 200) {
				const user = response.json as { username?: string };
				console.debug(`[Bangumi Sync] 获取到用户: ${user.username}`);
				return { valid: true, username: user.username };
			}

			const errorData = response.json as { title?: string; description?: string };
			const errorMsg = errorData.description || errorData.title || `HTTP ${response.status}`;
			return { valid: false, error: `验证失败: ${errorMsg}` };

		} catch (error) {
			console.error('[Bangumi Sync] Token 验证异常:', error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			return { valid: false, error: `请求失败: ${errorMsg}` };
		}
	}

	/**
	 * 获取条目详情
	 */
	async getSubject(subjectId: number): Promise<Subject> {
		return this.request<Subject>('GET', ENDPOINTS.SUBJECT_BY_ID(subjectId));
	}

	/**
	 * 获取条目关联的角色
	 */
	async getSubjectCharacters(subjectId: number): Promise<RelatedCharacter[]> {
		return this.request<RelatedCharacter[]>('GET', ENDPOINTS.SUBJECT_CHARACTERS(subjectId));
	}

	/**
	 * 获取条目关联的人物
	 */
	async getSubjectPersons(subjectId: number): Promise<RelatedPerson[]> {
		return this.request<RelatedPerson[]>('GET', ENDPOINTS.SUBJECT_PERSONS(subjectId));
	}

	/**
	 * 获取用户收藏列表
	 */
	async getUserCollections(
		username: string,
		options?: {
			subjectType?: SubjectType;
			collectionType?: number;
			limit?: number;
			offset?: number;
		}
	): Promise<PagedResult<UserCollection>> {
		const params = new URLSearchParams();

		if (options) {
			if (options.subjectType !== undefined) {
				params.append('subject_type', String(options.subjectType));
			}
			if (options.collectionType !== undefined) {
				params.append('type', String(options.collectionType));
			}
			if (options.limit !== undefined) {
				params.append('limit', String(options.limit));
			}
			if (options.offset !== undefined) {
				params.append('offset', String(options.offset));
			}
		}

		const endpoint = `${ENDPOINTS.USER_COLLECTIONS(username)}?${params.toString()}`;
		console.debug(`[Bangumi Sync] 获取收藏: ${endpoint}`);

		try {
			const result = await this.request<PagedResult<UserCollection>>('GET', endpoint);
			console.debug(`[Bangumi Sync] 获取到 ${result.data.length}/${result.total} 条收藏`);
			return result;
		} catch (error) {
			if (error instanceof Error && error.message.includes('404')) {
				throw new Error('无法获取收藏列表，请检查 Access Token 是否有效');
			}
			throw error;
		}
	}

	/**
	 * 获取完整的条目信息（包括角色和人物）
	 */
	async getFullSubjectInfo(subjectId: number): Promise<{
		subject: Subject;
		characters: RelatedCharacter[];
		persons: RelatedPerson[];
	}> {
		const [subject, characters, persons] = await Promise.all([
			this.getSubject(subjectId),
			this.getSubjectCharacters(subjectId),
			this.getSubjectPersons(subjectId),
		]);

		return { subject, characters, persons };
	}

	/**
	 * 获取用户所有收藏（自动分页）
	 */
	async getAllUserCollections(
		username: string,
		options?: {
			subjectType?: SubjectType;
			collectionType?: number;
			onProgress?: (current: number, total: number) => void;
		}
	): Promise<UserCollection[]> {
		const limit = 50;
		let offset = 0;
		let total = 0;
		const allCollections: UserCollection[] = [];

		// 首次请求获取 total
		const firstResult = await this.getUserCollections(username, {
			...options,
			limit,
			offset,
		});
		total = firstResult.total;
		allCollections.push(...firstResult.data);

		if (options?.onProgress) {
			options.onProgress(allCollections.length, total);
		}

		// 继续获取剩余数据
		while (allCollections.length < total) {
			offset += limit;
			await new Promise(resolve => setTimeout(resolve, 100));

			const result = await this.getUserCollections(username, {
				...options,
				limit,
				offset,
			});
			allCollections.push(...result.data);

			if (options?.onProgress) {
				options.onProgress(allCollections.length, total);
			}
		}

		return allCollections;
	}

	/**
	 * 更新用户收藏（评分、短评、标签等）
	 * @param subjectId 条目 ID
	 * @param data 要更新的数据
	 */
	async updateCollection(subjectId: number, data: {
		type?: number;
		rate?: number;
		comment?: string;
		tags?: string[];
		private?: boolean;
	}): Promise<void> {
		const endpoint = ENDPOINTS.MY_COLLECTION_UPDATE(subjectId);
		console.debug(`[Bangumi Sync] 更新收藏: PATCH ${endpoint}`);
		console.debug(`[Bangumi Sync] 更新数据:`, data);

		await this.request('PATCH', endpoint, data);
		console.debug(`[Bangumi Sync] 收藏更新成功: ${subjectId}`);
	}

	/**
	 * 获取条目的所有章节
	 * @param subjectId 条目 ID
	 */
	async getEpisodes(subjectId: number): Promise<PagedEpisodes> {
		const endpoint = `${ENDPOINTS.EPISODES}?subject_id=${subjectId}`;
		console.debug(`[Bangumi Sync] 获取章节: ${endpoint}`);

		const result = await this.request<PagedEpisodes>('GET', endpoint);
		console.debug(`[Bangumi Sync] 获取到 ${result.data.length}/${result.total} 个章节`);
		return result;
	}

	/**
	 * 获取用户章节收藏状态
	 * @param subjectId 条目 ID
	 */
	async getUserEpisodeStatus(subjectId: number): Promise<UserEpisodeCollection[]> {
		const endpoint = ENDPOINTS.USER_SUBJECT_EPISODES(subjectId);
		console.debug(`[Bangumi Sync] 获取用户章节状态: ${endpoint}`);

		const result = await this.request<PagedResult<UserEpisodeCollection>>('GET', endpoint);
		console.debug(`[Bangumi Sync] 获取到 ${result.data.length} 个章节状态`);
		return result.data;
	}

	/**
	 * 更新章节收藏状态
	 * @param episodeId 章节 ID
	 * @param type 状态类型：1=想看, 2=看过, 3=抛弃
	 */
	async updateEpisodeStatus(episodeId: number, type: number): Promise<void> {
		const endpoint = ENDPOINTS.UPDATE_EPISODE_STATUS(episodeId);
		console.debug(`[Bangumi Sync] 更新章节状态: PUT ${endpoint}, type=${type}`);

		await this.request('PUT', endpoint, { type });
		console.debug(`[Bangumi Sync] 章节状态更新成功: ${episodeId}`);
	}
}

// 兼容旧版本的类型别名
export const BangumiClientV3 = BangumiClient;
