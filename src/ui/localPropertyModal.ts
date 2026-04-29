import { App, Modal, Setting } from 'obsidian';
import { Subject, UserCollection } from '../../common/api/types';
import { getTypeLabel } from '../../common/template/defaultTemplates';
import { tn } from '../i18n';
import { BangumiClient } from '../api/client';
import {
	CustomTemplates,
} from '../template/contentTemplate';
import {
	getTemplatePropertyGroupsForSubject,
	TemplatePropertyDefinition,
} from '../template/templateProperties';

export interface LocalPropertyValueMap {
	[propertyName: string]: string | boolean | string[];
}

export interface LocalPropertyModalResult {
	propertyValuesBySubjectId: Map<number, LocalPropertyValueMap>;
}

interface SubjectLocalPropertyItem {
	collection: UserCollection;
	subject: Subject;
	fields: TemplatePropertyDefinition[];
}

export class LocalPropertyModal extends Modal {
	private items: SubjectLocalPropertyItem[];
	private onSubmit: (result: LocalPropertyModalResult, mode: 'confirm' | 'skip') => void;
	private propertyValuesBySubjectId: Map<number, LocalPropertyValueMap> = new Map();

	constructor(
		app: App,
		collections: UserCollection[],
		subjectsById: Map<number, Subject>,
		customTemplates: CustomTemplates | undefined,
		onSubmit: (result: LocalPropertyModalResult, mode: 'confirm' | 'skip') => void
	) {
		super(app);
		this.items = collections
			.map(collection => {
				const subject = subjectsById.get(collection.subject_id);
				return {
					collection,
					subject,
					fields: subject ? getTemplatePropertyGroupsForSubject(subject, customTemplates).customProperties : [],
				};
			})
			.filter((item): item is SubjectLocalPropertyItem => Boolean(item.subject) && item.fields.length > 0);
		this.onSubmit = onSubmit;
		this.initializeDefaultValues();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('bangumi-local-property-modal');

		new Setting(contentEl)
			.setName(tn('controlPanel', 'localPropertyTitle'))
			.setHeading();

		contentEl.createEl('p', {
			text: tn('controlPanel', 'localPropertyDesc'),
			cls: 'bangumi-setting-desc',
		});

		for (const item of this.items) {
			this.renderSubjectSection(contentEl, item);
		}

		const buttonDiv = contentEl.createDiv({ cls: 'bangumi-modal-buttons' });
		buttonDiv.createEl('button', { text: tn('addToCollection', 'confirm'), cls: 'mod-cta' }, btn => {
			btn.addEventListener('click', () => {
				this.onSubmit({ propertyValuesBySubjectId: this.propertyValuesBySubjectId }, 'confirm');
				this.close();
			});
		});

		buttonDiv.createEl('button', { text: tn('controlPanel', 'localPropertySkip') }, btn => {
			btn.addEventListener('click', () => {
				this.onSubmit({ propertyValuesBySubjectId: new Map() }, 'skip');
				this.close();
			});
		});

		buttonDiv.createEl('button', { text: tn('addToCollection', 'cancel') }, btn => {
			btn.addEventListener('click', () => this.close());
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private initializeDefaultValues(): void {
		for (const item of this.items) {
			for (const field of item.fields) {
					if (field.initialValue !== undefined) {
						this.updatePropertyValue(item.collection.subject_id, field.name, field.initialValue);
					}
				}
		}
	}

	private renderSubjectSection(container: HTMLElement, item: SubjectLocalPropertyItem): void {
		const subject = item.subject;
		const sectionEl = container.createDiv({ cls: 'bangumi-local-property-section' });
		const heading = subject.name_cn || subject.name || String(item.collection.subject_id);
		const typeLabel = getTypeLabel(subject.type);
		sectionEl.createEl('h3', { text: `${heading} (${typeLabel})`, cls: 'bangumi-add-collection-section' });
		const gridEl = sectionEl.createDiv({ cls: 'bangumi-local-property-grid' });
		item.fields.forEach(field => {
			this.renderField(gridEl, item.collection.subject_id, field);
		});
	}

	private renderField(container: HTMLElement, subjectId: number, field: TemplatePropertyDefinition): void {
		const fieldEl = container.createDiv({ cls: `bangumi-local-property-field bangumi-local-property-field-${field.type}` });
		fieldEl.createEl('label', { text: field.label, cls: 'bangumi-local-property-label' });

		if (field.type === 'text') {
			const input = fieldEl.createEl('input', { type: 'text', cls: 'bangumi-local-property-input' });
			input.placeholder = field.placeholder || '';
			const initialValue = this.propertyValuesBySubjectId.get(subjectId)?.[field.name] ?? field.initialValue;
			if (typeof initialValue === 'string') {
				input.value = initialValue;
			}
			input.addEventListener('input', () => {
				this.updatePropertyValue(subjectId, field.name, input.value.trim() || undefined);
			});
			return;
		}

		if (field.type === 'list') {
			const input = fieldEl.createEl('input', { type: 'text', cls: 'bangumi-local-property-input' });
			input.placeholder = field.placeholder || '';
			const initialValue = this.propertyValuesBySubjectId.get(subjectId)?.[field.name] ?? field.initialValue;
			if (Array.isArray(initialValue)) {
				input.value = initialValue.join(', ');
			}
			input.addEventListener('input', () => {
				this.updatePropertyValue(subjectId, field.name, parseListInput(input.value));
			});
			return;
		}

		const toggleWrap = fieldEl.createDiv({ cls: 'bangumi-local-property-toggle' });
		const toggle = toggleWrap.createEl('input', { type: 'checkbox' });
		const initialValue = this.propertyValuesBySubjectId.get(subjectId)?.[field.name] ?? field.initialValue;
		toggle.checked = typeof initialValue === 'boolean' ? initialValue : false;
		toggle.addEventListener('change', () => {
			this.updatePropertyValue(subjectId, field.name, toggle.checked);
		});
	}

	private updatePropertyValue(
		subjectId: number,
		propertyName: string,
		value: string | boolean | string[] | undefined
	): void {
		const current = { ...(this.propertyValuesBySubjectId.get(subjectId) || {}) };
		if (
			value === undefined ||
			value === '' ||
			(Array.isArray(value) && value.length === 0)
		) {
			delete current[propertyName];
		} else {
			current[propertyName] = value;
		}

		if (Object.keys(current).length === 0) {
			this.propertyValuesBySubjectId.delete(subjectId);
			return;
		}

		this.propertyValuesBySubjectId.set(subjectId, current);
	}
}

export function hasLocalPropertyFieldsForCollections(
	collections: UserCollection[],
	subjectsById: Map<number, Subject>,
	customTemplates: CustomTemplates | undefined
): boolean {
	return collections.some(collection => {
		const subject = subjectsById.get(collection.subject_id);
		return subject !== undefined && getTemplatePropertyGroupsForSubject(subject, customTemplates).customProperties.length > 0;
	});
}

function parseListInput(value: string): string[] | undefined {
	const items = value
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);
	return items.length > 0 ? items : undefined;
}

export async function loadSubjectsForCollections(
	collections: UserCollection[],
	client: BangumiClient,
	onWarning?: (message: string) => void
): Promise<Map<number, Subject>> {
	const subjectsById = new Map<number, Subject>();

	for (const collection of collections) {
		try {
			const subject = await client.getSubject(collection.subject_id);
			subjectsById.set(collection.subject_id, subject);
		} catch (error) {
			console.warn(`[Bangumi Sync] 获取条目详情失败，使用收藏中的简版信息回退: ${collection.subject_id}`, error);
			onWarning?.(`部分条目详情获取失败，已使用简版信息继续：${collection.subject.name_cn || collection.subject.name}`);
			subjectsById.set(collection.subject_id, createFallbackSubject(collection));
		}
	}

	return subjectsById;
}

function createFallbackSubject(collection: UserCollection): Subject {
	return {
		id: collection.subject.id,
		type: collection.subject.type,
		name: collection.subject.name || '',
		name_cn: collection.subject.name_cn || '',
		summary: collection.subject.short_summary || '',
		date: collection.subject.date,
		platform: '',
		images: collection.subject.images || {},
		infobox: [],
		rating: {
			rank: collection.subject.rank || 0,
			total: collection.subject.collection_total || 0,
			count: {},
			score: collection.subject.score || 0,
		},
		collection: {
			wish: 0,
			collect: collection.subject.collection_total || 0,
			doing: 0,
			on_hold: 0,
			dropped: 0,
		},
		tags: collection.subject.tags || [],
		nsfw: false,
		locked: false,
		series: false,
		volumes: collection.subject.volumes || 0,
		eps: collection.subject.eps || 0,
		total_episodes: collection.subject.eps || 0,
		meta_tags: [],
	};
}
