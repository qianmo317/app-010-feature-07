import { describe, it, expect } from 'vitest';
import { pickDays, categorizeResults } from './pick-day';
import { getDayYiJi } from './yiji';

describe('择日算法', () => {
  it('应在规定时间内完成3年区间计算', () => {
    const start = performance.now();
    const results = pickDays(2024, 1, 1, 2026, 12, 31, ['嫁娶', '搬家']);
    const end = performance.now();

    expect(results.length).toBeGreaterThan(0);
    expect(end - start).toBeLessThan(300); // < 300ms
  });

  it('应按分数排序', () => {
    const results = pickDays(2024, 1, 1, 2024, 1, 31, ['嫁娶']);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('应正确分类结果', () => {
    const results = pickDays(2024, 1, 1, 2024, 3, 31, ['嫁娶']);
    const { best, good, normal, bad, excluded } = categorizeResults(results);
    expect(best.length + good.length + normal.length + bad.length + excluded.length).toBe(results.length);
  });

  it('应处理避讳生肖', () => {
    const results = pickDays(2024, 1, 1, 2024, 1, 31, ['嫁娶'], ['鼠', '马']);
    expect(results.length).toBe(31);
  });
});

describe('避讳排除', () => {
  it('冲犯家人的日期应被标记排除并注明冲了谁', () => {
    const results = pickDays(2024, 1, 1, 2024, 3, 31, ['嫁娶'], [], [{ name: '爸爸', shengxiao: '鼠' }]);
    const excluded = results.filter(r => r.excluded);

    // 三个月内必有冲鼠的日子
    expect(excluded.length).toBeGreaterThan(0);

    for (const r of excluded) {
      // 注明冲了谁
      expect(r.excludedBy).toContain('爸爸（属鼠）');
      expect(r.reason).toContain('冲爸爸（属鼠）');
      expect(r.reason).toContain('已排除');
      // 被排除的日期确实冲鼠
      expect(getDayYiJi(r.year, r.month, r.day).chongShengxiao).toBe('鼠');
    }
  });

  it('未冲犯的日期不应被排除', () => {
    const results = pickDays(2024, 1, 1, 2024, 3, 31, ['嫁娶'], [], [{ name: '爸爸', shengxiao: '鼠' }]);
    const kept = results.filter(r => !r.excluded);
    expect(kept.length).toBeGreaterThan(0);
    for (const r of kept) {
      expect(getDayYiJi(r.year, r.month, r.day).chongShengxiao).not.toBe('鼠');
      expect(r.excludedBy).toEqual([]);
    }
  });

  it('排除不再暗扣分：被排除日期保留日子本身的分数', () => {
    const withAvoid = pickDays(2024, 1, 1, 2024, 3, 31, ['嫁娶'], [], [{ name: '爸爸', shengxiao: '鼠' }]);
    const withoutAvoid = pickDays(2024, 1, 1, 2024, 3, 31, ['嫁娶']);
    const key = (r: { year: number; month: number; day: number }) => `${r.year}-${r.month}-${r.day}`;
    const baseScores = new Map(withoutAvoid.map(r => [key(r), r.score]));
    for (const r of withAvoid) {
      expect(r.score).toBe(baseScores.get(key(r)));
    }
  });

  it('被排除的日期应单独分类，不混入吉凶分组', () => {
    const results = pickDays(2024, 1, 1, 2024, 3, 31, ['嫁娶'], [], [{ name: '爸爸', shengxiao: '鼠' }]);
    const { best, good, normal, bad, excluded } = categorizeResults(results);

    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded.every(r => r.excluded)).toBe(true);
    expect([...best, ...good, ...normal, ...bad].every(r => !r.excluded)).toBe(true);
    expect(best.length + good.length + normal.length + bad.length + excluded.length).toBe(results.length);

    // 排除清单按日期升序
    for (let i = 1; i < excluded.length; i++) {
      const prev = excluded[i - 1];
      const curr = excluded[i];
      const prevTime = new Date(prev.year, prev.month - 1, prev.day).getTime();
      const currTime = new Date(curr.year, curr.month - 1, curr.day).getTime();
      expect(currTime).toBeGreaterThan(prevTime);
    }
  });

  it('多位家人同时避讳时应分别注明', () => {
    const results = pickDays(2024, 1, 1, 2024, 6, 30, ['嫁娶'], [], [
      { name: '爸爸', shengxiao: '鼠' },
      { name: '妈妈', shengxiao: '马' }
    ]);
    const excluded = results.filter(r => r.excluded);
    const labels = new Set(excluded.flatMap(r => r.excludedBy));
    expect(labels.has('爸爸（属鼠）')).toBe(true);
    expect(labels.has('妈妈（属马）')).toBe(true);
  });

  it('纯生肖避讳与具名家人可同时使用', () => {
    const results = pickDays(2024, 1, 1, 2024, 6, 30, ['嫁娶'], ['马'], [{ name: '爸爸', shengxiao: '鼠' }]);
    const excluded = results.filter(r => r.excluded);
    const labels = new Set(excluded.flatMap(r => r.excludedBy));
    expect(labels.has('爸爸（属鼠）')).toBe(true);
    expect(labels.has('属马之人')).toBe(true);
  });

  it('非法生肖条目应被忽略', () => {
    const results = pickDays(2024, 1, 1, 2024, 1, 31, ['嫁娶'], ['猫'], [{ name: '某人', shengxiao: 'x' }]);
    expect(results.every(r => !r.excluded)).toBe(true);
  });
});
