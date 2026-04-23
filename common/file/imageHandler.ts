/**
 * 图片处理器
 * 下载封面图片到本地
 */

import { App, requestUrl, normalizePath, Notice } from 'obsidian';
import { FileManager } from './fileManager';

/**
 * 图片质量选项
 */
export type ImageQuality = 'small' | 'medium' | 'large';

/**
 * 图片设置
 */
export interface ImageSettings {
	quality: ImageQuality;
	updateExisting: boolean;
}

export class ImageHandler {
	private app: App;
	private fileManager: FileManager;
	private downloadEnabled: boolean = true;
	private imageSettings: ImageSettings = {
		quality: 'large',
		updateExisting: false,
	};

	constructor(app: App, fileManager: FileManager) {
		this.app = app;
		this.fileManager = fileManager;
	}

	/**
	 * 设置是否下载图片
	 */
	setDownloadEnabled(enabled: boolean): void {
		this.downloadEnabled = enabled;
	}

	/**
	 * 设置图片质量
	 */
	setImageQuality(quality: ImageQuality): void {
		this.imageSettings.quality = quality;
	}

	/**
	 * 设置是否更新已存在的图片
	 */
	setUpdateExisting(update: boolean): void {
		this.imageSettings.updateExisting = update;
	}

	/**
	 * 获取当前图片设置
	 */
	getImageSettings(): ImageSettings {
		return { ...this.imageSettings };
	}

	/**
	 * 检查是否应该下载图片
	 */
	shouldDownloadImages(): boolean {
		return this.downloadEnabled;
	}

	/**
	 * 根据质量选择图片 URL
	 */
	selectImageUrlByQuality(images: { small?: string; medium?: string; large?: string; common?: string } | undefined): string {
		if (!images) return '';

		// 根据质量选择
		switch (this.imageSettings.quality) {
			case 'small':
				return images.small || images.medium || images.large || images.common || '';
			case 'medium':
				return images.medium || images.large || images.small || images.common || '';
			case 'large':
			default:
				return images.large || images.common || images.medium || images.small || '';
		}
	}

	/**
	 * 下载图片
	 */
	async downloadImage(
		imageUrl: string,
		targetPath: string
	): Promise<string> {
		if (!this.downloadEnabled) {
			return imageUrl;
		}

		try {
			// 下载图片
			const response = await requestUrl({
				url: imageUrl,
				method: 'GET',
			});

			if (response.status !== 200) {
				console.error(`Failed to download image: ${response.status}`);
				return imageUrl;
			}

			// 获取 array buffer
			const arrayBuffer = response.arrayBuffer;

			// 确保目录存在
			await this.fileManager.ensureDirectory(targetPath);

			// 保存图片
			const normalizedPath = normalizePath(targetPath);
			const existingFile = this.fileManager.getFile(normalizedPath);

			if (existingFile) {
				// 文件已存在，更新
				await this.app.vault.modifyBinary(existingFile, arrayBuffer);
			} else {
				// 创建新文件
				await this.app.vault.createBinary(normalizedPath, arrayBuffer);
			}

			return normalizedPath;
		} catch (error) {
			console.error('Error downloading image:', error);
			return imageUrl;
		}
	}

	/**
	 * 下载封面图片
	 * @param imageUrl 图片 URL
	 * @param subjectId 条目 ID
	 * @param imagePathTemplate 图片路径模板
	 * @param extraVars 额外的模板变量（如 name_cn, typeLabel）
	 */
	async downloadCover(
		imageUrl: string | undefined,
		subjectId: number,
		imagePathTemplate: string,
		extraVars?: {
			name_cn?: string;
			name?: string;
			typeLabel?: string;
		}
	): Promise<string> {
		if (!imageUrl) {
			return '';
		}

		// 生成目标路径，替换模板变量
		let targetPath = imagePathTemplate
			.replace(/\{\{id\}\}/g, String(subjectId))
			.replace(/\{\{type\}\}/g, 'cover')
			.replace(/\{\{name_cn\}\}/g, extraVars?.name_cn || '')
			.replace(/\{\{name\}\}/g, extraVars?.name || '')
			.replace(/\{\{typeLabel\}\}/g, extraVars?.typeLabel || '');

		// 清理路径中的非法字符
		targetPath = this.sanitizePath(targetPath);

		// 确定文件扩展名
		const ext = this.getImageExtension(imageUrl);
		const finalPath = targetPath.replace(/\.\w+$/, `.${ext}`);

		return this.downloadImage(imageUrl, finalPath);
	}

	/**
	 * 清理路径中的非法字符
	 */
	private sanitizePath(path: string): string {
		// Windows 不允许的字符: < > : " / \ | ? *
		// 这里只处理文件名部分，保留路径分隔符
		return path.replace(/[<>:"|?*]/g, '_');
	}

	/**
	 * 从 URL 获取图片扩展名
	 */
	private getImageExtension(url: string): string {
		const match = url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
		if (match) {
			return match[1].toLowerCase();
		}
		return 'jpg';
	}

	/**
	 * 批量下载图片
	 */
	async downloadImages(
		images: Array<{ url: string; path: string }>,
		onProgress?: (current: number, total: number) => void
	): Promise<void> {
		for (let i = 0; i < images.length; i++) {
			const { url, path } = images[i];
			await this.downloadImage(url, path);

			if (onProgress) {
				onProgress(i + 1, images.length);
			}

			// 添加小延迟避免请求过快
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}

	/**
	 * 清理图片缓存
	 * @param folderPath 图片文件夹路径
	 * @returns 清理的文件数量
	 */
	async clearImageCache(folderPath: string): Promise<number> {
		try {
			const normalizedPath = normalizePath(folderPath);
			const exists = await this.app.vault.adapter.exists(normalizedPath);

			if (!exists) {
				new Notice('图片文件夹不存在');
				return 0;
			}

			const files = await this.app.vault.adapter.list(normalizedPath);
			let count = 0;

			for (const file of files.files) {
				// 只删除图片文件
				if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
					await this.app.vault.adapter.remove(file);
					count++;
				}
			}

			new Notice(`已清理 ${count} 个图片文件`);
			return count;
		} catch (error) {
			console.error('[ImageHandler] 清理图片缓存失败:', error);
			new Notice('清理图片缓存失败');
			return 0;
		}
	}

	/**
	 * 获取图片缓存统计
	 * @param folderPath 图片文件夹路径
	 */
	async getImageCacheStats(folderPath: string): Promise<{ count: number; size: number }> {
		try {
			const normalizedPath = normalizePath(folderPath);
			const exists = await this.app.vault.adapter.exists(normalizedPath);

			if (!exists) {
				return { count: 0, size: 0 };
			}

			const files = await this.app.vault.adapter.list(normalizedPath);
			let count = 0;
			let totalSize = 0;

			for (const file of files.files) {
				if (/\.(jpg|jpeg|png|webp|gif)$/i.test(file)) {
					count++;
					const stat = await this.app.vault.adapter.stat(file);
					if (stat) {
						totalSize += stat.size;
					}
				}
			}

			return { count, size: totalSize };
		} catch (error) {
			console.error('[ImageHandler] 获取图片缓存统计失败:', error);
			return { count: 0, size: 0 };
		}
	}

	/**
	 * 格式化文件大小
	 */
	formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}
}
