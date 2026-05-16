export function extractMarkdownSection(content: string, sectionName: string): string | undefined {
	const normalizedContent = content.replace(/\r\n/g, '\n');
	const lines = normalizedContent.split('\n');
	const heading = `## ${sectionName}`;
	const startIndex = lines.findIndex(line => line.trim() === heading);
	if (startIndex === -1) {
		return undefined;
	}

	let endIndex = lines.length;
	for (let i = startIndex + 1; i < lines.length; i++) {
		if (/^##\s+/.test(lines[i])) {
			endIndex = i;
			break;
		}
	}

	const sectionContent = lines.slice(startIndex + 1, endIndex).join('\n').trim();
	return sectionContent || undefined;
}

export function updateMarkdownSection(content: string, sectionName: string, sectionContent: string): string {
	const normalizedContent = content.replace(/\r\n/g, '\n');
	const lines = normalizedContent.split('\n');
	const heading = `## ${sectionName}`;
	const startIndex = lines.findIndex(line => line.trim() === heading);

	if (startIndex !== -1) {
		let endIndex = lines.length;
		for (let i = startIndex + 1; i < lines.length; i++) {
			if (/^##\s+/.test(lines[i])) {
				endIndex = i;
				break;
			}
		}

		const replacement = [heading, '', sectionContent.trim()];
		const nextLines = [
			...lines.slice(0, startIndex),
			...replacement,
			...lines.slice(endIndex),
		];
		return nextLines.join('\n').replace(/\n+$/, '\n');
	}

	return normalizedContent.replace(/\n*$/, '') + `\n\n## ${sectionName}\n\n${sectionContent.trim()}\n`;
}

export function updateEpisodeMarkdownSection(content: string, renderedEpisodes: string): string {
	const normalizedContent = content.replace(/\r\n?/g, '\n');
	const sectionRegex = /^## 集数\s*\n([\s\S]*?)(?=^##\s|\Z)/m;
	const nextSectionContent = `## 集数\n\n${renderedEpisodes}`.trimEnd();

	if (sectionRegex.test(normalizedContent)) {
		return normalizedContent.replace(sectionRegex, `${nextSectionContent}\n\n`);
	}

	const recordsHeadingRegex = /^## 记录/m;
	if (recordsHeadingRegex.test(normalizedContent)) {
		return normalizedContent.replace(recordsHeadingRegex, `${nextSectionContent}\n\n## 记录`);
	}

	return `${normalizedContent.trimEnd()}\n\n${nextSectionContent}\n`;
}
