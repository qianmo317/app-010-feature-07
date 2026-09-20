import { describe, it, expect, beforeEach } from 'vitest';
import { MemberStore } from './people';

// 简易内存 Storage
function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (key: string) => map.has(key) ? map.get(key)! : null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => { map.delete(key); },
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

describe('家人档案', () => {
  let storage: Storage;
  let store: MemberStore;

  beforeEach(() => {
    storage = createMemoryStorage();
    store = new MemberStore(storage);
  });

  it('可添加家人并默认启用勾选', () => {
    const result = store.add('爸爸', '鼠');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.member.name).toBe('爸爸');
      expect(result.member.shengxiao).toBe('鼠');
      expect(result.member.active).toBe(true);
      expect(result.member.selected).toBe(true);
    }
    expect(store.list()).toHaveLength(1);
  });

  it('称呼为空或超长时应拒绝', () => {
    expect(store.add('   ', '鼠').ok).toBe(false);
    expect(store.add('一'.repeat(13), '鼠').ok).toBe(false);
    expect(store.list()).toHaveLength(0);
  });

  it('属相非法时应拒绝', () => {
    expect(store.add('爸爸', '猫').ok).toBe(false);
    expect(store.list()).toHaveLength(0);
  });

  it('称呼不能重复（去除首尾空格后比较）', () => {
    expect(store.add('爸爸', '鼠').ok).toBe(true);
    const dup = store.add('  爸爸 ', '马');
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toContain('爸爸');
  });

  it('可修改属相', () => {
    const { member } = store.add('爸爸', '鼠') as { ok: true; member: { id: string } };
    expect(store.update(member.id, { shengxiao: '牛' })).toBe(true);
    expect(store.list()[0].shengxiao).toBe('牛');
    // 改成非法属相应失败且保持原值
    expect(store.update(member.id, { shengxiao: '猫' })).toBe(false);
    expect(store.list()[0].shengxiao).toBe('牛');
  });

  it('可停用家人，停用后不参与择日且保留数据', () => {
    const { member } = store.add('爷爷', '虎') as { ok: true; member: { id: string } };
    store.update(member.id, { active: false });
    expect(store.list()[0].active).toBe(false);
    expect(store.selectedMembers()).toHaveLength(0);

    // 重新启用后恢复参与
    store.update(member.id, { active: true, selected: true });
    expect(store.selectedMembers()).toHaveLength(1);
  });

  it('可删除家人', () => {
    const { member } = store.add('爷爷', '虎') as { ok: true; member: { id: string } };
    store.remove(member.id);
    expect(store.list()).toHaveLength(0);
  });

  it('批量勾选只影响启用中的家人', () => {
    const a = store.add('爸爸', '鼠') as { ok: true; member: { id: string } };
    store.add('妈妈', '马');
    store.update(a.member.id, { active: false });
    store.setSelectedForActive(false);
    expect(store.selectedMembers()).toHaveLength(0);
    // 停用者状态不影响结果，但数据还在
    expect(store.list()).toHaveLength(2);
  });

  it('数据持久化到 storage，新实例可恢复', () => {
    store.add('爸爸', '鼠');
    store.add('妈妈', '马');
    const reloaded = new MemberStore(storage);
    expect(reloaded.list().map(m => m.name).sort()).toEqual(['妈妈', '爸爸']);
    expect(reloaded.selectedMembers()).toHaveLength(2);
  });

  it('storage 数据损坏时安全降级为空列表', () => {
    storage.setItem('almanac.family.v1', '{不是json');
    const broken = new MemberStore(storage);
    expect(broken.list()).toHaveLength(0);
  });

  it('可导出并通过备份恢复', () => {
    store.add('爸爸', '鼠');
    store.add('妈妈', '马');
    const backup = store.exportJSON();

    const other = new MemberStore(createMemoryStorage());
    const count = other.importJSON(backup);
    expect(count).toBe(2);
    expect(other.list()).toHaveLength(2);
  });

  it('导入非法内容应报错且不覆盖原数据', () => {
    store.add('爸爸', '鼠');
    expect(() => store.importJSON('not json')).toThrow();
    expect(() => store.importJSON(JSON.stringify([{ name: 'x', shengxiao: '猫' }]))).toThrow();
    expect(store.list()).toHaveLength(1);
  });

  it('纯内存模式（无 storage）下增删改不报错', () => {
    const mem = new MemberStore(null);
    expect(mem.add('爸爸', '鼠').ok).toBe(true);
    expect(mem.selectedMembers()).toHaveLength(1);
    expect(mem.exportJSON()).toContain('爸爸');
  });
});
