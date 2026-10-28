import { App, Component, FuzzySuggestModal, MarkdownRenderer, Modal, Notice, Plugin, Setting, TFile, TextAreaComponent, normalizePath } from 'obsidian';
import { ContentRule, TemplateSettingsV2, TEMPLATE_NODES, templateChain, templateNode, resolveTemplateRule, resolveNodeContent, migrateTemplateSettings, classifySubject, compileTemplateSettings } from '../../common/template/templateSystem';
import { createTemplatePreviewSample } from '../template/templatePreviewSamples';
import { BangumiPluginSettings } from './settings';
import { exportTemplateBundle, parseTemplateBundle, readTemplateFile } from '../template/templateFiles';
import { extractTemplateVars, generateContentByType, resolveTemplateForSubject } from '../template/contentTemplate';
import { generatePreferredFilePath } from '../../common/template/pathTemplate';
import { BangumiClient } from '../api/client';
import { getSubjectDataRequirements } from '../template/subjectDataRequirements';
import { parseCharacters } from '../../common/parser/characterParser';
import { getLocale } from '../i18n';

const label = (zh: string, en: string) => getLocale() === 'zh-CN' ? zh : en;
const nodeLabel = (id: string) => {
	if (id === 'builtin') return label('内置默认值', 'Built-in default');
	if (id === 'book/novel/main') return label('普通小说', 'Novel (general)');
	const parts = templateNode(id).label.split(' / ');
	return getLocale() === 'zh-CN' ? parts[0] : parts[1] ?? parts[0];
};
const sourceLabel = (rule: ContentRule) => rule.mode === 'builtin'
	? (rule.builtinVariant === 'author' ? label('内置作者版', 'Built-in author preset') : label('内置标准版', 'Built-in standard preset'))
	: rule.mode === 'file' ? label('Markdown 文件', 'Markdown file') : label('自定义内容', 'Custom content');

export class TemplateSettingsView {
	private selected = 'anime';
	private modals = new Set<Modal>();
	constructor(private app: App, private getSettings: () => BangumiPluginSettings, private save: () => Promise<void>, owner: Plugin) {
		owner.register(() => { for (const modal of this.modals) modal.close(); });
	}
	private openModal(modal: Modal): void {
		const onClose = modal.onClose.bind(modal);
		modal.onClose = () => { this.modals.delete(modal); onClose(); };
		this.modals.add(modal); modal.open();
	}
	private system(): TemplateSettingsV2 {
		const settings = this.getSettings();
		return settings.templateSettings ?? (settings.templateSettings = migrateTemplateSettings(settings));
	}
	build(container: HTMLElement, axis: 'content' | 'path'): void {
		container.empty();
		const layout = container.createDiv({ cls: 'bangumi-template-workbench' });
		const nav = layout.createEl('nav', { cls: 'bangumi-template-nav', attr: { 'aria-label': label('模板分类', 'Template categories') } });
		const panel = layout.createDiv({ cls: 'bangumi-template-detail' });
		const addNode = (id: string) => {
			const button = nav.createEl('button', { text: nodeLabel(id), attr: { type: 'button', 'aria-pressed': String(id === this.selected), 'data-template-node': id } });
			button.addClass(`bangumi-template-depth-${templateChain(id).length - 1}`);
			button.addEventListener('click', () => { this.selected = id; this.build(container, axis); });
			TEMPLATE_NODES.filter(child => child.parent === id).forEach(child => addNode(child.id));
		};
		addNode('default');
		const id = this.selected;
		const system = this.system();
		const rule = system.rules[id] ?? {};
		const resolved = resolveTemplateRule(system, id);
		panel.createEl('p', { cls: 'bangumi-template-breadcrumb', text: templateChain(id).reverse().map(node => nodeLabel(node.id)).join(' / ') });
		new Setting(panel).setName(axis === 'content' ? label('内容模板', 'Content template') : label('文件路径', 'File path')).setHeading();
		panel.createEl('p', { cls: 'bangumi-template-source', text: `${label('内容来源', 'Content source')}: ${nodeLabel(resolved.contentSource)} → ${sourceLabel(resolved.content)}\n${label('路径来源', 'Path source')}: ${nodeLabel(resolved.pathSource)}\n${resolved.pathTemplate}` });
		const update = async () => { await this.save(); this.build(container, axis); };
		const changeContent = async (patch: Partial<ContentRule>) => {
			const current = this.system();
			current.rules[id] = { ...current.rules[id], content: { mode: 'inherit', ...current.rules[id]?.content, ...patch } };
			await update();
		};
		if (axis === 'content') {
			new Setting(panel).setName(label('来源', 'Source')).addDropdown(dropdown => dropdown
				.addOption('inherit', label('继承上级', 'Inherit parent')).addOption('builtin', label('内置预设', 'Built-in preset'))
				.addOption('file', label('Markdown 文件', 'Markdown file')).addOption('custom', label('自定义内容', 'Custom content'))
				.setValue(rule.content?.mode ?? 'inherit').onChange(value => changeContent({ mode: value as ContentRule['mode'] })));
			if (rule.content?.mode === 'builtin') new Setting(panel).setName(label('内置预设', 'Built-in preset')).addDropdown(dropdown => {
				dropdown.addOption('standard', label('标准版', 'Standard'));
				if (templateNode(id).templateKey !== 'musicTemplateConfig') dropdown.addOption('author', label('作者版', 'Author'));
				dropdown.setValue(rule.content?.builtinVariant === 'author' && templateNode(id).templateKey !== 'musicTemplateConfig' ? 'author' : 'standard').onChange(value => changeContent({ builtinVariant: value as 'standard' | 'author' }));
			});
			if (rule.content?.mode === 'file') new Setting(panel).setName(label('模板文件', 'Template file')).setDesc(rule.content.filePath ?? label('未选择文件，生成将被阻止', 'No file selected; generation is blocked'))
				.addButton(button => button.setButtonText(label('选择文件', 'Choose file')).onClick(() => this.openModal(new TemplateFilePicker(this.app, file => { void this.run(() => changeContent({ filePath: file.path })); }))));
			if (rule.content?.mode === 'custom') new Setting(panel).setName(label('自定义草稿', 'Custom draft')).setDesc(label('切换来源或继承时保留草稿。', 'Drafts survive source and inheritance changes.'))
				.addButton(button => button.setButtonText(label('编辑', 'Edit')).onClick(() => this.editText(rule.content?.customContent ?? '', value => changeContent({ customContent: value }))));
			new Setting(panel).setName(label('复制有效模板', 'Copy effective template')).setDesc(label('打开编辑器确认后保存到自定义草稿。', 'Review in the editor before replacing the custom draft.'))
				.addButton(button => button.setButtonText(label('复制并编辑', 'Copy and edit')).onClick(() => this.run(async () => this.editText(await resolveNodeContent(this.system(), id, path => readTemplateFile(this.app, path)), value => changeContent({ mode: 'custom', customContent: value })))));
		} else {
			new Setting(panel).setName(label('路径规则', 'Path rule')).addDropdown(dropdown => dropdown.addOption('inherit', label('继承上级', 'Inherit parent')).addOption('custom', label('独立路径', 'Custom path'))
				.setValue(rule.path?.mode ?? 'inherit').onChange(async value => {
					this.system().rules[id] = { ...this.system().rules[id], path: { value: resolved.pathTemplate, ...this.system().rules[id]?.path, mode: value as 'inherit' | 'custom' } }; await update();
				}));
			if (rule.path?.mode === 'custom') {
				let draft = rule.path.value ?? resolved.pathTemplate;
				new Setting(panel).setName(label('路径模板', 'Path template')).addText(text => text.setValue(draft).onChange(value => { draft = value; }))
					.addButton(button => button.setButtonText(label('应用', 'Apply')).onClick(() => this.run(async () => {
						if (!draft.trim()) throw new Error(label('路径不能为空', 'Path cannot be empty'));
						generatePreferredFilePath(draft, createTemplatePreviewSample(id).subject, this.getSettings().pathNamingStrategy);
						this.system().rules[id] = { ...this.system().rules[id], path: { mode: 'custom', value: draft } }; await update();
					})));
			}
			panel.createEl('p', { text: label('修改规则不会移动已有笔记。请使用路径迁移预览处理现有文件。', 'Changing a rule does not move notes. Use path migration preview for existing files.') });
		}
		new Setting(panel).setName(label('只读预览', 'Read-only preview')).addButton(button => button.setButtonText(label('预览 Markdown 与路径', 'Preview Markdown and path')).onClick(() => this.openModal(new TemplatePreviewModal(this.app, this.getSettings, id))));
	}
	buildShared(container: HTMLElement): void {
		const shared = this.system().sharedNote;
		new Setting(container).setName(label('共享笔记模板', 'Shared note template')).setHeading();
		let path = shared.path;
		new Setting(container).setName(label('共享笔记路径', 'Shared note path')).addText(text => text.setValue(path).onChange(value => { path = value; }))
			.addButton(button => button.setButtonText(label('应用', 'Apply')).onClick(() => this.run(async () => { this.system().sharedNote.path = path; await this.save(); })));
		new Setting(container).setName(label('共享笔记内容', 'Shared note content')).addButton(button => button.setButtonText(label('编辑', 'Edit')).onClick(() => this.editText(shared.content, async value => { this.system().sharedNote.content = value; await this.save(); })));
	}
	buildManagement(container: HTMLElement): void {
		new Setting(container).setName(label('模板管理', 'Template management')).setHeading();
		const report = container.createEl('details');
		report.createEl('summary', { text: label('升级报告与兼容性变化', 'Migration report and compatibility changes') });
		for (const note of this.system().migrationNotes) report.createEl('p', { text: note });
		let folder = 'templates';
		new Setting(container).setName(label('导出与备份', 'Export and backup')).setDesc(label('始终创建新子目录；保留草稿、继承规则与 manifest，不覆盖已有文件。', 'Always creates a new folder with drafts, inheritance rules and manifest; never overwrites files.'))
			.addText(text => text.setValue(folder).onChange(value => { folder = value; }))
			.addButton(button => button.setButtonText(label('导出', 'Export')).onClick(() => this.run(async () => { new Notice(await exportTemplateBundle(this.app, this.system(), folder)); })));
		new Setting(container).setName(label('验证全部模板', 'Validate all templates')).addButton(button => button.setButtonText(label('验证', 'Validate')).onClick(() => this.run(async () => {
			const compiled = await compileTemplateSettings(this.system(), path => readTemplateFile(this.app, path));
			const errors = Object.entries(compiled.customTemplates).filter(([key]) => key.startsWith('__template_error__:')).map(([, value]) => value);
			this.showText(label('验证结果', 'Validation results'), errors.length ? errors.join('\n') : label('全部模板可读取。', 'All templates are readable.'));
		})));
		new Setting(container).setName(label('导入 manifest', 'Import manifest')).setDesc(label('粘贴导出的 manifest。确认前显示变更节点，并自动备份当前模板。', 'Paste an exported manifest. Review changed nodes; current templates are backed up before import.'))
			.addButton(button => button.setButtonText(label('导入', 'Import')).onClick(() => this.editText('', text => {
				const next = parseTemplateBundle(text);
				const current = this.system();
				const reviewed = JSON.stringify(current);
				const changed = TEMPLATE_NODES.filter(node => JSON.stringify(current.rules[node.id]) !== JSON.stringify(next.rules[node.id])).map(node => node.id);
				const modal = new Modal(this.app); modal.titleEl.setText(label('确认模板导入', 'Confirm template import'));
				modal.contentEl.createEl('pre', { text: changed.join('\n') || label('分类规则无变化', 'No category rule changes') });
				modal.contentEl.createEl('p', { text: label('共享笔记配置也将替换。现有笔记不会改写。', 'Shared note settings will also be replaced. Existing notes are unchanged.') });
				new Setting(modal.contentEl).addButton(button => button.setButtonText(label('备份并导入', 'Back up and import')).onClick(() => this.run(async () => {
					if (JSON.stringify(this.system()) !== reviewed) throw new Error(label('配置已变化，请重新导入并审阅。', 'Settings changed. Import again to review the new changes.'));
					await exportTemplateBundle(this.app, current, folder);
					if (JSON.stringify(this.system()) !== reviewed) throw new Error(label('配置已变化，请重新导入并审阅。', 'Settings changed. Import again to review the new changes.'));
					this.getSettings().templateSettings = next; await this.save(); modal.close();
				}))); this.openModal(modal);
				return Promise.resolve();
			})));
	}
	private editText(value: string, save: (value: string) => Promise<void>): void {
		const modal = new Modal(this.app); modal.titleEl.setText(label('编辑模板', 'Edit template'));
		const editor = new TextAreaComponent(modal.contentEl).setValue(value); editor.inputEl.addClass('bangumi-template-textarea');
		new Setting(modal.contentEl).addButton(button => button.setButtonText(label('保存', 'Save')).onClick(() => this.run(async () => { await save(editor.getValue()); modal.close(); })))
			.addButton(button => button.setButtonText(label('取消', 'Cancel')).onClick(() => modal.close())); this.openModal(modal);
	}
	private showText(title: string, value: string): void { const modal = new Modal(this.app); modal.titleEl.setText(title); modal.contentEl.createEl('pre', { text: value }); this.openModal(modal); }
	private async run(action: () => Promise<void>): Promise<void> { try { await action(); } catch (error) { new Notice(error instanceof Error ? error.message : label('操作失败', 'Operation failed')); } }
}

class TemplateFilePicker extends FuzzySuggestModal<TFile> {
	constructor(app: App, private choose: (file: TFile) => void) { super(app); }
	getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
	getItemText(file: TFile): string { return file.path; }
	onChooseItem(file: TFile): void { this.choose(file); }
}

class TemplatePreviewModal extends Modal {
	private lifecycle = new Component();
	private rendering = new Component();
	private generation = 0;
	constructor(app: App, private settings: () => BangumiPluginSettings, private nodeId: string) { super(app); }
	onOpen(): void {
		this.lifecycle.load(); this.modalEl.addClass('bangumi-template-preview-modal');
		this.titleEl.setText(label('只读模板预览', 'Read-only template preview'));
		let subjectId = '';
		const controls = this.contentEl.createDiv();
		controls.createEl('p', { text: label('留空时使用当前分类的虚构内置数据，包含示例收藏和章节；全局默认与书籍节点使用小说示例。', 'Leave empty for fictional offline data for this category, including sample collection and chapters. Default and Book use a novel sample.') });
		const output = this.contentEl.createDiv();
		new Setting(controls).setName(label('Bangumi 条目 ID（留空使用示例）', 'Bangumi subject ID (empty for sample)')).addText(text => text.onChange(value => { subjectId = value.trim(); }))
			.addButton(button => button.setButtonText(label('重新预览', 'Refresh preview')).onClick(() => this.render(output, subjectId)));
		const invalidate = (path: string, oldPath?: string) => {
			const references = Object.values(migrateTemplateSettings(this.settings()).rules).flatMap(rule => rule.content?.mode === 'file' && rule.content.filePath ? [rule.content.filePath] : []);
			if (!references.some(reference => [path, oldPath].some(changed => changed && (normalizePath(reference) === normalizePath(changed) || normalizePath(reference).startsWith(`${normalizePath(changed)}/`))))) return;
			this.generation++; output.empty(); output.createEl('p', { text: label('模板文件已变更，请重新预览。', 'Template files changed. Refresh the preview.') });
		};
		this.lifecycle.registerEvent(this.app.vault.on('modify', file => invalidate(file.path)));
		this.lifecycle.registerEvent(this.app.vault.on('rename', (file, oldPath) => invalidate(file.path, oldPath)));
		this.lifecycle.registerEvent(this.app.vault.on('delete', file => invalidate(file.path)));
		this.lifecycle.registerEvent(this.app.vault.on('create', file => invalidate(file.path)));
		void this.render(output, '');
	}
	private async render(output: HTMLElement, subjectId: string): Promise<void> {
		const generation = ++this.generation; output.empty();
		this.rendering.unload();
		const rendering = this.rendering = new Component(); rendering.load();
		try {
			const settings = this.settings(); const system = migrateTemplateSettings(settings);
			const compiled = await compileTemplateSettings(system, path => readTemplateFile(this.app, path));
			const client = new BangumiClient(settings.accessToken);
			client.setRequestCancellationChecker(() => generation !== this.generation);
			if (subjectId && (!/^[1-9]\d*$/.test(subjectId) || !Number.isSafeInteger(Number(subjectId)))) throw new Error('Invalid subject ID');
			const full = subjectId ? await client.getFullSubjectInfo(Number(subjectId), undefined, subject => getSubjectDataRequirements(subject, compiled.customTemplates, false)) : undefined;
			const sample = subjectId ? undefined : createTemplatePreviewSample(this.nodeId);
			const subject = full?.subject ?? sample!.subject;
			const nodeId = subjectId ? classifySubject(subject).nodeId : this.nodeId;
			// Samples preview the selected node itself; real subjects use production classification.
			const source = subjectId ? resolveTemplateForSubject(subject, compiled.customTemplates) : await resolveNodeContent(system, nodeId, path => readTemplateFile(this.app, path));
			const templates = { ...compiled.customTemplates, [`__node__:${classifySubject(subject).nodeId}`]: source };
			delete templates[`__template_error__:${classifySubject(subject).nodeId}`];
			const needs = getSubjectDataRequirements(subject, templates, false);
			const episodes = subjectId && needs.episodes ? (await client.getEpisodes(subject.id)).data : sample?.episodes;
			const characters = sample?.characters ?? parseCharacters(full?.characters ?? [], 9);
			const vars = extractTemplateVars(subject, sample?.collection, characters, undefined, episodes, sample?.userEpisodeStatus, system.sharedNote.path, settings.coverLinkType, undefined, undefined, undefined, full?.persons);
			const content = generateContentByType(subject, sample?.collection, characters, templates, undefined, episodes, sample?.userEpisodeStatus, system.sharedNote.path, settings.coverLinkType, undefined, undefined, undefined, full?.persons);
			const resolved = resolveTemplateRule(system, nodeId);
			const path = generatePreferredFilePath(resolved.pathTemplate, subject, settings.pathNamingStrategy);
			if (generation !== this.generation) return;
			output.createEl('p', { text: `${nodeLabel(nodeId)} · ${label('内容', 'Content')}: ${nodeLabel(resolved.contentSource)} · ${label('路径', 'Path')}: ${nodeLabel(resolved.pathSource)}` });
			output.createEl('code', { text: path });
			output.createEl('p', { text: label('使用正式渲染与命名规则；此处展示新建正文和首选路径。收藏状态、本地保护内容、封面下载和批量碰撞分配请在同步预览中核对。', 'Uses production rendering and naming. Shows new content and preferred path; verify collection state, preserved local content, cover downloads and batch collisions in sync preview.') });
			const variables = [...new Set(Array.from(source.matchAll(/\{\{(?:#if\s+)?(\w+)/g), match => match[1]))];
			const missing = variables.filter(key => !vars[key]);
			const diagnostics = output.createEl('details');
			diagnostics.createEl('summary', { text: `${label('缺失或空值变量', 'Missing or empty variables')} (${missing.length})` });
			diagnostics.createEl('p', { text: missing.join(', ') || '—' });
			for (const [title, text] of [[label('模板源代码', 'Template source'), source], [label('生成的 Markdown', 'Generated Markdown'), content]]) {
				const details = output.createEl('details'); details.createEl('summary', { text: title }); details.createEl('pre', { text });
			}
			const rendered = output.createDiv({ cls: 'markdown-rendered' }); await MarkdownRenderer.render(this.app, content, rendered, path, rendering);
		} catch (error) { if (generation === this.generation) output.createEl('p', { text: error instanceof Error ? error.message : 'Preview failed' }); }
	}
	onClose(): void { this.generation++; this.rendering.unload(); this.lifecycle.unload(); this.contentEl.empty(); }
}
