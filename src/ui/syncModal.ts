/**
 * 同步进度弹窗
 */

import { App, Modal, Setting } from 'obsidian';
import { SyncProgress } from '../sync/syncStatus';

export class SyncModal extends Modal {
	private progress: SyncProgress;
	private progressBar: HTMLElement | null = null;
	private statusText: HTMLElement | null = null;

	constructor(app: App) {
		super(app);
		this.progress = {
			current: 0,
			total: 0,
			status: 'preparing',
		};
	}

	onOpen(): void {
		const { contentEl } = this;

		new Setting(contentEl).setName('同步 Bangumi 收藏').setHeading();

		// 进度条容器
		this.progressBar = contentEl.createDiv({ cls: 'bangumi-progress-bar' });
		this.progressBar.createEl('div', { cls: 'bangumi-progress-fill' });

		// 状态文本
		this.statusText = contentEl.createDiv({ cls: 'bangumi-sync-status' });
		this.updateStatus('准备同步...');
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * 更新进度
	 */
	updateProgress(progress: SyncProgress): void {
		this.progress = progress;

		// 更新进度条
		if (this.progressBar && progress.total > 0) {
			const percent = Math.floor((progress.current / progress.total) * 100);
			const fill = this.progressBar.querySelector('.bangumi-progress-fill') as HTMLElement;
			if (fill) {
				fill.style.width = `${percent}%`;
			}
		}

		// 更新状态文本
		if (progress.message) {
			this.updateStatus(progress.message);
		} else {
			switch (progress.status) {
				case 'preparing':
					this.updateStatus('准备同步...');
					break;
				case 'fetching':
					this.updateStatus(`获取收藏列表... (${progress.current}/${progress.total})`);
					break;
				case 'scanning':
					this.updateStatus(`扫描本地文件... (${progress.current}/${progress.total})`);
					break;
				case 'processing': {
					const itemText = progress.currentItem ? ` - ${progress.currentItem}` : '';
					this.updateStatus(`处理条目... (${progress.current}/${progress.total})${itemText}`);
					break;
				}
				case 'completed':
					this.updateStatus('同步完成！');
					break;
				case 'error':
					this.updateStatus(`同步出错: ${progress.message || '未知错误'}`);
					break;
			}
		}
	}

	/**
	 * 更新状态文本
	 */
	private updateStatus(text: string): void {
		if (this.statusText) {
			this.statusText.setText(text);
		}
	}
}

// 兼容旧版本的类型别名
export const SyncModalV3 = SyncModal;
