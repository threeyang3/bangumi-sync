import { afterEach, describe, expect, it, vi } from 'vitest';
const { opened } = vi.hoisted(() => ({ opened: [] as unknown[] }));
vi.mock('obsidian', async original => {
 class Base { constructor(public app?: unknown) {} open() { opened.push(this); } close() {} }
 return { ...await original<Record<string, unknown>>(), Modal: Base, Plugin: Base, PluginSettingTab: Base, FuzzySuggestModal: Base };
});
import BangumiPlugin from '../../main';
import { ControlPanel } from '../../src/panel/controlPanel';
import { SearchModal } from '../../src/ui/searchModal';
import { SyncModal } from '../../src/ui/syncModal';
import { InMemoryVault } from '../mocks/inMemoryVault';
import type { BangumiPluginSettings } from '../../src/settings/settings';
import type { SettingsPatch } from '../../src/settings/settingsPatch';
import type { SubjectDocumentService } from '../../src/document/subjectDocumentService';
import { DEFAULT_SETTINGS } from '../../src/settings/settings';
import { SettingsPersistenceCoordinator } from '../../src/settings/settingsLifecycle';
import { setWriteOperationGuard } from '../../src/sync/writeOperationGate';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setWriteOperationGuard(null); opened.length = 0; });
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return {promise,resolve}; }
type Mock = ReturnType<typeof vi.fn>;
interface PanelProbe {
 deleteSelected(): void; syncSelected(overwrite: boolean): Promise<void>;
 documentService: SubjectDocumentService; renderTable: Mock; settings: {syncConcurrency:number}; actions: Record<string, never>;
 collectLocalPropertyValues: Mock;
 syncManager: {syncByCollections:Mock;getScanRoot:()=>string;subscribeRecoveryState:Mock;commitPendingBatch:Mock;rollbackBatch:Mock};
 incrementalSync: {scanLocalFolder:Mock;getSyncedIds:()=>Set<number>};
}
interface PluginProbe {
 settings: BangumiPluginSettings; saveData: Mock; buildSyncManagerConfig: Mock;
 applySettingsChanges(patch: SettingsPatch): Promise<unknown>; saveSettings(): Promise<void>; autoSyncIntervalId: number | null;
}
function panel(vault: InMemoryVault) {
 return Object.assign(Object.create(ControlPanel.prototype) as object, { app: vault.app, state: { selectedIds:new Set([1]), collections:[{subject_id:1}], localSubjects:new Map([[1,{path:'one.md'}]]) },
  renderStatus:vi.fn(), renderTable:vi.fn(), renderActionBar:vi.fn(), renderPagination:vi.fn(), loadData:vi.fn().mockResolvedValue(undefined),
 }) as unknown as PanelProbe;
}
describe('audit real UI controllers', () => {
 it.each(['identity','gate'])('rechecks deletion after confirmation opens: %s', async mode => {
  const vault = new InMemoryVault(); vault.addFile('one.md','---\nid: 1\n---\noriginal'); const control = panel(vault);
  const {SubjectDocumentService} = await import('../../src/document/subjectDocumentService'); control.documentService = new SubjectDocumentService(vault.app);
  control.deleteSelected();
  if (mode === 'identity') vault.contents.set('one.md','---\nid: 999\n---\nreplacement');
  else setWriteOperationGuard(() => { throw new Error('blocked'); });
  (opened[0] as {onConfirm:()=>void}).onConfirm();
  await vi.waitFor(() => expect(control.renderTable).toHaveBeenCalled());
  expect(vault.files.has('one.md')).toBe(true); expect(vault.trashed).toEqual([]);
 });
 it('provides working keep and rollback handlers for selected partial imports', async () => {
  const vault = new InMemoryVault(); const control = panel(vault); control.settings = {syncConcurrency:1}; control.actions = {};
  control.collectLocalPropertyValues = vi.fn().mockResolvedValue({propertyValuesBySubjectId:new Map()});
  control.syncManager = {syncByCollections:vi.fn().mockResolvedValue({completion:'partial-success',canRollback:true,added:1,errors:1}),getScanRoot:()=>'',subscribeRecoveryState:vi.fn(),commitPendingBatch:vi.fn().mockResolvedValue({status:'committed'}),rollbackBatch:vi.fn().mockResolvedValue({status:'rolled-back'})};
  control.incrementalSync={scanLocalFolder:vi.fn().mockResolvedValue(undefined),getSyncedIds:()=>new Set()};
  vi.spyOn(SyncModal.prototype,'showCompleted').mockImplementation(() => undefined);
  await control.syncSelected(true);
  const completion = opened.find(x=>x instanceof SyncModal) as unknown as {onCommitted:()=>Promise<unknown>;onCancelled:()=>Promise<unknown>};
  expect(completion).toBeDefined(); await completion.onCommitted(); await completion.onCancelled();
  expect(control.syncManager.commitPendingBatch).toHaveBeenCalledOnce(); expect(control.syncManager.rollbackBatch).toHaveBeenCalledOnce();
 });
 it('finds renamed notes by ID and rejects same-title different IDs', async () => {
  const vault = new InMemoryVault(); vault.addFile('ACGN/renamed.md','---\nid: 1\n---\n'); vault.addFile('ACGN/same-title.md','---\nid: 2\n---\n');
  const modal = Object.assign(Object.create(SearchModal.prototype) as object,{app:vault.app,syncManager:{getScanRoot:()=> 'ACGN'}}) as unknown as {checkLocalSyncStatus(subject:{id:number;name:string}):Promise<string|null>};
  expect(await modal.checkLocalSyncStatus({id:1,name:'same-title'})).toBe('ACGN/renamed.md');
  expect(await modal.checkLocalSyncStatus({id:3,name:'same-title'})).toBeNull();
 });
});
describe('audit settings production methods', () => {
 function plugin() { return Object.assign(Object.create(BangumiPlugin.prototype) as object, {settings:JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as BangumiPluginSettings,settingsPersistence:new SettingsPersistenceCoordinator(),saveData:vi.fn().mockResolvedValue(undefined),syncManager:null,appliedSyncConfig:null,autoSyncIntervalId:null}) as unknown as PluginProbe; }
 it('does not enqueue a stale full settings snapshot behind an apply', async () => {
  const p=plugin(); const gate=deferred(); let disk: unknown;
  p.saveData=vi.fn(async (value:unknown) => { if (p.saveData.mock.calls.length===1) await gate.promise; disk=structuredClone(value); });
  p.buildSyncManagerConfig=vi.fn().mockResolvedValue({});
  const applied=p.applySettingsChanges({changedFields:['accessToken'],values:{accessToken:'new-fixture'}});
  await vi.waitFor(()=>expect(p.saveData).toHaveBeenCalledOnce());
  const queued=p.saveSettings(); gate.resolve(); await Promise.all([applied,queued]);
  expect(disk).toMatchObject({accessToken:'new-fixture'}); expect(p.settings.accessToken).toBe('new-fixture');
 });
 it('starts, replaces and stops the timer after successful settings saves', async () => {
  const p=plugin(); const setInterval=vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(11); const clearInterval=vi.fn();
  vi.stubGlobal('activeWindow',{setInterval,clearInterval}); p.buildSyncManagerConfig=vi.fn().mockResolvedValue({});
  await p.applySettingsChanges({changedFields:['autoSync','autoSyncInterval'],values:{autoSync:true,autoSyncInterval:2}});
  expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function),120000);
  await p.applySettingsChanges({changedFields:['autoSyncInterval'],values:{autoSyncInterval:3}});
  expect(clearInterval).toHaveBeenCalledWith(10); expect(setInterval).toHaveBeenLastCalledWith(expect.any(Function),180000);
  await p.applySettingsChanges({changedFields:['autoSync'],values:{autoSync:false}});
  expect(clearInterval).toHaveBeenCalledWith(11); expect(p.autoSyncIntervalId).toBeNull(); expect(setInterval).toHaveBeenCalledTimes(2);
 });
});
