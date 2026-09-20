import { describe, it, expect } from 'vitest';
import { pickDays, categorizeResults } from './pick-day';
import { MemberStore } from '../data/people';

describe('择日算法', () => {
  it('应在规定时间内完成3年区间计算', () => {
    const start = performance.now();
    const results = pickDays(2024, 1, 1, 2026, 12, 31, ['嫁娶', '搬家']);
    const end = performance.now();

    expect(results.length).toBeGreaterThan(0);
    expect(end - start).toBeLessThan(300); // < 300ms
  });

  it('应按分数排序，且被排除的日子排在最后', () => {
    const results = pickDays(2024, 1, 1, 2024, 1, 31, ['嫁娶']);
    const firstExcluded = results.findIndex(r => r.excluded);
    if (firstExcluded >= 0) {
      expect(results.slice(firstExcluded).every(r => r.excluded)).toBe(true);
    }
    const viable = results.filter(r => !r.excluded);
    for (let i = 1; i < viable.length; i++) {
      expect(viable[i].score).toBeLessThanOrEqual(viable[i - 1].score);
    }
  });

  it('应正确分类结果', () => {
    const results = pickDays(2024, 1, 1, 2024, 3, 31, ['嫁娶']);
    const { best, good, normal, bad, excluded } = categorizeResults(results);
    expect(best.length + good.length + normal.length + bad.length + excluded.length).toBe(results.length);
  });

  it('应处理避讳生肖（兼容旧的字符串数组入参）', () => {
    const results = pickDays(2024, 1, 1, 2024, 1, 31, ['嫁娶'], ['鼠', '马']);
    expect(results.length).toBe(31);
    for (const r of results) {
      if (r.excluded) {
        expect(['鼠', '马']).toContain(r.chongShengxiao);
      }
    }
  });

  it('命中避讳时应硬排除并写明冲了谁', () => {
    // 2024-01-01 ~ 31 中必存在冲鼠或冲马的日子
    const results = pickDays(2024, 1, 1, 2024, 1, 31, ['嫁娶'], [
      { name: '爸爸', shengxiao: '鼠' },
      { name: '舅舅', shengxiao: '马' },
    ]);
    const excluded = results.filter(r => r.excluded);
    expect(excluded.length).toBeGreaterThan(0);
    for (const r of excluded) {
      expect(['鼠', '马']).toContain(r.chongShengxiao);
      expect(r.excludedReasons.length).toBeGreaterThan(0);
      expect(r.excludedReasons[0]).toContain('冲了');
    }
    // 被排除的日子不应出现在吉/凶等正常分组里
    const cats = categorizeResults(results);
    expect([...cats.best, ...cats.good, ...cats.normal, ...cats.bad].some(r => r.excluded)).toBe(false);
  });

  it('同一属相的多个家人应在原因中全部列出', () => {
    const results = pickDays(2024, 1, 1, 2024, 12, 31, ['嫁娶'], [
      { name: '爸爸', shengxiao: '鼠' },
      { name: '奶奶', shengxiao: '鼠' },
    ]);
    const chongShu = results.filter(r => r.excluded && r.chongShengxiao === '鼠');
    expect(chongShu.length).toBeGreaterThan(0);
    expect(chongShu[0].excludedReasons[0]).toContain('爸爸');
    expect(chongShu[0].excludedReasons[0]).toContain('奶奶');
  });

  it('停用或未勾选的家人不应参与排除', () => {
    const store = new MemberStore(null);
    const added = store.add('爸爸', '鼠');
    expect(added.ok).toBe(true);
    store.update((added as { member: { id: string } }).member.id, { selected: false });
    store.add('妈妈', '马');

    const results = pickDays(2024, 1, 1, 2024, 12, 31, ['嫁娶'], store.selectedMembers());
    // 只避讳马，冲鼠的日子不能被排除
    expect(results.some(r => r.excluded && r.chongShengxiao === '鼠')).toBe(false);
    expect(results.some(r => r.excluded && r.chongShengxiao === '马')).toBe(true);
  });

  it('没有避讳时不应排除任何日子', () => {
    const results = pickDays(2024, 1, 1, 2024, 6, 30, ['嫁娶']);
    expect(results.every(r => !r.excluded)).toBe(true);
    expect(categorizeResults(results).excluded).toHaveLength(0);
  });
});
