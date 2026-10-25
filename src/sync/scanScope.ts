import { isDescendantPath, normalizePathValue, sanitizeFileName } from '../../common/file/pathUtils';
import { tnFormat } from '../i18n';

interface ScanScopeConfig {
	scanFolderPath: string;
	pathTemplate: string;
	pathTemplateByType?: Record<string, string>;
}

/** Static directory prefix shared by all paths that a template can render. */
function templateRoot(template: string): string {
	const root: string[] = [];
	const directories = template.split('/').slice(0, -1);
	for (const segment of directories) {
		if (segment.includes('{{')) break;
		const safe = sanitizeFileName(segment, '');
		if (safe) root.push(safe);
	}
	// limitPathLength can flatten very long directories under their first segment.
	// Match that possibility instead of inferring a narrower, unsafe nested root.
	const maxDirectoryLength = directories.reduce((size, segment) => size + (segment.includes('{{') ? 120 : sanitizeFileName(segment, '').length) + 1, 0);
	if (maxDirectoryLength >= 220) return root[0] ?? '';
	return root.join('/');
}

/** One conservative root also fits the persisted recovery scanRoot contract. */
export function resolveScanRoot(config: ScanScopeConfig): string {
	if (config.scanFolderPath.trim() === '/') return '';
	const roots = [config.pathTemplate, ...Object.values(config.pathTemplateByType ?? {}).filter(template => template.trim())].map(templateRoot);
	const explicit = normalizePathValue(config.scanFolderPath.trim());
	if (explicit && explicit !== '/') {
		if (explicit.split('/').some(segment => segment === '..' || segment === '.') || roots.some(root => !isDescendantPath(root, explicit))) {
			throw new Error(tnFormat('settings', 'scanScopeMismatch', { root: explicit }));
		}
		return explicit;
	}
	const common = roots[0].split('/').filter(Boolean);
	for (const root of roots.slice(1)) {
		const parts = root.split('/');
		let length = 0;
		while (length < common.length && common[length] === parts[length]) length++;
		common.length = length;
	}
	return common.join('/');
}
