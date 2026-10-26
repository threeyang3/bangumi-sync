import { describe, it, expect, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { InMemoryVault } from '../mocks/inMemoryVault';
import { BangumiClient } from '../../src/api/client';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';
import { EpisodeStatusManager } from '../../src/episode/episodeStatusManager';
import { StatusSyncService } from '../../src/sync/statusSyncService';
import { createDefaultStatusSyncFieldSelection } from '../../src/sync/statusSyncTypes';
import { UserCollection, Subject } from '../../common/api/types';

async function setup(count=1) {
 const vault=new InMemoryVault(); const client=new BangumiClient();
 const episodes=new EpisodeStatusManager(vault.app,client);
 const service=new StatusSyncService(vault.app,client,new SubjectDocumentService(vault.app,episodes),episodes);
 const collections=Array.from({length:count},(_,i)=>({subject_id:i+1,subject_type:2,type:2,rate:8,comment:'',tags:[],private:false,ep_status:0,vol_status:0,updated_at:'',subject:{id:i+1,type:2,name:'Fixture',name_cn:''}} as unknown as UserCollection));
 const files=collections.map(c=>vault.addFile(`${c.subject_id}.md`,`---\nid: ${c.subject_id}\n评分: 6\n总集数: 1\n---\nBody`));
 const remote=new Map(collections.map(c=>[c.subject_id,structuredClone(c)]));
 const read=vi.spyOn(client,'getCollectionStatus').mockImplementation(id=>Promise.resolve(remote.get(id)??null));
 const write=vi.spyOn(client,'updateCollection').mockResolvedValue();
 const selection=createDefaultStatusSyncFieldSelection();
 selection.user.episodeStatus=selection.user.comment=selection.user.status=selection.user.tags=false;
 const prepare=()=>service.buildDiffSession({selection,collections,localSubjects:new Map(files.map((f,i)=>[i+1,{id:i+1,path:f.path,name_cn:'Fixture'}]))});
 const {diffs}=await prepare(); diffs.forEach(d=>{d.rate.decision='cloud';});
 return {vault,client,service,episodes,remote,read,write,selection,prepare,diffs,files};
}

describe('ordinary status sync preflight',()=>{
 it.each(['cloud','local'] as const)('rejects stale collection before any %s write',async decision=>{
  const {service,remote,diffs,vault,write}=await setup(2);const before=new Map(vault.contents);
  diffs.forEach(d=>{d.rate.decision=decision;});remote.get(2)!.rate=9;
  await expect(service.executeSync(diffs)).rejects.toThrow('Cloud collection changed');
  expect(vault.contents).toEqual(before);expect(write).not.toHaveBeenCalled();
 });
 it.each([null,new Error('429')])('rejects unreadable collections before any mutation',async unavailable=>{
  const {service,diffs,read,write,vault}=await setup();const before=new Map(vault.contents);
  if(unavailable instanceof Error) read.mockRejectedValue(unavailable);else read.mockResolvedValue(null);
  await expect(service.executeSync(diffs)).rejects.toThrow();expect(write).not.toHaveBeenCalled();expect(vault.contents).toEqual(before);
 });
 it.each(['cloud','local'] as const)('executes unchanged previews in the %s direction',async decision=>{
  const {service,diffs,read,write,vault,files}=await setup();diffs[0].rate.decision=decision;
  expect(await service.executeSync(diffs)).toEqual({successCount:1,failCount:0});
  expect(read).toHaveBeenCalledTimes(1);
  if(decision==='cloud') {expect(vault.contents.get(files[0].path)).toContain('评分: 8');expect(write).not.toHaveBeenCalled();}
  else expect(write).toHaveBeenCalledWith(1,{rate:6});
 });
 it('never reads skipped targets and bounds selected collection requests to three',async()=>{
  const {service,diffs,read,remote}=await setup(9);diffs[8].rate.decision='skip';
  let active=0,peak=0;
  read.mockImplementation(async id=>{active++;peak=Math.max(peak,active);await delay(5);active--;return remote.get(id)!;});
  expect(await service.executeSync(diffs)).toEqual({successCount:8,failCount:0});
  expect(read).toHaveBeenCalledTimes(8);expect(read).not.toHaveBeenCalledWith(9);expect(peak).toBe(3);
 });
 it('refuses account changes since preview without using the new account',async()=>{
  const {client,service,diffs,read,write}=await setup();client.setAccessToken('synthetic-test-account');
  await expect(service.executeSync(diffs)).rejects.toThrow('Account changed');expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
 });
 it('freezes field choices while preflight is awaiting network responses',async()=>{
  const {service,diffs,read,remote,write,vault,files}=await setup();
  read.mockImplementation(id=>{diffs[0].rate.decision='local';return Promise.resolve(remote.get(id)!);});
  await service.executeSync(diffs);expect(write).not.toHaveBeenCalled();expect(vault.contents.get(files[0].path)).toContain('评分: 8');
 });
 it('rejects full episode changes beyond a truncated display summary',async()=>{
  const {service,episodes,prepare,selection,client,write}=await setup(); selection.user.episodeStatus=true;
  const cloud=new Map(Array.from({length:10},(_,i)=>[i+1,{episodeId:i+1,epNumber:i+1,status:2 as const,updatedAt:0}]));
  vi.spyOn(episodes,'getCloudEpisodeStatusMap').mockImplementation(()=>Promise.resolve(new Map(cloud)));
  const pull=vi.spyOn(client,'getUserEpisodeStatus');
  const session=await prepare();await service.loadBackgroundDiffs(selection,session.snapshots,{isDisposed:()=>false,updateBackgroundProgress:()=>undefined,updateDiff:(_id,patch)=>Object.assign(session.diffs[0],patch)});
  session.diffs[0].episodeStatus.decision='cloud';cloud.delete(10);
  await expect(service.executeSync(session.diffs)).rejects.toThrow('Cloud episode status changed');expect(write).not.toHaveBeenCalled();expect(pull).not.toHaveBeenCalled();
 });
 it.each(['platform','catalog'] as const)('rejects changed %s before selected platform writes',async kind=>{
  const {service,prepare,selection,client,vault}=await setup();selection.platform.episodeCount=true;
  const subject={type:2,eps:12,total_episodes:12,infobox:[],platform:'TV'} as unknown as Subject;
  const readSubject=vi.spyOn(client,'getSubject').mockResolvedValue(subject);
  const catalog=vi.spyOn(client,'getEpisodes').mockResolvedValue({data:[{id:20,ep:1,sort:1}],total:1,offset:0,limit:1} as Awaited<ReturnType<BangumiClient['getEpisodes']>>);
  const session=await prepare();await service.loadBackgroundDiffs(selection,session.snapshots,{isDisposed:()=>false,updateBackgroundProgress:()=>undefined,updateDiff:(_id,patch)=>Object.assign(session.diffs[0],patch)});
  const d=session.diffs[0];d.hasAnyDiff=d.hasPlatformDiff=true;d.platformFields.forEach(f=>{f.decision='cloud';});
  if(kind==='platform') readSubject.mockResolvedValue({...subject,eps:13,total_episodes:13});else catalog.mockResolvedValue({data:[{id:21,ep:1,sort:1}],total:1,offset:0,limit:1} as Awaited<ReturnType<BangumiClient['getEpisodes']>>);
  const before=new Map(vault.contents);await expect(service.executeSync(session.diffs)).rejects.toThrow('changed');expect(vault.contents).toEqual(before);
 });
});
