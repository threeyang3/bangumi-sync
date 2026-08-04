import { LocalFileProblemSeverity, SubjectNamingState } from './localSubjectRegistry';

export interface PathDiagnosticIssue {
	severity: LocalFileProblemSeverity;
	code: string;
	message: string;
	path?: string;
	subjectId?: number;
	relatedPaths?: string[];
}

export interface LocalSubjectDiagnosticReport {
	generatedAt: string;
	scanRoot: string;
	validSubjects: number;
	issues: PathDiagnosticIssue[];
}

export interface PathMigrationEntry {
	subjectId: number;
	name: string;
	from: string;
	to: string;
	namingState: SubjectNamingState;
	status: 'rename' | 'unchanged' | 'protected' | 'failed';
	reason?: string;
}

export interface PathMigrationPreview {
	generatedAt: string;
	entries: PathMigrationEntry[];
}

export function formatDiagnosticReport(report: LocalSubjectDiagnosticReport): string {
	const lines = [
		'# Bangumi Sync local subject diagnostic',
		'',
		`- Generated: ${report.generatedAt}`,
		`- Scan root: ${report.scanRoot}`,
		`- Valid subjects: ${report.validSubjects}`,
		`- Issues: ${report.issues.length}`,
		'',
		'## Issues',
		'',
	];
	if (report.issues.length === 0) {
		lines.push('No issues found.');
	} else {
		for (const issue of report.issues) {
			const identity = issue.subjectId ? ` subject=${issue.subjectId}` : '';
			const path = issue.path ? ` path=${issue.path}` : '';
			lines.push(`- **${issue.severity} / ${issue.code}**${identity}${path}: ${issue.message}`);
			if (issue.relatedPaths?.length) {
				for (const relatedPath of issue.relatedPaths) lines.push(`  - ${relatedPath}`);
			}
		}
	}
	return `${lines.join('\n')}\n`;
}
