import { App, TFile, normalizePath } from 'obsidian';
import { TemplateSettingsV2, TEMPLATE_NODES, resolveNodeContent, resolveTemplateRule, validateTemplateSettings } from '../../common/template/templateSystem';
import { withWriteOperation } from '../sync/writeOperationGate';

export async function readTemplateFile(app: App, path: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(normalizePath(path));
	if (!(file instanceof TFile) || file.extension !== 'md') throw new Error('模板文件不存在 / Template file missing');
	return app.vault.read(file);
}

/** Create-only export. A concurrent name collision aborts; existing files are never processed. */
export async function exportTemplateBundle(app: App, settings: TemplateSettingsV2, parent: string): Promise<string> {
	validateTemplateSettings(settings);
	settings = JSON.parse(JSON.stringify(settings)) as TemplateSettingsV2;
	parent = parent.trim();
	if (/^[\/\\]|^[a-z]:|(?:^|[\/\\])\.{1,2}(?:[\/\\]|$)/i.test(parent)) throw new Error('Use a vault-relative folder');
	const base = normalizePath(parent.trim()).replace(/\/$/, '');
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	let folder = `${base ? `${base}/` : ''}bangumi-templates-${stamp}`;
	for (let i = 1; app.vault.getAbstractFileByPath(folder); i++) folder = `${base ? `${base}/` : ''}bangumi-templates-${stamp}-${i}`;
	const entries: Array<{ path: string; content: string }> = [];
	const sources: Record<string, { contentSource: string; pathSource: string }> = {};
	const unavailable: string[] = [];
	const fileSnapshots: Record<string, string> = {};
	for (const node of TEMPLATE_NODES) {
		const resolved = resolveTemplateRule(settings, node.id);
		sources[node.id] = { contentSource: resolved.contentSource, pathSource: resolved.pathSource };
		if (settings.rules[node.id]?.content?.mode && settings.rules[node.id].content!.mode !== 'inherit') {
			try {
				const content = await resolveNodeContent(settings, node.id, path => readTemplateFile(app, path));
				entries.push({ path: `${node.id.replace(/\//g, '--')}.md`, content });
				if (settings.rules[node.id].content?.mode === 'file') fileSnapshots[node.id] = content;
			}
			catch { unavailable.push(node.id); }
		}
	}
	entries.push({ path: 'manifest.json', content: JSON.stringify({ format: 'bangumi-template-bundle', settings, sources, unavailable, fileSnapshots }, null, 2) });
	return withWriteOperation('template-export', async () => {
		if (base && !app.vault.getAbstractFileByPath(base)) await app.vault.createFolder(base);
		await app.vault.createFolder(folder);
		for (const entry of entries) await app.vault.create(`${folder}/${entry.path}`, entry.content);
		return folder;
	});
}

export function parseTemplateBundle(text: string): TemplateSettingsV2 {
	const bundle = JSON.parse(text) as { format?: string; settings?: TemplateSettingsV2 };
	if (bundle.format !== 'bangumi-template-bundle' || !bundle.settings) throw new Error('Invalid template bundle');
	validateTemplateSettings(bundle.settings);
	return bundle.settings;
}

export interface TemplateBundleImport {
	settings: TemplateSettingsV2;
	fileSnapshots: Record<string, string>;
}

/** Old manifests remain rules-only; embedded snapshots make new manifests portable. */
export function readTemplateBundleImport(text: string): TemplateBundleImport {
	const settings = parseTemplateBundle(text);
	const raw = JSON.parse(text) as { fileSnapshots?: unknown };
	const snapshots = raw.fileSnapshots ?? {};
	if (typeof snapshots !== 'object' || snapshots === null || Array.isArray(snapshots)) throw new Error('Invalid file snapshots');
	for (const [id, content] of Object.entries(snapshots)) {
		if (settings.rules[id]?.content?.mode !== 'file' || typeof content !== 'string') throw new Error('Invalid file snapshot: ' + id);
	}
	return { settings, fileSnapshots: snapshots as Record<string, string> };
}

/** Check every effective node, including descendants of invalid references, before applying. */
export async function preflightTemplateImport(app: App, bundle: TemplateBundleImport, restoreFiles: boolean): Promise<string[]> {
	const errors: string[] = [];
	for (const node of TEMPLATE_NODES) {
		const rule = resolveTemplateRule(bundle.settings, node.id);
		try {
			if (restoreFiles && rule.content.mode === 'file' && bundle.fileSnapshots[rule.contentSource] === undefined) throw new Error('备份没有文件快照 / No file snapshot');
			await resolveNodeContent(bundle.settings, node.id, path => restoreFiles
				? Promise.resolve(bundle.fileSnapshots[rule.contentSource]) : readTemplateFile(app, path));
		} catch {
			errors.push(`${node.id} ← ${rule.contentSource}: ${rule.content.filePath ?? ''} · 模板缺失、空白或条件结构无效 / Missing, empty or invalid template`);
		}
	}
	return errors;
}

/** Restore snapshots into a fresh folder and rebind references; original files are untouched. */
export async function restoreTemplateBundleFiles(app: App, bundle: TemplateBundleImport, parent: string): Promise<TemplateSettingsV2> {
	const errors = await preflightTemplateImport(app, bundle, true);
	if (errors.length) throw new Error(errors.join('\n'));
	const staged = JSON.parse(JSON.stringify(bundle.settings)) as TemplateSettingsV2;
	for (const [id, content] of Object.entries(bundle.fileSnapshots)) staged.rules[id].content = { mode: 'custom', customContent: content };
	const folder = await exportTemplateBundle(app, staged, parent);
	const restored = JSON.parse(JSON.stringify(bundle.settings)) as TemplateSettingsV2;
	for (const id of Object.keys(bundle.fileSnapshots)) restored.rules[id].content!.filePath = `${folder}/${id.replace(/\//g, '--')}.md`;
	return restored;
}
