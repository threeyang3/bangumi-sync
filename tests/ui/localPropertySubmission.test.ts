import { describe, expect, it, vi } from 'vitest';

// Only the DOM shell is simulated: construction, initial values, input events,
// confirmation and the full sync pipeline use production implementations.
const { Element } = vi.hoisted(() => {
 class Element {
  children: Element[] = [];
  events = new Map<string, () => void>();
  value = ''; checked = false; placeholder = '';
  constructor(public tag = 'div', public options: {text?:string;type?:string;cls?:string} = {}) {}
  addClass() {}
  empty() { this.children = []; }
  createEl(tag: string, options = {}, callback?: (el: Element) => void): Element {
   const el = new Element(tag, options); this.children.push(el); callback?.(el); return el;
  }
  createDiv(options = {}) { return this.createEl('div', options); }
  addEventListener(event: string, callback: () => void) { this.events.set(event, callback); }
  fire(event: string) { this.events.get(event)?.(); }
  all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
 }
 return {Element};
});
vi.mock('obsidian', async original => ({
 ...await original<Record<string, unknown>>(),
 Modal: class { contentEl = new Element(); modalEl = new Element(); close() {} },
 Setting: class { setName() { return this; } setHeading() { return this; } },
}));
import { LocalPropertyModal, type LocalPropertyModalResult } from '../../src/ui/localPropertyModal';
import { SyncManager } from '../../src/sync/syncManager';
import { SubjectDocumentService } from '../../src/document/subjectDocumentService';
import { SubjectType, type Subject, type UserCollection } from '../../common/api/types';
import { InMemoryVault } from '../mocks/inMemoryVault';

const subject: Subject = {id:1,type:SubjectType.Music,name:'fixture',name_cn:'fixture',summary:'summary',platform:'音乐',images:{},infobox:[],tags:[],rating:{score:0,rank:0,total:0,count:{}},collection:{wish:0,collect:0,doing:0,on_hold:0,dropped:0},nsfw:false,locked:false,series:false,volumes:0,eps:0,total_episodes:0,meta_tags:[]};
const collection = {subject_id:1,subject_type:SubjectType.Music,subject,type:2,tags:[],rate:0,comment:''} as unknown as UserCollection;
const customTemplates = {'__node__:music/main':'---\nid: {{id}}\n已购: false\n渠道: 实体\n备注: default\n清单: []\n---\nrendered'};

async function submitAndSync(existing: boolean, edit?: (root: InstanceType<typeof Element>) => void) {
 const vault = new InMemoryVault();
 if (existing) vault.addFile('ACGN/fixture.md','---\nid: 1\n已购: true\n渠道: 二手\n备注: original\n清单:\n  - old\n---\nbody');
 let submitted: LocalPropertyModalResult | undefined;
 const modal = new LocalPropertyModal(vault.app,[collection],new Map([[1,subject]]),customTemplates,result=>{submitted=result;});
 modal.onOpen();
 const root = modal.contentEl as unknown as InstanceType<typeof Element>;
 // Defaults must still be displayed despite not being explicit overrides.
 expect(root.all().find(el=>el.options.type==='checkbox')?.checked).toBe(false);
 expect(root.all().find(el=>el.value==='实体')).toBeDefined();
 edit?.(root);
 root.all().find(el=>el.tag==='button'&&el.options.cls==='mod-cta')!.fire('click');
 expect(submitted).toBeDefined();
 const manager = new SyncManager(vault.app,{accessToken:'fixture',pathTemplate:'ACGN/{{name_cn}}.md',imagePathTemplate:'assets/{{id}}',downloadImages:false,imageQuality:'large',imageUpdateExisting:false,scanFolderPath:'ACGN',enableRelatedLinks:false,customTemplates});
 manager.client.getFullSubjectInfo=vi.fn().mockResolvedValue({subject,characters:[],relations:[],persons:[]});
 const result=await manager.syncByCollections([collection],{overwrite:true,localPropertyValuesBySubjectId:submitted!.propertyValuesBySubjectId});
 expect(result.success).toBe(true);
 expect(existing ? result.updated : result.created).toBe(1);
 return {submitted:submitted!, fields:new SubjectDocumentService(vault.app).extractFrontmatterRecord(vault.contents.get('ACGN/fixture.md')!)};
}

describe('F01 real property form confirmation to sync', () => {
 it('preserves existing values when the displayed defaults are left untouched',async()=>{
  const {submitted,fields}=await submitAndSync(true);
  expect(submitted.propertyValuesBySubjectId.size).toBe(0);
  expect(fields).toMatchObject({'已购':true,'渠道':'二手'});
 });
 it('submits only changed fields, including an explicit false and cleared values',async()=>{
  const {submitted,fields}=await submitAndSync(true,root=>{
   const toggle=root.all().find(el=>el.options.type==='checkbox')!;
   toggle.checked=true;toggle.fire('change');toggle.checked=false;toggle.fire('change');
   const channel=root.all().find(el=>el.value==='实体')!;channel.value='网购';channel.fire('input');
   for(const label of ['备注','清单']) {
    const field=root.all().find(el=>el.children.some(child=>child.options.text===label))!;
    const input=field.children.find(child=>child.tag==='input')!;input.value='';input.fire('input');
   }
  });
  expect(submitted.propertyValuesBySubjectId.get(1)).toEqual({'已购':false,'渠道':'网购','备注':'','清单':[]});
  expect(fields).toMatchObject({'已购':false,'渠道':'网购','备注':''});
 });
 it('creates a new note with template defaults after untouched confirmation',async()=>{
  const {submitted,fields}=await submitAndSync(false);
  expect(submitted.propertyValuesBySubjectId.size).toBe(0);
  expect(fields).toMatchObject({'已购':false,'渠道':'实体'});
 });
});
