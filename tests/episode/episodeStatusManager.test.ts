import { describe, it, expect, vi } from 'vitest';
import { EpisodeStatusManager } from '../../src/episode/episodeStatusManager';
import { BangumiClient } from '../../src/api/client';
import { InMemoryVault } from '../mocks/inMemoryVault';
vi.mock('../../common/utils/timing', () => ({ delay: () => Promise.resolve() }));
const original = '---\nid: 1\nep_statuses:\n  - 10:1:2\n  - 20:20:2\n  - 30:30:3\n  - 99:0.5:2\n---\nBody\n\n\n<span class="ep-box watched" data-id="10" data-ep="1" data-status="2">1</span>';
function setup() {
 const vault = new InMemoryVault(); const file = vault.addFile('one.md', original);
 Object.assign(vault.app, {workspace: {containerEl: {ownerDocument: {defaultView: null}}}});
 const client = new BangumiClient(); const manager = new EpisodeStatusManager(vault.app, client);
 return { vault, file, client, manager };
}
describe('episode status data preservation', () => {
 it('patches selected episodes while preserving later, dropped and special episodes', async () => {
  const {vault,file,manager}=setup(); await manager.patchEpisodeStatuses(file,[{episodeId:10,epNumber:1,status:0}]);
  const map=await manager.getEpisodeStatusMap(file); expect(map.get(10)?.status).toBe(0);
  for(const [id,status] of [[20,2],[30,3],[99,2]]) expect(map.get(id)?.status).toBe(status);
  expect(vault.contents.get(file.path)).toContain('Body\n\n\n');
 });
 it('clears both frontmatter and rendered statuses',async()=>{
  const {file,manager}=setup(); await manager.clearAllStatuses(file);
  expect(manager.serializeEpisodeStatuses(await manager.getEpisodeStatusMap(file))).toBe('');
 });
 it('rejects a different subject before requesting cloud data',async()=>{
  const {file,manager,client}=setup(); const read=vi.spyOn(client,'getUserEpisodeStatus');
  expect(await manager.syncStatusFromCloud(file,2)).toBe(false); expect(read).not.toHaveBeenCalled();
 });
 it('preserves edits made while the cloud snapshot is loading',async()=>{
  const {vault,file,manager,client}=setup(); vi.spyOn(client,'getUserEpisodeStatus').mockImplementation(()=>{
   vault.contents.set(file.path,original+'new edit'); return Promise.resolve([]);
  });
  expect(await manager.syncStatusFromCloud(file,1)).toBe(false);expect(vault.contents.get(file.path)).toBe(original+'new edit');
 });
 it('does not clear local data when a cloud page fails',async()=>{
  const {vault,file,manager,client}=setup();vi.spyOn(client,'getUserEpisodeStatus').mockRejectedValue(new Error('incomplete'));
  expect(await manager.syncStatusFromCloud(file,1)).toBe(false);expect(vault.contents.get(file.path)).toBe(original);
 });
});

it('uploads explicit zero states when every local episode is cleared', async () => {
 const {vault,file,manager,client}=setup();vault.contents.set(file.path,'---\nid: 1\n---\n');
 vi.spyOn(client,'getUserEpisodeStatus').mockResolvedValue([{type:2,episode:{id:10,ep:1,sort:1}}] as Awaited<ReturnType<BangumiClient['getUserEpisodeStatus']>>);
 const write=vi.spyOn(client,'updateEpisodeStatus').mockResolvedValue();
 expect(await manager.syncStatusToCloud(file,undefined,1)).toEqual({success:1,failed:0});expect(write).toHaveBeenCalledWith(10,0);
});
it('counts a failed episode separately and preserves the local source', async () => {
 const {vault,file,manager,client}=setup();vault.contents.set(file.path,'---\nid: 1\n---\n');
 vi.spyOn(client,'getUserEpisodeStatus').mockResolvedValue([10,20].map(id=>({type:2,episode:{id,ep:1,sort:1}})) as Awaited<ReturnType<BangumiClient['getUserEpisodeStatus']>>);
 vi.spyOn(client,'updateEpisodeStatus').mockResolvedValueOnce().mockRejectedValueOnce(new Error('401'));
 expect(await manager.syncStatusToCloud(file,undefined,1)).toEqual({success:1,failed:1});
});
it('patches CRLF frontmatter without losing unrelated episodes',async()=>{
 const {vault,file,manager}=setup();vault.contents.set(file.path,original.replace(/\n/g,'\r\n'));
 await manager.patchEpisodeStatuses(file,[{episodeId:10,epNumber:1,status:0}]);
 expect((await manager.getEpisodeStatusMap(file)).get(30)?.status).toBe(3);
});
