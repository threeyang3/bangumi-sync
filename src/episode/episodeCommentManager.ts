/**
 * 单集吐槽管理器
 * 负责在文件中插入和管理 callout 格式的吐槽
 */

import { App, TFile } from 'obsidian';

/**
 * 插入结果
 */
export interface InsertResult {
	success: boolean;
	insertLine: number;
	insertColumn: number;
}

/**
 * 单集吐槽管理器
 */
export class EpisodeCommentManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 插入单集吐槽 callout
	 * 返回插入位置信息，用于光标定位
	 */
	async insertEpisodeComment(
		file: TFile,
		epNumber: number
	): Promise<InsertResult> {
		const content = await this.app.vault.read(file);

		// 查找"记录"部分
		const recordMatch = this.findRecordSection(content);

		// 构建 callout 内容
		const callout = this.buildEpisodeCommentCallout(epNumber);

		let newContent: string;
		let calloutStart: number;

		if (recordMatch) {
			// 在"记录"部分末尾插入
			const insertPosition = this.findInsertPosition(content, recordMatch);
			newContent = this.insertAtPosition(content, callout, insertPosition);
			calloutStart = insertPosition;
		} else {
			// "记录"部分不存在，创建新的
			const created = this.createRecordSection(content, callout);
			newContent = created.content;
			calloutStart = created.calloutStart;
		}

		const cursorPosition = this.calculateCursorPosition(newContent, calloutStart, callout);

		// 写入文件
		await this.app.vault.process(file, () => newContent);

		return {
			success: true,
			insertLine: cursorPosition.line,
			insertColumn: cursorPosition.column,
		};
	}

	/**
	 * 查找"记录"部分
	 */
	private findRecordSection(content: string): { start: number; end: number } | null {
		// 匹配 ## 记录 标题
		const recordStartRegex = /^## 记录\s*$/m;
		const recordStart = recordStartRegex.exec(content);

		if (!recordStart) return null;

		// 查找下一个同级或更高级标题
		const afterRecord = content.slice(recordStart.index + recordStart[0].length);
		const nextSectionRegex = /^## /m;
		const nextSection = nextSectionRegex.exec(afterRecord);

		return {
			start: recordStart.index,
			end: nextSection ?
				recordStart.index + recordStart[0].length + nextSection.index :
				content.length,
		};
	}

	/**
	 * 查找插入位置（在记录部分末尾）
	 */
	private findInsertPosition(content: string, recordMatch: { start: number; end: number }): number {
		// 在记录部分末尾插入
		return recordMatch.end;
	}

	/**
	 * 在指定位置插入内容
	 */
	private insertAtPosition(content: string, insertContent: string, position: number): string {
		return content.slice(0, position) + insertContent + content.slice(position);
	}

	/**
	 * 构建单集吐槽 callout
	 */
	private buildEpisodeCommentCallout(epNumber: number): string {
		const timestamp = new Date().toLocaleDateString('zh-CN');
		return `\n> [!note] 第${epNumber}集吐槽 (${timestamp})\n> \n> \n\n`;
	}

	/**
	 * 创建"记录"部分
	 */
	private createRecordSection(content: string, callout: string): { content: string; calloutStart: number } {
		// 在"感想"部分之前插入
		const thoughtsMatch = content.match(/^## 感想\s*$/m);

		if (thoughtsMatch) {
			const recordSection = `## 记录\n\n${callout}\n`;
			const recordStart = thoughtsMatch.index ?? 0;
			return {
				content: content.slice(0, recordStart) + recordSection + content.slice(recordStart),
				calloutStart: recordStart + '## 记录\n\n'.length,
			};
		}

		// 在文件末尾添加
		const separator = `\n\n## 记录\n\n`;
		return {
			content: content + separator + callout,
			calloutStart: content.length + separator.length,
		};
	}

	/**
	 * 计算行号
	 */
	private calculateLineNumber(content: string, position: number): number {
		const lines = content.slice(0, position).split('\n');
		return lines.length - 1;
	}

	private calculateCursorPosition(
		content: string,
		calloutStart: number,
		callout: string
	): { line: number; column: number } {
		const editableOffset = callout.indexOf('\n> \n');
		const absolutePosition = editableOffset >= 0
			? calloutStart + editableOffset + 3
			: calloutStart;
		const line = this.calculateLineNumber(content, absolutePosition);
		const lastLineStart = content.lastIndexOf('\n', Math.max(0, absolutePosition - 1));
		const column = absolutePosition - (lastLineStart === -1 ? 0 : lastLineStart + 1);

		return { line, column };
	}

	/**
	 * 获取已有的单集吐槽列表
	 */
	async getEpisodeComments(file: TFile): Promise<Array<{ epNumber: number; content: string }>> {
		const content = await this.app.vault.read(file);
		const comments: Array<{ epNumber: number; content: string }> = [];

		// 匹配所有单集吐槽 callout
		const calloutRegex = /> \[!note\] 第(\d+)集吐槽[^\n]*\n((?:> .+\n)*)/g;
		let match;

		while ((match = calloutRegex.exec(content)) !== null) {
			const epNumber = parseInt(match[1], 10);
			const rawContent = match[2];
			// 提取实际内容（去除 "> " 前缀）
			const commentContent = rawContent
				.split('\n')
				.map(line => line.replace(/^> /, '').trim())
				.filter(line => line.length > 0)
				.join('\n');

			comments.push({ epNumber, content: commentContent });
		}

		return comments;
	}

	/**
	 * 检查是否已存在某集的吐槽
	 */
	async hasEpisodeComment(file: TFile, epNumber: number): Promise<boolean> {
		const content = await this.app.vault.read(file);
		const regex = new RegExp(`> \\[!note\\] 第${epNumber}集吐槽`);
		return regex.test(content);
	}
}
