import { Subject } from '../../common/api/types';
import { CustomTemplates, resolveTemplateForSubject } from './contentTemplate';

export type TemplatePropertyFieldType = 'text' | 'toggle' | 'list';
export type TemplatePropertySource = 'identifier' | 'auto' | 'custom';

export interface TemplatePropertyDefinition {
	name: string;
	label: string;
	rawValue: string;
	type: TemplatePropertyFieldType;
	source: TemplatePropertySource;
	initialValue?: string | boolean | string[];
	templateVariables: string[];
	inputTemplateVariable?: string;
	placeholder?: string;
}

export interface TemplatePropertyGroups {
	identifierProperties: TemplatePropertyDefinition[];
	autoProperties: TemplatePropertyDefinition[];
	customProperties: TemplatePropertyDefinition[];
}

const IDENTIFIER_PROPERTY_NAMES = new Set([
	'id',
	'ID',
	'中文名',
	'原名',
	'别名',
	'作品大类',
	'具体类型',
]);

const AUTO_FILLED_PROPERTY_NAMES = new Set([
	'Bangumi评分',
	'Bangumi链接',
	'封面',
]);

export const AUTO_FILLED_TEMPLATE_VARS = new Set([
	'id',
	'name',
	'name_cn',
	'alias',
	'summary',
	'rating',
	'rank',
	'tags',
	'tags_inline',
	'cover',
	'bangumi_url',
	'type',
	'typeLabel',
	'typeId',
	'category',
	'date',
	'year',
	'month',
	'my_rate',
	'my_comment',
	'my_comment_raw',
	'my_status',
	'my_tags',
	'episode',
	'director',
	'music',
	'animeMake',
	'from',
	'musicMake',
	'audioDirector',
	'artDirector',
	'animeChief',
	'website',
	'author',
	'illustration',
	'publish',
	'series',
	'journal',
	'volumes',
	'status',
	'progress',
	'start',
	'end',
	'staff',
	'platform',
	'develop',
	'playerNum',
	'script',
	'art',
	'producer',
	'price',
	'pages',
	'isbn',
	'episodes',
	'volumes_display',
	'note_link',
	'related',
	'character1',
	'character2',
	'character3',
	'character4',
	'character5',
	'character6',
	'character7',
	'character8',
	'character9',
	'characterCV1',
	'characterCV2',
	'characterCV3',
	'characterCV4',
	'characterCV5',
	'characterCV6',
	'characterCV7',
	'characterCV8',
	'characterCV9',
	'characterPhoto1',
	'characterPhoto2',
	'characterPhoto3',
	'characterPhoto4',
	'characterPhoto5',
	'characterPhoto6',
	'characterPhoto7',
	'characterPhoto8',
	'characterPhoto9',
]);

const TEMPLATE_VAR_REGEX = /\{\{(\w+)(?:\|([^}]+))?\}\}/g;
const SINGLE_TEMPLATE_VAR_REGEX = /^"?\{\{(\w+)(?:\|([^}]+))?\}\}"?$/;

export function getTemplatePropertyGroupsForSubject(
	subject: Subject,
	customTemplates: CustomTemplates | undefined
): TemplatePropertyGroups {
	const template = resolveTemplateForSubject(subject, customTemplates);
	return extractTemplatePropertyGroupsFromTemplate(template);
}

export function extractTemplatePropertyGroupsFromTemplate(template: string): TemplatePropertyGroups {
	const customProperties: TemplatePropertyDefinition[] = [];
	const autoProperties: TemplatePropertyDefinition[] = [];
	const identifierProperties: TemplatePropertyDefinition[] = [];
	const frontmatter = extractFrontmatter(template);

	if (!frontmatter) {
		return { identifierProperties, autoProperties, customProperties };
	}

	const lines = frontmatter.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (!trimmed || trimmed.startsWith('{{')) {
			continue;
		}

		const match = lines[i].match(/^([^:\n]+):(?:\s*(.*))?$/);
		if (!match) {
			continue;
		}

		const propertyName = match[1].trim();
		const rawValue = (match[2] || '').trim();
		const continuationValue = rawValue === '' ? getTemplateDrivenContinuationValue(lines, i) : undefined;
		const valueForClassification = continuationValue ?? rawValue;
		const templateVariables = extractTemplateVariables(valueForClassification);
		const initialValue = parseTemplateInitialValue(rawValue);
		const inputTemplateVariable = parseInputTemplateVariable(valueForClassification);
		const source = classifyTemplateProperty(propertyName, templateVariables);

		const propertyType = parseTemplateFieldType(rawValue);
		const property: TemplatePropertyDefinition = {
			name: propertyName,
			label: propertyName,
			rawValue,
			type: propertyType,
			source,
			initialValue,
			templateVariables,
			inputTemplateVariable,
			placeholder: propertyType === 'list'
				? '值1, 值2'
				: inputTemplateVariable?.startsWith('rating_') ? '0-10' : undefined,
		};

		if (source === 'identifier') {
			identifierProperties.push(property);
		} else if (source === 'auto') {
			autoProperties.push(property);
		} else {
			customProperties.push(property);
		}
	}

	return { identifierProperties, autoProperties, customProperties };
}

export function buildExtraTemplateVarsFromPropertyValues(
	properties: TemplatePropertyDefinition[],
	propertyValues: Record<string, string | boolean | string[]> | undefined
): Record<string, string> {
	const extraVars: Record<string, string> = {};
	if (!propertyValues) {
		return extraVars;
	}

	for (const property of properties) {
		const value = propertyValues[property.name];
		if (value === undefined || value === '' || !property.inputTemplateVariable) {
			continue;
		}
		extraVars[property.inputTemplateVariable] = Array.isArray(value)
			? value.join(', ')
			: String(value);
	}

	return extraVars;
}

function classifyTemplateProperty(
	propertyName: string,
	templateVariables: string[]
): TemplatePropertySource {
	if (IDENTIFIER_PROPERTY_NAMES.has(propertyName)) {
		return 'identifier';
	}

	if (AUTO_FILLED_PROPERTY_NAMES.has(propertyName)) {
		return 'auto';
	}

	if (templateVariables.length === 0) {
		return 'custom';
	}

	return templateVariables.every(variable => AUTO_FILLED_TEMPLATE_VARS.has(variable))
		? 'auto'
		: 'custom';
}

function extractFrontmatter(template: string): string | null {
	const normalized = template.replace(/\r\n?/g, '\n');
	const match = normalized.match(/^---\n([\s\S]*?)\n---/);
	return match ? match[1] : null;
}

function getTemplateDrivenContinuationValue(lines: string[], currentIndex: number): string | undefined {
	const nextLine = lines[currentIndex + 1]?.trim();
	if (!nextLine || !/^\{\{(?!#if\b|\/if\b)/.test(nextLine)) {
		return undefined;
	}
	return nextLine;
}

function extractTemplateVariables(rawValue: string): string[] {
	const variables = new Set<string>();
	let match: RegExpExecArray | null;
	const regex = new RegExp(TEMPLATE_VAR_REGEX);

	while ((match = regex.exec(rawValue)) !== null) {
		variables.add(match[1]);
	}

	return [...variables];
}

function parseTemplateInitialValue(rawValue: string): string | boolean | string[] | undefined {
	if (!rawValue) {
		return undefined;
	}

	if (rawValue === 'true') {
		return true;
	}

	if (rawValue === 'false') {
		return false;
	}

	if (rawValue === '[]') {
		return [];
	}

	const singleVarMatch = rawValue.match(SINGLE_TEMPLATE_VAR_REGEX);
	if (singleVarMatch) {
		return typeof singleVarMatch[2] === 'string' ? singleVarMatch[2] : undefined;
	}

	if (
		(rawValue.startsWith('"') && rawValue.endsWith('"')) ||
		(rawValue.startsWith("'") && rawValue.endsWith("'"))
	) {
		return rawValue.slice(1, -1);
	}

	return rawValue;
}

function parseTemplateFieldType(rawValue: string): TemplatePropertyFieldType {
	if (rawValue === 'true' || rawValue === 'false') {
		return 'toggle';
	}

	if (rawValue === '[]') {
		return 'list';
	}

	return 'text';
}

function parseInputTemplateVariable(rawValue: string): string | undefined {
	const singleVarMatch = rawValue.match(SINGLE_TEMPLATE_VAR_REGEX);
	if (!singleVarMatch) {
		return undefined;
	}

	const variableName = singleVarMatch[1];
	return AUTO_FILLED_TEMPLATE_VARS.has(variableName) ? undefined : variableName;
}
