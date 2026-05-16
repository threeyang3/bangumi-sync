const SHORT_COMMENT_HEADER = /^> \[!abstract\]\+\s*\*\*短评\*\*\s*$/;
const CALLOUT_HEADER = /^> \[![^\]]+\]/;
const MARKDOWN_HEADING = /^#{1,6}\s+/;
const FRONTMATTER_FENCE = /^---\s*$/;

interface CommentBlock {
	start: number;
	end: number;
	lines: string[];
}

function isCalloutHeader(line: string): boolean {
	return CALLOUT_HEADER.test(line);
}

function findShortCommentBlock(content: string): CommentBlock | null {
	const normalizedContent = content.replace(/\r\n?/g, '\n');
	const lines = normalizedContent.split('\n');
	const headerIndex = lines.findIndex(line => SHORT_COMMENT_HEADER.test(line));

	if (headerIndex === -1) {
		return null;
	}

	let endIndex = headerIndex + 1;
	while (endIndex < lines.length) {
		const line = lines[endIndex];
		if (
			isCalloutHeader(line)
			|| MARKDOWN_HEADING.test(line)
			|| FRONTMATTER_FENCE.test(line)
		) {
			break;
		}
		endIndex++;
	}

	while (endIndex > headerIndex + 1 && lines[endIndex - 1].trim() === '') {
		endIndex--;
	}

	const start = lines.slice(0, headerIndex).join('\n').length + (headerIndex > 0 ? 1 : 0);
	const end = lines.slice(0, endIndex).join('\n').length + (endIndex < lines.length ? 1 : 0);

	return {
		start,
		end,
		lines: lines.slice(headerIndex, endIndex),
	};
}

export function normalizeShortComment(comment: string | null | undefined): string | null {
	if (!comment) {
		return null;
	}

	const normalized = comment
		.replace(/\r\n?/g, '\n')
		.replace(/\u00a0/g, ' ')
		.split('\n\n')
		.map(para => para.split('\n').map(line => line.replace(/\s+$/g, '').trim()).join('\n').replace(/\n/g, '\n\n'))
		.join('\n\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	return normalized.length > 0 ? normalized : null;
}

export function extractShortComment(content: string): string | null {
	const block = findShortCommentBlock(content);
	if (!block) {
		return null;
	}

	const bodyLines = block.lines.slice(1).map(line => {
		if (/^>\s?/.test(line)) {
			return line.replace(/^>\s?/, '');
		}
		return line.replace(/\s+$/g, '');
	});

	return normalizeShortComment(bodyLines.join('\n'));
}

export function updateShortComment(content: string, newComment: string): string {
	const normalizedComment = normalizeShortComment(newComment);
	if (!normalizedComment) {
		return removeShortComment(content);
	}

	const newCommentLines = normalizedComment
		.split('\n')
		.map(line => line.length > 0 ? `> ${line}` : '>');
	const newCommentBlock = ['> [!abstract]+ **短评**', ...newCommentLines].join('\n');
	const block = findShortCommentBlock(content);

	if (block) {
		return content.slice(0, block.start) + newCommentBlock + content.slice(block.end);
	}

	const introMatch = content.match(/^> \[!abstract\]\+\s*\*\*简介\*\*/m);
	if (introMatch && introMatch.index !== undefined) {
		return content.slice(0, introMatch.index) + newCommentBlock + '\n\n' + content.slice(introMatch.index);
	}

	const frontmatterEnd = content.indexOf('---', 3);
	if (frontmatterEnd !== -1) {
		const afterFrontmatter = content.substring(frontmatterEnd + 3).trimStart();
		return content.substring(0, frontmatterEnd + 3) + '\n\n' + newCommentBlock + '\n\n' + afterFrontmatter;
	}

	return `${newCommentBlock}\n\n${content}`;
}

export function removeShortComment(content: string): string {
	const block = findShortCommentBlock(content);
	if (!block) {
		return content;
	}

	let updated = content.slice(0, block.start) + content.slice(block.end);
	updated = updated.replace(/\n{3,}/g, '\n\n');
	return updated;
}
