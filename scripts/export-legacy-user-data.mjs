#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { parse: parseYaml } = require('yaml');

const SUBJECT_TYPE = {
  book: 1,
  anime: 2,
  music: 3,
  game: 4,
  real: 6,
};

const TYPE_LABEL_ORDER = ['anime', 'novel', 'comic', 'album', 'music', 'game', 'real', 'unknown'];

const BANGUMI_FIELDS = new Set([
  'id', 'ID', 'BangumiID',
  '中文名', '原名', '别名',
  '作品大类', '具体类型',
  'Bangumi评分', 'Bangumi链接', '封面',
  '观看状态', '阅读状态', '游玩状态', '收藏状态',
  '评分', '短评',
  'tags', 'Tags',
  '开播时间', '集数', '动画公司', '导演', '音乐', '官方网站',
  '作者', '插画', '书系', '册数', '发行日期', '出版社', '官网',
  '话数', '杂志', '作画',
  '开发', '发行', '游玩人数',
  '页数', 'ISBN',
  '上映日期',
  '进度',
  '相关',
  '平台',
  '开始',
]);

const LEGACY_FIELD_KEYS = new Set([
  'tags', 'Tags', 'my_tags',
  '评分', 'my_rate',
  '短评', 'comment', 'my_comment',
  '存储', '资源属性',
  '评分明细', '明细',
  '音乐评分', '人设评分', '剧情评分', '美术评分',
  '插画评分', '文笔评分', '画工评分', '趣味评分',
]);

function parseArgs(argv) {
  const result = {
    input: process.cwd(),
    output: '',
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--input' || arg === '-i') {
      result.input = argv[++i] || result.input;
      continue;
    }
    if (arg === '--output' || arg === '-o') {
      result.output = argv[++i] || result.output;
      continue;
    }
    if (arg.startsWith('--input=')) {
      result.input = arg.slice('--input='.length);
      continue;
    }
    if (arg.startsWith('--output=')) {
      result.output = arg.slice('--output='.length);
      continue;
    }
  }

  return result;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/export-legacy-user-data.mjs --input <vault-or-folder> --output <dir>',
    '',
    'Options:',
    '  -i, --input   Folder to scan (defaults to current working directory)',
    '  -o, --output  Output folder (defaults to <input>/legacy-export)',
    '  -h, --help    Show this help',
  ].join('\n'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const inputDir = path.resolve(args.input);
  const outputDir = path.resolve(args.output || path.join(inputDir, 'legacy-export'));
  const markdownFiles = await collectMarkdownFiles(inputDir);

  if (markdownFiles.length === 0) {
    console.log(`No markdown files found under: ${inputDir}`);
    return;
  }

  const grouped = new Map();
  const skipped = [];
  let processed = 0;

  for (const filePath of markdownFiles) {
    const content = await fs.readFile(filePath, 'utf8');
    const entry = extractEntry(filePath, content);

    if (!entry) {
      skipped.push({ filePath, reason: 'missing id or unsupported frontmatter' });
      processed++;
      continue;
    }

    const group = grouped.get(entry.subjectTypeLabel) || createGroup(entry.subjectTypeLabel);
    group.items[entry.identifier.id] = entry;
    grouped.set(entry.subjectTypeLabel, group);
    processed++;
  }

  await fs.mkdir(outputDir, { recursive: true });

  const writtenFiles = [];
  for (const typeLabel of TYPE_LABEL_ORDER) {
    const group = grouped.get(typeLabel);
    if (!group || Object.keys(group.items).length === 0) {
      continue;
    }

    const exportData = {
      version: '2.0-legacy',
      exportTime: new Date().toISOString(),
      subjectType: typeLabel,
      totalCount: Object.keys(group.items).length,
      items: group.items,
    };

    const fileName = `bangumi-legacy-user-data-${typeLabel}.json`;
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, JSON.stringify(exportData, null, 2), 'utf8');
    writtenFiles.push(filePath);
  }

  console.log(`Processed: ${processed}`);
  console.log(`Written files: ${writtenFiles.length}`);
  for (const filePath of writtenFiles) {
    console.log(`  ${filePath}`);
  }

  if (skipped.length > 0) {
    console.log(`Skipped: ${skipped.length}`);
    for (const item of skipped.slice(0, 20)) {
      console.log(`  ${item.filePath} (${item.reason})`);
    }
    if (skipped.length > 20) {
      console.log(`  ... and ${skipped.length - 20} more`);
    }
  }
}

function createGroup(subjectTypeLabel) {
  return {
    subjectTypeLabel,
    items: {},
  };
}

async function collectMarkdownFiles(rootDir) {
  const result = [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectMarkdownFiles(fullPath);
      result.push(...nested);
      continue;
    }

    if (entry.isFile() && fullPath.toLowerCase().endsWith('.md')) {
      result.push(fullPath);
    }
  }

  return result;
}

function extractEntry(filePath, content) {
  const frontmatterText = extractFrontmatter(content);
  if (!frontmatterText) {
    return null;
  }

  let frontmatter;
  try {
    frontmatter = parseYaml(frontmatterText) || {};
  } catch {
    return null;
  }

  if (typeof frontmatter !== 'object' || frontmatter === null) {
    return null;
  }

  const id = extractId(frontmatter);
  if (!id) {
    return null;
  }

  const subjectType = inferSubjectType(frontmatter);
  const nameCn = firstString(frontmatter, ['中文名', 'name_cn']) || path.basename(filePath, path.extname(filePath));
  const workType = firstString(frontmatter, ['具体类型']) || inferWorkType(subjectType, frontmatter);

  return {
    identifier: {
      id,
      name_cn: nameCn,
      type: subjectType.type,
      workType: workType || undefined,
    },
    subjectTypeLabel: subjectType.label,
    legacy: extractLegacyFields(frontmatter),
    customProperties: extractCustomProperties(frontmatter),
    bodySections: extractBodySections(content),
  };
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

function extractId(frontmatter) {
  const candidates = [
    frontmatter.id,
    frontmatter.ID,
    frontmatter.BangumiID,
    frontmatter['Bangumi链接'],
    frontmatter.cover,
    frontmatter['封面'],
  ];

  for (const candidate of candidates) {
    const id = extractIdFromValue(candidate);
    if (id) {
      return id;
    }
  }

  for (const value of Object.values(frontmatter)) {
    const id = extractIdFromValue(value);
    if (id) {
      return id;
    }
  }

  return null;
}

function extractIdFromValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const subjectMatch = value.match(/subject\/(\d+)/i);
  if (subjectMatch) {
    return Number(subjectMatch[1]);
  }

  const coverMatch = value.match(/\/(\d+)_/);
  if (coverMatch) {
    return Number(coverMatch[1]);
  }

  return null;
}

function inferSubjectType(frontmatter) {
  const rawType = firstValue(frontmatter, ['作品大类', 'type']);
  const rawTypeText = typeof rawType === 'string' ? rawType.trim() : '';

  if (typeof rawType === 'number') {
    return {
      type: rawType,
      label: numericTypeToLabel(rawType, frontmatter),
    };
  }

  if (rawTypeText) {
    const normalized = rawTypeText.toLowerCase();
    if (normalized === 'anime' || normalized === '动画') {
      return { type: SUBJECT_TYPE.anime, label: 'anime' };
    }
    if (normalized === 'book' || normalized === '小说') {
      return { type: SUBJECT_TYPE.book, label: 'novel' };
    }
    if (normalized === 'novel') {
      return { type: SUBJECT_TYPE.book, label: 'novel' };
    }
    if (normalized === 'comic' || normalized === '漫画') {
      return { type: SUBJECT_TYPE.book, label: 'comic' };
    }
    if (normalized === 'album' || normalized === '画集' || normalized === '画本') {
      return { type: SUBJECT_TYPE.book, label: 'album' };
    }
    if (normalized === 'music' || normalized === '音乐') {
      return { type: SUBJECT_TYPE.music, label: 'music' };
    }
    if (normalized === 'game' || normalized === '游戏') {
      return { type: SUBJECT_TYPE.game, label: 'game' };
    }
    if (normalized === 'real' || normalized === '三次元') {
      return { type: SUBJECT_TYPE.real, label: 'real' };
    }
  }

  if (hasAnyKey(frontmatter, ['游玩状态', '平台', '开发'])) {
    return { type: SUBJECT_TYPE.game, label: 'game' };
  }

  if (hasAnyKey(frontmatter, ['导演', '动画公司', '开播时间', '集数'])) {
    return { type: SUBJECT_TYPE.anime, label: 'anime' };
  }

  if (hasAnyKey(frontmatter, ['ISBN', '页数', '书系', '杂志', '作画', '插画', '作者'])) {
    const workType = firstString(frontmatter, ['具体类型'])?.toLowerCase();
    if (workType === 'comic') {
      return { type: SUBJECT_TYPE.book, label: 'comic' };
    }
    if (workType === 'album') {
      return { type: SUBJECT_TYPE.book, label: 'album' };
    }
    return { type: SUBJECT_TYPE.book, label: 'novel' };
  }

  if (hasAnyKey(frontmatter, ['上映日期'])) {
    return { type: SUBJECT_TYPE.real, label: 'real' };
  }

  if (hasAnyKey(frontmatter, ['收藏状态'])) {
    return { type: SUBJECT_TYPE.music, label: 'music' };
  }

  return { type: SUBJECT_TYPE.book, label: 'unknown' };
}

function numericTypeToLabel(type, frontmatter) {
  switch (type) {
    case SUBJECT_TYPE.anime:
      return 'anime';
    case SUBJECT_TYPE.book: {
      const workType = firstString(frontmatter, ['具体类型'])?.toLowerCase();
      if (workType === 'comic') return 'comic';
      if (workType === 'album') return 'album';
      return 'novel';
    }
    case SUBJECT_TYPE.music:
      return 'music';
    case SUBJECT_TYPE.game:
      return 'game';
    case SUBJECT_TYPE.real:
      return 'real';
    default:
      return 'unknown';
  }
}

function inferWorkType(subjectType, frontmatter) {
  if (subjectType.label !== 'novel' && subjectType.label !== 'comic' && subjectType.label !== 'album') {
    return undefined;
  }

  const explicit = firstString(frontmatter, ['具体类型']);
  if (explicit) {
    return explicit;
  }

  return subjectType.label === 'novel' ? 'Novel' : subjectType.label;
}

function extractLegacyFields(frontmatter) {
  const tags = parseTags(firstValue(frontmatter, ['tags', 'Tags', 'my_tags']));
  const rate = parseRate(firstValue(frontmatter, ['评分', 'my_rate']));
  const comment = firstString(frontmatter, ['短评', 'comment', 'my_comment']) || '';
  const storage = firstValue(frontmatter, ['存储', '资源属性']);
  const ratingDetails = parseRatingDetails(frontmatter);

  return {
    tags,
    rate,
    comment,
    storage: normalizeStorage(storage),
    ratingDetails,
  };
}

function parseTags(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (Array.isArray(value)) {
    return dedupeStrings(value.map(item => String(item).trim()).filter(Boolean));
  }

  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/^["']|["']$/g, '');
    if (!cleaned) {
      return [];
    }
    return dedupeStrings(
      cleaned
        .split(/[,，]/)
        .map(item => item.trim())
        .filter(Boolean)
    );
  }

  return [];
}

function parseRate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/^["']|["']$/g, '');
    if (!cleaned) {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeStorage(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned || null;
  }

  if (Array.isArray(value)) {
    const items = value.map(item => String(item).trim()).filter(Boolean);
    return items.length > 0 ? items : null;
  }

  return value;
}

function parseRatingDetails(frontmatter) {
  const details = {};
  const directKeys = [
    ['音乐评分', 'music'],
    ['人设评分', 'character'],
    ['剧情评分', 'story'],
    ['美术评分', 'art'],
    ['插画评分', 'illustration'],
    ['文笔评分', 'writing'],
    ['画工评分', 'drawing'],
    ['趣味评分', 'fun'],
  ];

  for (const [sourceKey, targetKey] of directKeys) {
    const value = firstValue(frontmatter, [sourceKey]);
    const normalized = normalizeDetailValue(value);
    if (normalized !== null) {
      details[targetKey] = normalized;
    }
  }

  const combinedValue = firstValue(frontmatter, ['评分明细', '明细']);
  mergeCombinedRatingDetails(details, combinedValue);

  return details;
}

function normalizeDetailValue(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned || null;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return String(value).trim() || null;
}

function mergeCombinedRatingDetails(target, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, entryValue] of Object.entries(value)) {
      const mappedKey = normalizeRatingDetailKey(key);
      if (!mappedKey) {
        continue;
      }
      const normalized = normalizeDetailValue(entryValue);
      if (normalized !== null) {
        target[mappedKey] = normalized;
      }
    }
    return;
  }

  const rawText = Array.isArray(value)
    ? value.map(item => String(item)).join('\n')
    : String(value);

  const regex = /([^,，;；\n:：=]+)\s*[:：=]\s*([^,，;；\n]+)/g;
  let match;
  while ((match = regex.exec(rawText)) !== null) {
    const mappedKey = normalizeRatingDetailKey(match[1]);
    if (!mappedKey) {
      continue;
    }
    const normalized = normalizeDetailValue(match[2]);
    if (normalized !== null) {
      target[mappedKey] = normalized;
    }
  }
}

function normalizeRatingDetailKey(label) {
  const normalized = String(label).trim().toLowerCase().replace(/评分$/, '');

  if (normalized.includes('音乐') || normalized === 'music') return 'music';
  if (normalized.includes('人设') || normalized === 'character') return 'character';
  if (normalized.includes('剧情') || normalized === 'story') return 'story';
  if (normalized.includes('美术') || normalized === 'art') return 'art';
  if (normalized.includes('插画') || normalized === 'illustration') return 'illustration';
  if (normalized.includes('文笔') || normalized === 'writing') return 'writing';
  if (normalized.includes('画工') || normalized === 'drawing') return 'drawing';
  if (normalized.includes('趣味') || normalized === 'fun') return 'fun';

  return null;
}

function extractCustomProperties(frontmatter) {
  const result = {};

  for (const [key, value] of Object.entries(frontmatter)) {
    if (BANGUMI_FIELDS.has(key)) {
      continue;
    }
    if (LEGACY_FIELD_KEYS.has(key)) {
      continue;
    }
    if (value === undefined || value === '' || value === null) {
      continue;
    }
    result[key] = value;
  }

  return result;
}

function extractBodySections(content) {
  const record = extractSection(content, '记录');
  const thoughts = extractSection(content, '感想');

  if (!record && !thoughts) {
    return undefined;
  }

  return {
    record,
    thoughts,
  };
}

function extractSection(content, sectionName) {
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

function firstValue(frontmatter, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
      return frontmatter[key];
    }
  }
  return undefined;
}

function firstString(frontmatter, keys) {
  const value = firstValue(frontmatter, keys);
  if (typeof value === 'string') {
    const cleaned = value.trim();
    return cleaned || undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

function hasAnyKey(frontmatter, keys) {
  return keys.some(key => Object.prototype.hasOwnProperty.call(frontmatter, key) && notEmpty(frontmatter[key]));
}

function notEmpty(value) {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return true;
}

function dedupeStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
