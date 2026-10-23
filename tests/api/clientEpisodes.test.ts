import { beforeEach, describe, it, expect, vi } from 'vitest';
const {requestUrl}=vi.hoisted(()=>({requestUrl:vi.fn()}));
vi.mock('obsidian',()=>({requestUrl}));
import {BangumiClient} from '../../src/api/client';
beforeEach(()=>requestUrl.mockReset());
const page=(ids:number[],total:number)=>({status:200,json:{data:ids.map(id=>({id})),total}});
describe('complete episode snapshots',()=>{
 it('retrieves all pages including short intermediate pages',async()=>{
  requestUrl.mockResolvedValueOnce(page([1,2],3)).mockResolvedValueOnce(page([3],3));
  const result=await new BangumiClient().getEpisodes(1);expect(result.data.map(e=>e.id)).toEqual([1,2,3]);
  expect((requestUrl.mock.calls[1][0] as {url:string}).url).toContain('offset=2');
 });
 it.each(['empty','duplicate','total'])('rejects %s pages rather than exposing a partial snapshot',async kind=>{
  requestUrl.mockResolvedValueOnce(page([1],2)).mockResolvedValueOnce(kind==='empty'?page([],2):kind==='duplicate'?page([1],2):page([2],3));
  await expect(new BangumiClient().getEpisodes(1)).rejects.toThrow('Incomplete episode snapshot');
 });
 it('sends explicit clears for ratings and comments',async()=>{
  requestUrl.mockResolvedValue({status:200,json:{}});await new BangumiClient('fixture').updateCollection(1,{rate:0,comment:''});
  expect(JSON.parse((requestUrl.mock.calls[0][0] as {body:string}).body)).toMatchObject({rate:0,comment:''});
 });
});
it('loads more than 100 episodes without truncation', async () => {
 const ids=Array.from({length:251},(_,i)=>i+1);
 requestUrl.mockResolvedValueOnce(page(ids.slice(0,100),251)).mockResolvedValueOnce(page(ids.slice(100,200),251)).mockResolvedValueOnce(page(ids.slice(200),251));
 expect((await new BangumiClient().getEpisodes(1)).data).toHaveLength(251);
 expect(requestUrl).toHaveBeenCalledTimes(3);
});
it('does not return a first-page snapshot after a later HTTP failure', async () => {
 requestUrl.mockResolvedValueOnce(page([1],2)).mockResolvedValueOnce({status:401,json:{title:'Unauthorized'}});
 await expect(new BangumiClient().getEpisodes(1)).rejects.toThrow('401');
});
