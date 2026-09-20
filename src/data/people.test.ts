import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPeople, savePeople, addPerson, updatePerson,
  setPersonEnabled, removePerson, loadCheckedIds, saveCheckedIds
} from './people';

describe('家人清单', () => {
  beforeEach(() => {
    savePeople([]);
    saveCheckedIds([]);
  });

  it('应能添加并读取家人，默认启用', () => {
    addPerson('爸爸', '鼠');
    const people = loadPeople();
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe('爸爸');
    expect(people[0].shengxiao).toBe('鼠');
    expect(people[0].enabled).toBe(true);
  });

  it('添加数据应持久保存，重新读取仍在', () => {
    addPerson('妈妈', '马');
    addPerson('爷爷', '龙');
    expect(loadPeople().map(p => p.name)).toEqual(['妈妈', '爷爷']);
  });

  it('空称呼应报错提示', () => {
    expect(() => addPerson('', '鼠')).toThrow('请填写称呼');
    expect(() => addPerson('   ', '鼠')).toThrow('请填写称呼');
  });

  it('非法属相应报错提示', () => {
    expect(() => addPerson('爸爸', '猫')).toThrow('请选择正确的属相');
    expect(() => addPerson('爸爸', '')).toThrow('请选择正确的属相');
  });

  it('重复添加同称呼同属相应报错提示', () => {
    addPerson('爸爸', '鼠');
    expect(() => addPerson('爸爸', '鼠')).toThrow('已在清单中');
    // 同称呼不同属相允许（可能是录入修正前的另一个人）
    expect(() => addPerson('爸爸', '牛')).not.toThrow();
  });

  it('应能修改属相', () => {
    const p = addPerson('妈妈', '马');
    updatePerson(p.id, { shengxiao: '羊' });
    expect(loadPeople()[0].shengxiao).toBe('羊');
    expect(() => updatePerson(p.id, { shengxiao: '猫' })).toThrow('请选择正确的属相');
    // 修改失败不应破坏原数据
    expect(loadPeople()[0].shengxiao).toBe('羊');
  });

  it('应能停用与启用', () => {
    const p = addPerson('爷爷', '龙');
    setPersonEnabled(p.id, false);
    expect(loadPeople()[0].enabled).toBe(false);
    setPersonEnabled(p.id, true);
    expect(loadPeople()[0].enabled).toBe(true);
  });

  it('应能删除家人', () => {
    const p1 = addPerson('奶奶', '兔');
    addPerson('外公', '猴');
    removePerson(p1.id);
    const people = loadPeople();
    expect(people).toHaveLength(1);
    expect(people[0].name).toBe('外公');
  });

  it('损坏的存档应回退为空清单而不是崩溃', () => {
    // 模拟浏览器 localStorage 中存了坏数据
    const mock = new Map<string, string>();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => mock.get(k) ?? null,
      setItem: (k: string, v: string) => { mock.set(k, v); },
    };
    mock.set('almanac-family-people', '{bad json');
    try {
      expect(loadPeople()).toEqual([]);
    } finally {
      delete (globalThis as Record<string, unknown>).localStorage;
    }
  });

  it('勾选状态应能保存与读取', () => {
    const p = addPerson('爸爸', '鼠');
    saveCheckedIds([p.id, 'stale-id']);
    expect(loadCheckedIds()).toEqual([p.id, 'stale-id']);
  });
});
