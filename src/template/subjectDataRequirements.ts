import { classifySubject } from '../../common/template/templateSystem';
import { Subject, SubjectType } from '../../common/api/types';
import { parseInfoByType } from '../../common/parser/infoboxParser';
import { CustomTemplates, resolveTemplateForSubject } from './contentTemplate';

export interface SubjectDataRequirements {
	characters: boolean;
	persons: boolean;
	relations: boolean;
	episodes: boolean;
}

/** Inspect every branch conservatively, including defaults and condition keys. */
export function getSubjectDataRequirements(
	subject: Subject,
	templates?: CustomTemplates,
	enableRelatedLinks = true,
): SubjectDataRequirements {
	const template = resolveTemplateForSubject(subject, templates);
	const variables = new Set(Array.from(template.matchAll(/\{\{(?:#if\s+)?(\w+)(?=\||\}\})/g), match => match[1]));
	const info = parseInfoByType(subject.infobox, subject.type, subject.platform);
	const classification = classifySubject(subject);
	const bookNovel = subject.type === SubjectType.Book && classification.templateGroup === 'novel';
	const bookComic = subject.type === SubjectType.Book && classification.templateGroup === 'comic';
	return {
		characters: [...variables].some(name => /^character(?:CV|Photo)?[1-9]$/.test(name)),
		persons: subject.type === SubjectType.Anime && variables.has('animeMake') && !info.animeMake,
		relations: enableRelatedLinks,
		episodes: (bookNovel && variables.has('volumes_display'))
			|| ((subject.type === SubjectType.Anime || subject.type === SubjectType.Real || bookComic) && variables.has('episodes')),
	};
}
