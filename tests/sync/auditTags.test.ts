import { describe, expect, it, vi } from 'vitest';
vi.mock('obsidian', async original => ({ ...await original<Record<string, unknown>>(), requestUrl: vi.fn() }));
import { requestUrl } from 'obsidian';
import { BangumiClient } from '../../src/api/client';
import { StatusSyncExecutor } from '../../src/sync/statusSyncExecutor';
import type { StatusSyncDiff } from '../../src/sync/statusSyncTypes';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';
import { InMemoryVault } from '../mocks/inMemoryVault';

describe('confirmed tags reach the actual HTTP payload', () => {
 it('keeps cloud punctuation tags through the real merge executor and client', async () => {
  vi.mocked(requestUrl).mockResolvedValue({ status: 200, json: {} } as Awaited<ReturnType<typeof requestUrl>>);
  const vault = new InMemoryVault(); const content = '---\nid: 1\ntags:\n  - 本地\n---\n';
  vault.addFile('one.md', content);
  const skip = { hasDiff: false, decision: 'skip', localValue: null, cloudValue: null };
  const diff = { subjectId: 1, name_cn: 'fixture', localPath: 'one.md', localContentSnapshot: content, hasAnyDiff: true,
   rate: skip, comment: skip, status: skip, episodeStatus: skip, platformFields: [],
   tags: { hasDiff: true, decision: 'merge', localValue: ['本地'], cloudValue: ['Fate/stay-night', 'A(B)', 'A:B'] },
  } as unknown as StatusSyncDiff;
  const executor = new StatusSyncExecutor(vault.app, new BangumiClient('fixture'), new SubjectDocumentService(vault.app));
  expect(await executor.executeSync([diff])).toEqual({ successCount: 1, failCount: 0 });
  const request = vi.mocked(requestUrl).mock.calls.at(-1)![0] as { body: string };
  expect(JSON.parse(request.body)).toEqual({ tags: ['本地','Fate/stay-night','A(B)','A:B'] });
  for (const tag of ['本地','Fate/stay-night','A(B)','A:B']) expect(vault.contents.get('one.md')).toContain(tag);
 });
 it.each([['bad tag'], Array.from({length:21},(_,i)=>String(i))])('rejects invalid or excessive tags before sending: %j', async (...tags) => {
  vi.mocked(requestUrl).mockClear();
  await expect(new BangumiClient('fixture').updateCollection(1, { tags })).rejects.toThrow(/tags/);
  expect(requestUrl).not.toHaveBeenCalled();
 });
});
