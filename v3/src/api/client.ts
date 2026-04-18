/**
 * Bangumi API 客户端 V2
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
	User,
	APIError,
} from '../../../common/api/types';
import { API_BASE_URL, ENDPOINTS, DEFAULT_HEADERS } from '../../../common/api/endpoints';

export class BangumiClientV3 {
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
		method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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
			console.log(`[Bangumi Sync V2] ${method} ${url}`);
			const response = await requestUrl(options);

			console.log(`[Bangumi Sync V2] Response status: ${response.status}`);

			if (response.status >= 400) {
				const error: APIError = response.json || {
					title: 'API Error',
					description: `HTTP ${response.status}`,
				};
				const errorMsg = error.title + (error.description ? `: ${error.description}` : '');
				console.error(`[Bangumi Sync V2] API Error:`, errorMsg);
				throw new Error(errorMsg);
			}

			return response.json as T;
		} catch (error) {
			console.error(`[Bangumi Sync V2] Request failed:`, error);
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

		console.log('[Bangumi Sync V2] 验证 Token...');

		try {
			const headers = this.getHeaders();
			const response = await requestUrl({
				url: `${this.baseUrl}/v0/me`,
				method: 'GET',
				headers: headers,
			});

			console.log(`[Bangumi Sync V2] /v0/me 响应状态: ${response.status}`);

			if (response.status === 200) {
				const user = response.json as { username?: string };
				console.log(`[Bangumi Sync V2] 获取到用户: ${user.username}`);
				return { valid: true, username: user.username };
			}

			const errorData = response.json as { title?: string; description?: string };
			const errorMsg = errorData.description || errorData.title || `HTTP ${response.status}`;
			return { valid: false, error: `验证失败: ${errorMsg}` };

		} catch (error) {
			console.error('[Bangumi Sync V2] Token 验证异常:', error);
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
		console.log(`[Bangumi Sync V2] 获取收藏: ${endpoint}`);

		try {
			const result = await this.request<PagedResult<UserCollection>>('GET', endpoint);
			console.log(`[Bangumi Sync V2] 获取到 ${result.data.length}/${result.total} 条收藏`);
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

		do {
			const result = await this.getUserCollections(username, {
				...options,
				limit,
				offset,
			});

			total = result.total;
			allCollections.push(...result.data);
			offset += limit;

			if (options?.onProgress) {
				options.onProgress(allCollections.length, total);
			}

			if (allCollections.length >= total) {
				break;
			}

			await new Promise(resolve => setTimeout(resolve, 100));
		} while (true);

		return allCollections;
	}
}
