/**
 * 角色信息解析器
 * 从条目关联的角色数据中解析角色列表
 */

import { RelatedCharacter } from '../api/types';

/**
 * 角色信息
 */
export interface CharacterInfo {
	name: string;           // 角色名
	role: string;           // 角色类型 (主角/配角)
	cv: string;             // 声优
	image: string;          // 角色图片 URL
}

/**
 * 解析角色列表
 * @param characters API 返回的角色数据
 * @param maxCount 最大返回数量（默认 9）
 */
export function parseCharacters(
	characters: RelatedCharacter[] | undefined,
	maxCount: number = 9
): CharacterInfo[] {
	if (!characters || characters.length === 0) {
		return [];
	}

	const result: CharacterInfo[] = [];

	for (const char of characters) {
		if (result.length >= maxCount) break;

		// 获取角色名
		const name = char.name || '';

		// 获取角色类型（主角/配角等）
		const role = char.relation || '角色';

		// 获取声优（取第一个）
		const cv = char.actors && char.actors.length > 0
			? char.actors[0].name
			: '';

		// 获取角色图片
		const image = char.images?.grid || char.images?.small || char.images?.medium || '';

		result.push({
			name,
			role,
			cv,
			image,
		});
	}

	return result;
}

/**
 * 获取格式化的角色信息（用于模板变量）
 * 返回 character1-9, characterCV1-9, characterPhoto1-9 等变量
 */
export function getCharacterTemplateVars(characters: CharacterInfo[]): Record<string, string> {
	const vars: Record<string, string> = {};

	for (let i = 1; i <= 9; i++) {
		const char = characters[i - 1];
		if (char) {
			vars[`character${i}`] = `${char.name}-${char.role}`;
			vars[`characterCV${i}`] = char.cv ? `CV: ${char.cv}` : '';
			vars[`characterPhoto${i}`] = char.image ? `![bookcover](${char.image})` : '';
		} else {
			vars[`character${i}`] = '';
			vars[`characterCV${i}`] = '';
			vars[`characterPhoto${i}`] = '';
		}
	}

	return vars;
}

/**
 * 生成角色表格 Markdown
 */
export function generateCharacterTable(characters: CharacterInfo[]): string {
	if (characters.length === 0) {
		return '';
	}

	const rows: string[] = [];

	// 表头
	rows.push('| 角色 | CV |');
	rows.push('|:------:|:------:|');

	// 角色行
	for (const char of characters) {
		const name = char.name || '-';
		const cv = char.cv || '-';
		rows.push(`| ${name} | ${cv} |`);
	}

	return rows.join('\n');
}

/**
 * 生成带图片的角色表格 Markdown（3列布局）
 */
export function generateCharacterTableWithImages(characters: CharacterInfo[]): string {
	if (characters.length === 0) {
		return '';
	}

	const rows: string[] = [];

	// 每3个角色一行
	for (let i = 0; i < characters.length; i += 3) {
		const chars = [
			characters[i],
			characters[i + 1],
			characters[i + 2],
		];

		// 角色名行
		const nameRow = chars.map(c => c ? `**${c.name}**` : '').join(' | ');
		rows.push(`| ${nameRow} |`);
		rows.push('|:------:|:------:|:------:|');

		// CV 行
		const cvRow = chars.map(c => c && c.cv ? `CV: ${c.cv}` : '').join(' | ');
		rows.push(`| ${cvRow} |`);

		// 图片行
		const imgRow = chars.map(c => c && c.image ? `![bookcover](${c.image})` : '').join(' | ');
		rows.push(`| ${imgRow} |`);
	}

	return rows.join('\n');
}
