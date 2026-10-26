import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import { InMemoryVault } from '../mocks/inMemoryVault';
import { BangumiClient } from '../../src/api/client';
import { EpisodeStatusManager } from '../../src/episode/episodeStatusManager';
import { FrontmatterEditor } from '../../src/panel/batchEditorModal';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';

vi.mock('obsidian', async importOriginal => {
 const { load } = createRequire(import.meta.url)('js-yaml') as { load: (input: string) => unknown };
 return { ...await importOriginal<object>(), Modal: class {}, parseYaml: load };
});
vi.mock('../../common/utils/timing', () => ({ delay: () => Promise.resolve() }));

function setup(yaml: string) {
 const vault = new InMemoryVault();
 const file = vault.addFile('one.md', `---\nid: 1\n${yaml}\nkeep: yes\n---\nBody`);
 Object.assign(vault.app, {workspace:{containerEl:{ownerDocument:{defaultView:null}}}});
 const client = new BangumiClient();
 const read = vi.spyOn(client,'getUserEpisodeStatus').mockResolvedValue([{type:2,episode:{id:20,ep:20,sort:20}}] as Awaited<ReturnType<BangumiClient['getUserEpisodeStatus']>>);
 const write = vi.spyOn(client,'updateEpisodeStatus').mockResolvedValue();
 return { vault, file, read, write, manager: new EpisodeStatusManager(vault.app,client) };
}

describe('YAML episode status safety with a real YAML parser', () => {
 it.each([
  'ep_statuses:\n  - "20:20:2"',
  "ep_statuses:\n  - '20:20:2'",
  'ep_statuses: ["20:20:2"]',
  'ep_statuses:\n- 20:20:2',
  '"ep_statuses":\n  # user comment\n  - 20:20:2',
  'ep_statuses:\n# user: comment\n- "20:20:2"',
 ])('preserves valid YAML during patch and upload: %s', async yaml => {
  const {vault,file,manager,write}=setup(yaml);
  await manager.syncStatusToCloud(file,undefined,1);
  expect(write).not.toHaveBeenCalled();
  await manager.patchEpisodeStatuses(file,[{episodeId:10,epNumber:0.5,status:3}]);
  const map=await manager.getEpisodeStatusMap(file);
  expect(map.get(20)?.status).toBe(2); expect(map.get(10)?.epNumber).toBe(0.5);
  expect(vault.contents.get(file.path)).toContain('keep: yes');
  await manager.clearAllStatuses(file);
  expect((await manager.getEpisodeStatusMap(file)).size).toBe(0);
 });
 it('round-trips generic batch edits before a partial episode patch', async () => {
  const {vault,file,manager}=setup('ep_statuses:\n  - 20:20:2');
  const editor=new FrontmatterEditor(vault.app);
  expect(await editor.batchApplyPerItemUpdates([{filePath:file.path,subjectId:1,properties:{ep_statuses:['20:20:2','30:30:3']}}])).toEqual({success:1,failed:0});
  await manager.patchEpisodeStatuses(file,[{episodeId:10,epNumber:1,status:2}]);
  expect(new SubjectDocumentService(vault.app).extractFrontmatterRecord(vault.contents.get(file.path)!).ep_statuses).toEqual(['10:1:2','20:20:2','30:30:3']);
 });
 it.each(['ep_statuses: bad', 'ep_statuses: null', 'ep_statuses: ["20:20:9"]', 'ep_statuses: ["20:20:2", "20:20:3"]', 'ep_statuses: ["0:1:2"]', 'ep_statuses: ["9007199254740992:1:2"]', 'ep_statuses: ["20:20:2junk"]', 'ep_statuses: ['])('fails closed for invalid data: %s', async yaml => {
  const {vault,file,manager,read,write}=setup(yaml); const before=vault.contents.get(file.path);
  await expect(manager.syncStatusToCloud(file,undefined,1)).rejects.toThrow();
  await expect(manager.patchEpisodeStatuses(file,[{episodeId:10,epNumber:1,status:2}])).rejects.toThrow();
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(vault.contents.get(file.path)).toBe(before);
 });
 it('still uploads explicit clears from an empty list',async()=>{
  const {manager,file,write}=setup('ep_statuses: []');
  await manager.syncStatusToCloud(file,undefined,1); expect(write).toHaveBeenCalledWith(20,0);
 });
});
