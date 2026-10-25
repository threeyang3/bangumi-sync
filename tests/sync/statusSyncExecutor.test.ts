import { describe, it, expect, vi } from 'vitest';
import { StatusSyncExecutor } from '../../src/sync/statusSyncExecutor';
import { StatusSyncDiff } from '../../src/sync/statusSyncTypes';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';
import { EpisodeStatusManager } from '../../src/episode/episodeStatusManager';
import { BangumiClient } from '../../src/api/client';
import { InMemoryVault } from '../mocks/inMemoryVault';
function setup() {
 const vault=new InMemoryVault();const content='---\nid: 1\n评分: 5\n---\nKeep my body';
 const file=vault.addFile('one.md',content);const client=new BangumiClient();const document=new SubjectDocumentService(vault.app);
 const episodes=new EpisodeStatusManager(vault.app,client);const executor=new StatusSyncExecutor(vault.app,client,document,episodes);
 const skipped={hasDiff:false,decision:'skip',localValue:null,cloudValue:null};
 const diff={subjectId:1,localPath:file.path,localContentSnapshot:content,name_cn:'Fixture',collection:{subject_type:2,type:2},
  rate:{...skipped,hasDiff:true,decision:'local',localValue:0,cloudValue:5},comment:{...skipped},tags:{...skipped},status:{...skipped},episodeStatus:{...skipped},
  hasAnyDiff:true,hasPlatformDiff:false,platformFields:[]} as unknown as StatusSyncDiff;
 const write=vi.spyOn(client,'updateCollection').mockResolvedValue();
 return {vault,file,client,episodes,executor,diff,write,content};
}
describe('status sync execution invariants',()=>{
 it.each(['identity','edit','move'])('rejects preview invalidated by %s before cloud writes',async kind=>{
  const {vault,file,executor,diff,write,content}=setup();
  if(kind==='move') await vault.app.fileManager.renameFile(file,'moved.md');
  else vault.contents.set(file.path,kind==='identity'?content.replace('id: 1','id: 2'):content+' edited');
  expect(await executor.executeSync([diff])).toEqual({successCount:0,failCount:1});expect(write).not.toHaveBeenCalled();
 });
 it('clears only the selected rating without resending collection status',async()=>{
  const {executor,diff,write}=setup();expect(await executor.executeSync([diff])).toEqual({successCount:1,failCount:0});
  expect(write).toHaveBeenCalledWith(1,{rate:0});
 });
 it('does not overwrite an edit made while a remote write is pending',async()=>{
  const {vault,file,executor,diff,write,content}=setup();diff.comment={hasDiff:true,decision:'cloud',localValue:'old',cloudValue:'new'};
  write.mockImplementation(()=>{vault.contents.set(file.path,content+' concurrent edit');return Promise.resolve();});
  expect(await executor.executeSync([diff])).toEqual({successCount:0,failCount:1});expect(vault.contents.get(file.path)).toBe(content+' concurrent edit');
 });
 it('reports partial episode upload as an item failure',async()=>{
  const {executor,diff,episodes}=setup();diff.rate.hasDiff=false;diff.episodeStatus={hasDiff:true,decision:'local',localValue:'x',cloudValue:'y'};
  vi.spyOn(episodes,'syncStatusToCloud').mockResolvedValue({success:1,failed:1});
  expect(await executor.executeSync([diff])).toEqual({successCount:0,failCount:1});
 });
});
it('executes a real cloud episode pull under the parent operation lease',async()=>{
 const {executor,diff,client,vault,file}=setup();diff.rate.hasDiff=false;
 diff.episodeStatus={hasDiff:true,decision:'cloud',localValue:'x',cloudValue:'y'};
 vi.spyOn(client,'getUserEpisodeStatus').mockResolvedValue([{type:2,episode:{id:99,ep:0.5,sort:1}}] as Awaited<ReturnType<BangumiClient['getUserEpisodeStatus']>>);
 expect(await executor.executeSync([diff])).toEqual({successCount:1,failCount:0});
 expect(vault.contents.get(file.path)).toContain('99:0.5:2');
});
