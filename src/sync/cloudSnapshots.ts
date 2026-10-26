import { UserCollection } from '../../common/api/types';

/** Deterministic semantic snapshots kept in memory, never logged. */
export function cloudSnapshot(value: unknown): string {
	const normalize = (item: unknown): unknown => {
		if (Array.isArray(item)) return item.map(normalize);
		if (item !== null && typeof item === 'object') {
			return Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined)
				.sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, normalize(value)]));
		}
		return item;
	};
	return JSON.stringify(normalize(value));
}

export function collectionSnapshot(item: UserCollection): string {
	return cloudSnapshot({ subjectId: item.subject_id, subjectType: item.subject_type, type: item.type,
		rate: item.rate ?? 0, comment: item.comment ?? '', tags: [...new Set(item.tags ?? [])].sort(), private: item.private ?? false,
		episodes: item.ep_status, volumes: item.vol_status, updatedAt: item.updated_at,
		subject: item.subject ? { id: item.subject.id, type: item.subject.type, name: item.subject.name, name_cn: item.subject.name_cn,
			date: item.subject.date, eps: item.subject.eps, volumes: item.subject.volumes, images: item.subject.images,
			short_summary: item.subject.short_summary } : null });
}
