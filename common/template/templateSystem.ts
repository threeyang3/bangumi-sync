import { Subject, getSubjectTypeLabel } from '../api/types';
import { parseInfoByType } from '../parser/infoboxParser';
import { TEMPLATE_CATEGORY_OPTIONS, TemplateKey, resolveTemplateTarget } from './templateRegistry';
import { getBuiltInTemplateByKey } from './defaultTemplates';
import type { BangumiPluginSettings, TemplateConfig } from '../../src/settings/settings';

export interface ContentRule {
	mode: 'inherit' | 'builtin' | 'file' | 'custom';
	builtinVariant?: 'standard' | 'author';
	filePath?: string;
	customContent?: string;
}
export interface TemplateRule {
	content?: ContentRule;
	path?: { mode: 'inherit' | 'custom'; value?: string };
}
export interface TemplateSettingsV2 {
	schemaVersion: 2;
	rules: Record<string, TemplateRule>;
	sharedNote: { path: string; content: string };
	migrationNotes: string[];
}
export interface TemplateNode {
	id: string;
	parent?: string;
	label: string;
	templateKey: TemplateKey;
	category?: string;
}
export const TEMPLATE_GROUP_IDS: Record<TemplateKey, string> = {
	animeTemplateConfig: 'anime', novelTemplateConfig: 'book/novel', comicTemplateConfig: 'book/comic',
	albumTemplateConfig: 'book/album', gameTemplateConfig: 'game', musicTemplateConfig: 'music', realTemplateConfig: 'real',
};
export const LEGACY_CATEGORY_IDS = Object.fromEntries(TEMPLATE_CATEGORY_OPTIONS.map(option => {
	const parent = TEMPLATE_GROUP_IDS[option.templateKey];
	const suffix = option.key.replace(/^[^-]+-/, '');
	return [option.key, `${parent}/${['novel', 'comic', 'album'].includes(suffix) ? 'main' : suffix}`];
})) as Record<string, string>;
export const TEMPLATE_NODES: TemplateNode[] = [
	{ id: 'default', label: '全局默认 / Default', templateKey: 'novelTemplateConfig' },
	{ id: 'anime', parent: 'default', label: '动画 / Anime', templateKey: 'animeTemplateConfig' },
	{ id: 'book', parent: 'default', label: '书籍 / Book', templateKey: 'novelTemplateConfig' },
	{ id: 'book/novel', parent: 'book', label: '小说 / Novel', templateKey: 'novelTemplateConfig' },
	{ id: 'book/comic', parent: 'book', label: '漫画 / Comic', templateKey: 'comicTemplateConfig' },
	{ id: 'book/album', parent: 'book', label: '画集与出版物 / Art books', templateKey: 'albumTemplateConfig' },
	{ id: 'game', parent: 'default', label: '游戏 / Game', templateKey: 'gameTemplateConfig' },
	{ id: 'music', parent: 'default', label: '音乐 / Music', templateKey: 'musicTemplateConfig' },
	{ id: 'real', parent: 'default', label: '三次元 / Live action', templateKey: 'realTemplateConfig' },
	...TEMPLATE_CATEGORY_OPTIONS.map(option => ({ id: LEGACY_CATEGORY_IDS[option.key], parent: TEMPLATE_GROUP_IDS[option.templateKey], label: option.label, category: option.category, templateKey: option.templateKey })),
];
export function templateNode(id: string): TemplateNode {
	const node = TEMPLATE_NODES.find(item => item.id === id);
	if (!node) throw new Error(`Unknown template node: ${id}`);
	return node;
}
export function templateChain(id: string): TemplateNode[] {
	const node = templateNode(id);
	return [node, ...(node.parent ? templateChain(node.parent) : [])];
}
export function classifySubject(subject: Subject, category?: string) {
	const rawCategory = category ?? parseInfoByType(subject.infobox, subject.type, subject.platform).category;
	const target = resolveTemplateTarget(subject.type, rawCategory, subject.platform);
	const groupId = TEMPLATE_GROUP_IDS[target.templateKey];
	return {
		subjectType: getSubjectTypeLabel(subject.type), templateGroup: groupId.split('/').pop()!,
		categoryId: target.categoryOption ? LEGACY_CATEGORY_IDS[target.categoryOption.key] : null,
		nodeId: target.categoryOption ? LEGACY_CATEGORY_IDS[target.categoryOption.key] : groupId,
		templateKey: target.templateKey,
	};
}

function migrateContent(config: TemplateConfig): ContentRule {
	return { mode: config.source === 'standard' || config.source === 'author' ? 'builtin' : config.source,
		builtinVariant: config.source === 'author' ? 'author' : 'standard', filePath: config.filePath, customContent: config.customContent };
}
/** Pure and idempotent. Legacy fields remain untouched as the pre-migration backup. */
export function migrateTemplateSettings(settings: BangumiPluginSettings): TemplateSettingsV2 {
	if (settings.templateSettings) {
		validateTemplateSettings(settings.templateSettings);
		return JSON.parse(JSON.stringify(settings.templateSettings)) as TemplateSettingsV2;
	}
	const rules: Record<string, TemplateRule> = { default: { path: { mode: 'custom', value: settings.syncPathTemplate } } };
	for (const [key, id] of Object.entries(TEMPLATE_GROUP_IDS)) rules[id] = { content: migrateContent(settings[key as TemplateKey]) };
	for (const option of TEMPLATE_CATEGORY_OPTIONS) {
		const config = settings.templateConfigByCategory?.[option.key];
		if (config) rules[LEGACY_CATEGORY_IDS[option.key]] = { content: migrateContent(config) };
	}
	for (const type of ['book', 'anime', 'music', 'game', 'real']) {
		const value = settings.pathTemplateByType?.[type];
		if (value) rules[type] = { ...rules[type], path: { mode: 'custom', value } };
	}
	// Retain earlier shared-note compatibility fixes in the new value, leaving the legacy backup intact.
	const notePath = settings.notePathTemplate && !settings.notePathTemplate.endsWith('.md')
		? `${settings.notePathTemplate.replace(/\/+$/, '')}/{{name_cn}}.md` : settings.notePathTemplate;
	const noteContent = settings.noteTemplateContent.replace(/\nid:\n\{\{id_yaml\}\}/, '\n笔记ID:\n{{id_yaml}}')
		.replace(/\n笔记ID: \{\{id_yaml\}\}/, '\n笔记ID:\n{{id_yaml}}');
	const migrated: TemplateSettingsV2 = { schemaVersion: 2, rules, sharedNote: { path: notePath, content: noteContent }, migrationNotes: [
		'旧模板、路径和共享笔记设置已保留为升级备份；没有修改已有笔记。 / Legacy settings retained; existing notes unchanged.',
		'少年漫画等细分元数据按所属书籍分组选择模板；跨大类同名分类不再串用模板。 / Book subgenres and cross-type routing corrected.',
		'缺失或空白的文件、自定义模板现在阻止生成，不再静默回退。 / Missing or empty templates now block generation.',
	] };
	if (notePath !== settings.notePathTemplate || noteContent !== settings.noteTemplateContent) migrated.migrationNotes.push('旧共享笔记目录路径和 ID 列表按既有兼容规则规范化；原值保留在旧字段。 / Legacy shared-note path and ID syntax normalized; original fields retained.');
	validateTemplateSettings(migrated);
	return migrated;
}
export function validateTemplateSettings(value: TemplateSettingsV2): void {
	if (!value || value.schemaVersion !== 2 || !value.rules || typeof value.rules !== 'object' || Array.isArray(value.rules)) throw new Error('Invalid template settings schema');
	if (!value.sharedNote || typeof value.sharedNote.path !== 'string' || typeof value.sharedNote.content !== 'string' || !Array.isArray(value.migrationNotes) || value.migrationNotes.some(note => typeof note !== 'string')) throw new Error('Invalid shared note or migration report');
	for (const [id, rule] of Object.entries(value.rules)) {
		templateNode(id);
		if (!rule || typeof rule !== 'object') throw new Error(`Invalid rule: ${id}`);
		if (rule.content) {
			if (!['inherit', 'builtin', 'file', 'custom'].includes(rule.content.mode)) throw new Error(`Invalid content mode: ${id}`);
			if (rule.content.builtinVariant !== undefined && !['standard', 'author'].includes(rule.content.builtinVariant)) throw new Error(`Invalid preset: ${id}`);
			for (const draft of [rule.content.filePath, rule.content.customContent]) if (draft !== undefined && typeof draft !== 'string') throw new Error(`Invalid draft: ${id}`);
		}
		if (rule.path && (!['inherit', 'custom'].includes(rule.path.mode) || (rule.path.value !== undefined && typeof rule.path.value !== 'string'))) throw new Error(`Invalid path: ${id}`);
		if (rule.path?.mode === 'custom' && !rule.path.value?.trim()) throw new Error(`Empty path: ${id}`);
	}
}
export function resolveTemplateRule(settings: TemplateSettingsV2, id: string) {
	const chain = templateChain(id);
	const contentNode = chain.find(node => settings.rules[node.id]?.content?.mode && settings.rules[node.id].content!.mode !== 'inherit');
	const pathNode = chain.find(node => settings.rules[node.id]?.path?.mode === 'custom');
	return {
		content: contentNode ? settings.rules[contentNode.id].content! : { mode: 'builtin', builtinVariant: 'standard' } as ContentRule,
		contentSource: contentNode?.id ?? 'builtin', pathSource: pathNode?.id ?? 'builtin',
		builtinKey: contentNode && !['default', 'book'].includes(contentNode.id) ? contentNode.templateKey : templateNode(id).templateKey,
		pathTemplate: pathNode ? settings.rules[pathNode.id].path!.value ?? '' : 'ACGN/{{type}}/{{name_cn_with_type}}.md',
	};
}
export async function resolveNodeContent(settings: TemplateSettingsV2, id: string, readFile: (path: string) => Promise<string>): Promise<string> {
	const resolved = resolveTemplateRule(settings, id);
	const rule = resolved.content;
	const text = rule.mode === 'file' ? await readFile(rule.filePath ?? '') : rule.mode === 'custom' ? rule.customContent ?? '' : getBuiltInTemplateByKey(resolved.builtinKey, rule.builtinVariant === 'author');
	if (!text.trim()) throw new Error(`Empty template: ${resolved.contentSource}`);
	validateTemplateText(text);
	return text;
}
/** Validate structural directives without rejecting intentional custom-property variables. */
export function validateTemplateText(text: string): void {
	let depth = 0;
	for (const match of text.matchAll(/\{\{(#if\s+\w+|\/if)\}\}/g)) {
		depth += match[1] === '/if' ? -1 : 1;
		if (depth < 0) throw new Error('Template has an unmatched {{/if}}');
	}
	if (depth !== 0) throw new Error('Template has an unclosed {{#if}}');
}
export const templateLookupKey = (id: string): string => `__node__:${id}`;
export const templateErrorKey = (id: string): string => `__template_error__:${id}`;
/** Snapshot shared by production rendering, requirements, preview and path planning. */
export async function compileTemplateSettings(settings: TemplateSettingsV2, readFile: (path: string) => Promise<string>) {
	validateTemplateSettings(settings);
	const customTemplates: Record<string, string> = {};
	const paths: Record<string, string> = {};
	const reads = new Map<string, Promise<string>>();
	const readOnce = (path: string) => { if (!reads.has(path)) reads.set(path, readFile(path)); return reads.get(path)!; };
	for (const node of TEMPLATE_NODES) {
		paths[node.id] = resolveTemplateRule(settings, node.id).pathTemplate;
		try { customTemplates[templateLookupKey(node.id)] = await resolveNodeContent(settings, node.id, readOnce); }
		catch { customTemplates[templateErrorKey(node.id)] = `模板不可用 / Template unavailable: ${node.id}. 请检查引用文件或自定义内容 / Check the file or custom content.`; }
	}
	return { customTemplates, paths };
}
