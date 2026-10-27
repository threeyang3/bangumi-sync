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
	for (const node of TEMPLATE_NODES) {
		const resolved = resolveTemplateRule(settings, node.id);
		sources[node.id] = { contentSource: resolved.contentSource, pathSource: resolved.pathSource };
		if (settings.rules[node.id]?.content?.mode && settings.rules[node.id].content!.mode !== 'inherit') {
			try { entries.push({ path: `${node.id.replace(/\//g, '--')}.md`, content: await resolveNodeContent(settings, node.id, path => readTemplateFile(app, path)) }); }
			catch { unavailable.push(node.id); }
		}
	}
	entries.push({ path: 'manifest.json', content: JSON.stringify({ format: 'bangumi-template-bundle', settings, sources, unavailable }, null, 2) });
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
