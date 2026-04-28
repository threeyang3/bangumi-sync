/**
 * 集数右键菜单管理器
 * 负责在阅读模式下为集数按键添加右键菜单
 */

import { App, Menu, Notice, TFile, MarkdownView } from 'obsidian';
import { BangumiClient } from '../api/client';
import { EpisodeStatusManager } from './episodeStatusManager';
import { EpisodeCommentManager } from './episodeCommentManager';
import { EpisodeStatusType, getEpisodeStatusText } from './types';

/**
 * 集数右键菜单管理器
 */
export class EpisodeContextMenu {
	private app: App;
	private client: BangumiClient;
	private statusManager: EpisodeStatusManager;
	private commentManager: EpisodeCommentManager;

	constructor(
		app: App,
		client: BangumiClient,
		statusManager: EpisodeStatusManager,
		commentManager: EpisodeCommentManager
	) {
		this.app = app;
		this.client = client;
		this.statusManager = statusManager;
		this.commentManager = commentManager;
	}

	/**
	 * 注册全局的集数点击事件监听器
	 * 在插件 onload 时调用
	 */
	registerGlobalListener(plugin: { registerDomEvent: typeof import('obsidian').Plugin.prototype.registerDomEvent }): void {
		const doc = this.app.workspace.containerEl.ownerDocument;

		if (!doc) {
			throw new Error('无法获取 Obsidian 文档对象');
		}

		// 监听整个文档的右键事件，使用事件委托
		plugin.registerDomEvent(doc, 'contextmenu', (evt: MouseEvent) => {
			const target = evt.target as HTMLElement;

			// 检查是否点击了集数按键
			const epBox = target.closest('.ep-box');
			if (epBox && epBox.instanceOf(HTMLElement)) {
				evt.preventDefault();
				evt.stopPropagation();
				void this.showContextMenu(evt, epBox);
			}
		});
	}

	/**
	 * 显示右键菜单
	 */
	private async showContextMenu(evt: MouseEvent, epBox: HTMLElement): Promise<void> {
		const episodeId = parseInt(epBox.getAttribute('data-id') || '0', 10);
		const epNumber = parseInt(epBox.getAttribute('data-ep') || '0', 10);

		if (!episodeId || !epNumber) {
			return;
		}

		// 获取当前文件
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			new Notice('请先打开一个动画条目文件');
			return;
		}

		const file = view.file;
		if (!file) {
			return;
		}

		// 从 frontmatter 获取 subjectId
		const subjectId = await this.getSubjectIdFromFile(file);
		if (!subjectId) {
			new Notice('无法识别条目 ID');
			return;
		}

		// 获取当前状态
		const currentStatus = await this.statusManager.getEpisodeStatus(file, episodeId);

		const menu = new Menu();

		// === 状态设置选项 ===
		menu.addItem((item) => {
			item
				.setTitle(`看到第${epNumber}集`)
				.onClick(() => void this.setWatchedUpTo(file, epNumber));
		});

		menu.addSeparator();

		menu.addItem((item) => {
			item
				.setTitle(`标记为看过 ${currentStatus === 2 ? '✓' : ''}`)
				.onClick(() => void this.setEpisodeStatus(file, episodeId, epNumber, 2, epBox));
		});

		menu.addItem((item) => {
			item
				.setTitle(`标记为想看 ${currentStatus === 1 ? '✓' : ''}`)
				.onClick(() => void this.setEpisodeStatus(file, episodeId, epNumber, 1, epBox));
		});

		menu.addItem((item) => {
			item
				.setTitle(`标记为抛弃 ${currentStatus === 3 ? '✓' : ''}`)
				.onClick(() => void this.setEpisodeStatus(file, episodeId, epNumber, 3, epBox));
		});

		menu.addItem((item) => {
			item
				.setTitle(`取消收藏 ${currentStatus === 0 ? '✓' : ''}`)
				.onClick(() => void this.setEpisodeStatus(file, episodeId, epNumber, 0, epBox));
		});

		menu.addSeparator();

		// === 单集吐槽 ===
		menu.addItem((item) => {
			item
				.setTitle('📝 添加吐槽')
				.onClick(() => void this.addEpisodeComment(file, epNumber));
		});

		menu.showAtMouseEvent(evt);
	}

	/**
	 * 设置单集状态
	 */
	private async setEpisodeStatus(
		file: TFile,
		episodeId: number,
		epNumber: number,
		status: EpisodeStatusType,
		epBox: HTMLElement
	): Promise<void> {
		try {
			// 1. 更新本地文件中的状态标记
			await this.statusManager.updateLocalStatus(file, episodeId, epNumber, status);

			// 2. 更新 UI 显示
			this.updateEpBoxStyle(epBox, status);

			new Notice(`第${epNumber}集已设置为"${getEpisodeStatusText(status)}"`);
		} catch (error) {
			console.error('[Bangumi Sync] 设置单集状态失败:', error);
			new Notice('设置失败，请查看控制台');
		}
	}

	/**
	 * 设置"看到"状态：将该集及之前的所有集都标为"看过"
	 */
	private async setWatchedUpTo(file: TFile, targetEpNumber: number): Promise<void> {
		try {
			// 获取当前视图中所有的集数按键
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;

			const contentEl = view.contentEl;
			const epBoxes = contentEl.querySelectorAll('.ep-box');

			// 收集需要更新的集数信息
			const episodesToUpdate: Array<{ episodeId: number; epNumber: number; epBox: HTMLElement }> = [];

			epBoxes.forEach((el) => {
				const epBox = el as HTMLElement;
				const episodeId = parseInt(epBox.getAttribute('data-id') || '0', 10);
				const epNumber = parseInt(epBox.getAttribute('data-ep') || '0', 10);

				if (episodeId && epNumber && epNumber <= targetEpNumber) {
					episodesToUpdate.push({ episodeId, epNumber, epBox });
				}
			});

			// 批量更新本地状态
			await this.statusManager.updateMultipleStatuses(file, episodesToUpdate.map(e => ({
				episodeId: e.episodeId,
				epNumber: e.epNumber,
				status: 2,
			})));

			// 更新 UI 显示
			episodesToUpdate.forEach(({ epBox }) => {
				this.updateEpBoxStyle(epBox, 2);
			});

			new Notice(`已标记第1-${targetEpNumber}集为"看过"`);
		} catch (error) {
			console.error('[Bangumi Sync] 设置"看到"状态失败:', error);
			new Notice('设置失败，请查看控制台');
		}
	}

	/**
	 * 添加单集吐槽
	 */
	private async addEpisodeComment(file: TFile, epNumber: number): Promise<void> {
		try {
			// 1. 在文件中插入 callout
			const result = await this.commentManager.insertEpisodeComment(file, epNumber);

			if (result.success) {
				// 2. 切换到编辑模式并将光标移动到指定位置
				await this.switchToEditModeAndFocus(result.insertLine, result.insertColumn);

				new Notice(`已添加第${epNumber}集吐槽`);
			}
		} catch (error) {
			console.error('[Bangumi Sync] 添加单集吐槽失败:', error);
			new Notice('添加失败，请查看控制台');
		}
	}

	/**
	 * 更新集数按键的样式
	 */
	private updateEpBoxStyle(epBox: HTMLElement, status: EpisodeStatusType): void {
		epBox.classList.remove('watched');
		if (status === 2) {
			epBox.classList.add('watched');
		}
		// 更新 data 属性
		epBox.setAttribute('data-status', String(status));
	}

	/**
	 * 从文件获取 subjectId
	 */
	private async getSubjectIdFromFile(file: TFile): Promise<number | null> {
		const content = await this.app.vault.read(file);
		const match = content.match(/^id:\s*"?(\d+)"?/m);
		return match ? parseInt(match[1], 10) : null;
	}

	/**
	 * 切换到编辑模式并定位光标
	 */
	private async switchToEditModeAndFocus(line: number, column: number): Promise<void> {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) return;
		const ownerWindow = view.contentEl.ownerDocument.defaultView;

		// 切换到编辑模式
		const state = view.getState();
		if (state.mode !== 'source') {
			// 使用 Obsidian API 切换模式
			await view.setState({ ...state, mode: 'source' }, { history: false });
		}

		// 等待模式切换完成
		await new Promise<void>(resolve => (ownerWindow ?? window).setTimeout(resolve, 100));

		// 定位光标
		const editor = view.editor;
		if (editor) {
			const lineCount = editor.lineCount();
			const targetLine = Math.min(line, lineCount - 1);
			const lineContent = editor.getLine(targetLine);
			const targetColumn = Math.min(column, lineContent.length);

			const cursor = { line: targetLine, ch: targetColumn };
			editor.setCursor(cursor);
			editor.setSelection(cursor, cursor);
			editor.focus();
		}
	}
}
