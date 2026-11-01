import { describe, expect, it } from 'vitest';
import { applyNamedPropertyValuesToContent } from '../../src/template/contentTemplate';
import { UserDataMerger } from '../../src/userData/userDataMerger';
import { InMemoryVault } from '../mocks/inMemoryVault';

describe('custom property round trip', () => {
 it.each(['\n','\r\n'])('preserves empty field boundaries with %j', eol => {
  const original = ['---','id: 10','剧情评分:','资源属性: []','已购: false','末尾:','---','# Body'].join(eol);
  const updated = applyNamedPropertyValuesToContent(original, { '剧情评分': '8', '末尾': 'done' });
  expect(updated).toContain('资源属性: []'); expect(updated).toContain('已购: false');
  expect(updated.replace(/\r\n/g,'\n')).toContain('末尾: done\n---\n# Body');
 });
 it('preserves false, zero, empty lists and empty strings over defaults', () => {
  const merger = new UserDataMerger(new InMemoryVault().app);
  const result = merger.mergeCustomProperties('---\nid: 1\nflag: true\nscore: 8\nlist: [default]\ntext: default\n---\n', {flag:false,score:0,list:[],text:''});
  expect(result).toContain('flag: false'); expect(result).toContain('score: 0'); expect(result).toContain('list: []'); expect(result).toContain('text: ""');
 });
});
