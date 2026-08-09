import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const root = process.cwd();
const rootDocuments = ['README.md', 'AGENTS.md', 'CLAUDE.md'];

function collectMarkdown(directory) {
	const files = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (entry.name === '.git' || entry.name === 'node_modules') continue;
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...collectMarkdown(path));
		else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
	}
	return files;
}

const files = [
	...rootDocuments.map((file) => join(root, file)).filter(existsSync),
	...readdirSync(root)
		.filter((file) => /^release-notes-.*\.md$/.test(file))
		.map((file) => join(root, file)),
	...collectMarkdown(join(root, 'docs')),
];

const failures = [];
const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/g;

for (const file of files) {
	const content = readFileSync(file, 'utf8');
	for (const match of content.matchAll(markdownLink)) {
		let target = match[1].trim();
		if (target.startsWith('<') && target.includes('>')) {
			target = target.slice(1, target.indexOf('>'));
		} else {
			target = target.split(/\s+["']/u, 1)[0];
		}
		if (!target || /^(?:https?:|mailto:|obsidian:|#)/iu.test(target)) continue;
		const pathPart = target.split('#', 1)[0].split('?', 1)[0];
		if (!pathPart) continue;
		let decoded;
		try {
			decoded = decodeURIComponent(pathPart);
		} catch {
			failures.push(`${file}: invalid URL encoding in ${target}`);
			continue;
		}
		const absolute = resolve(dirname(file), decoded);
		if (!existsSync(absolute)) {
			failures.push(`${file}: missing ${target}`);
			continue;
		}
		if (target.endsWith('/') && !statSync(absolute).isDirectory()) {
			failures.push(`${file}: expected directory ${target}`);
		}
	}
}

if (failures.length > 0) {
	console.error(`Documentation link check failed (${failures.length}):`);
	for (const failure of failures) console.error(`- ${failure}`);
	process.exitCode = 1;
} else {
	console.log(`Documentation link check passed (${files.length} Markdown files).`);
}
