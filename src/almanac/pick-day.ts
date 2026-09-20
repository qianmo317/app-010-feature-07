import { scoreDay, getDayYiJi } from './yiji';
import { solarToLunar } from './lunar';
import { gregorianToJDN, jdnToGregorian } from '../utils/date';
import { SHENG_XIAO } from './constants';

// 具名避讳对象（家人清单中被勾选的人）
export interface AvoidPerson {
  name: string;
  shengxiao: string;
}

export interface PickResult {
  year: number;
  month: number;
  day: number;
  score: number;
  yi: string[];
  ji: string[];
  ganZhi: string;
  chong: string;
  reason: string;
  /** 是否因冲犯避讳被排除 */
  excluded: boolean;
  /** 冲犯了谁，如 ['爸爸（属鼠）']，未排除时为空 */
  excludedBy: string[];
}

interface AvoidEntry {
  shengxiao: string;
  label: string;
}

export function pickDays(
  startYear: number, startMonth: number, startDay: number,
  endYear: number, endMonth: number, endDay: number,
  events: string[],
  avoidShengxiao: string[] = [],
  avoidPeople: AvoidPerson[] = []
): PickResult[] {
  const startJdn = gregorianToJDN(startYear, startMonth, startDay);
  const endJdn = gregorianToJDN(endYear, endMonth, endDay);
  const results: PickResult[] = [];

  // 统一避讳条目：纯生肖 + 具名家人，非法生肖直接忽略
  const avoidEntries: AvoidEntry[] = [
    ...avoidShengxiao.map(sx => ({ shengxiao: sx, label: `属${sx}之人` })),
    ...avoidPeople.map(p => ({ shengxiao: p.shengxiao, label: `${p.name}（属${p.shengxiao}）` }))
  ].filter(e => SHENG_XIAO.includes(e.shengxiao));

  for (let jdn = startJdn; jdn <= endJdn; jdn++) {
    const [year, month, day] = jdnToGregorian(jdn);
    // 分数只反映日子本身吉凶；避讳不再暗扣分，而是明确排除并注明原因
    const score = scoreDay(year, month, day, events);
    const yiJi = getDayYiJi(year, month, day);
    const lunar = solarToLunar(year, month, day);

    const excludedBy = avoidEntries
      .filter(e => e.shengxiao === yiJi.chongShengxiao)
      .map(e => e.label);
    const excluded = excludedBy.length > 0;

    // 生成推荐理由
    const reasons: string[] = [];
    if (excluded) {
      reasons.push(`冲${excludedBy.join('、')}，已排除`);
    } else {
      if (score >= 80) reasons.push('大吉之日');
      else if (score >= 60) reasons.push('吉日');

      for (const event of events) {
        if (yiJi.yi.some(y => event.includes(y) || y.includes(event))) {
          reasons.push(`宜${event}`);
        }
      }
    }

    results.push({
      year, month, day,
      score,
      yi: yiJi.yi,
      ji: yiJi.ji,
      ganZhi: lunar.dayGanZhi,
      chong: yiJi.chong,
      reason: reasons.join('；') || '平日常日',
      excluded,
      excludedBy
    });
  }

  // 按分数排序
  return results.sort((a, b) => b.score - a.score);
}

// 择日结果分类：被排除的日期单独归组，不与低分日期混淆
export function categorizeResults(results: PickResult[]): {
  best: PickResult[];
  good: PickResult[];
  normal: PickResult[];
  bad: PickResult[];
  excluded: PickResult[];
} {
  const active = results.filter(r => !r.excluded);
  return {
    best: active.filter(r => r.score >= 80),
    good: active.filter(r => r.score >= 60 && r.score < 80),
    normal: active.filter(r => r.score >= 40 && r.score < 60),
    bad: active.filter(r => r.score < 40),
    // 排除清单按日期升序，便于顺着日历查看
    excluded: results
      .filter(r => r.excluded)
      .sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day)
  };
}
