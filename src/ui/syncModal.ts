/**
 * 同步进度弹窗
 */

import { App, Modal, Setting } from 'obsidian';
import { SyncProgress } from '../sync/syncStatus';
import { tn } from '../i18n';

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

		new Setting(contentEl).setName(tn('syncModal', 'title')).setHeading();

		// 进度条容器
		this.progressBar = contentEl.createDiv({ cls: 'bangumi-progress-bar' });
		this.progressBar.createEl('div', { cls: 'bangumi-progress-fill' });

		// 状态文本
		this.statusText = contentEl.createDiv({ cls: 'bangumi-sync-status' });
		this.updateStatus(tn('syncModal', 'preparing'));
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
					this.updateStatus(tn('syncModal', 'preparing'));
					break;
				case 'fetching':
					this.updateStatus(`${tn('syncModal', 'fetchingCollections')} (${progress.current}/${progress.total})`);
					break;
				case 'scanning':
					this.updateStatus(`${tn('syncModal', 'scanningLocal')} (${progress.current}/${progress.total})`);
					break;
				case 'processing': {
					const itemText = progress.currentItem ? ` - ${progress.currentItem}` : '';
					this.updateStatus(`${tn('syncModal', 'processing')} (${progress.current}/${progress.total})${itemText}`);
					break;
				}
				case 'completed':
					this.updateStatus(tn('syncModal', 'completed'));
					break;
				case 'error':
					this.updateStatus(`${tn('syncModal', 'error')}: ${progress.message || ''}`);
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