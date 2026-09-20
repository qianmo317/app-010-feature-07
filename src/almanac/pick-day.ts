import { scoreDay, getDayYiJi } from './yiji';
import { solarToLunar } from './lunar';
import { gregorianToJDN, jdnToGregorian } from '../utils/date';
import { FamilyMember } from '../data/people';

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
  chongShengxiao: string; // 当日冲的生肖，如「马」
  excluded: boolean; // 是否因冲避讳生肖而被硬性排除
  excludedReasons: string[]; // 排除原因，如「冲马（冲了妈妈、舅舅）」
  reason: string;
}

export function pickDays(
  startYear: number, startMonth: number, startDay: number,
  endYear: number, endMonth: number, endDay: number,
  events: string[],
  // 兼容旧调用：可直接传生肖字符串数组
  avoid?: string[] | AvoidPerson[] | FamilyMember[]
): PickResult[] {
  // 归一成「生肖 -> 称呼列表」，同名同属相只提示一次
  const avoidByShengxiao = new Map<string, Set<string>>();
  for (const item of avoid ?? []) {
    const shengxiao = typeof item === 'string' ? item : item.shengxiao;
    if (!shengxiao) continue;
    let names = avoidByShengxiao.get(shengxiao);
    if (!names) {
      names = new Set<string>();
      avoidByShengxiao.set(shengxiao, names);
    }
    if (typeof item !== 'string' && item.name && item.name !== shengxiao) {
      names.add(item.name);
    }
  }
  const avoidShengxiao = [...avoidByShengxiao.keys()];

  const startJdn = gregorianToJDN(startYear, startMonth, startDay);
  const endJdn = gregorianToJDN(endYear, endMonth, endDay);
  const results: PickResult[] = [];

  for (let jdn = startJdn; jdn <= endJdn; jdn++) {
    const [year, month, day] = jdnToGregorian(jdn);
    const score = scoreDay(year, month, day, events, avoidShengxiao);
    const yiJi = getDayYiJi(year, month, day);
    const lunar = solarToLunar(year, month, day);

    // 冲煞硬排除：当天冲的生肖命中勾选的家人/避讳
    const excludedReasons: string[] = [];
    if (yiJi.chongShengxiao && avoidByShengxiao.has(yiJi.chongShengxiao)) {
      const names = [...(avoidByShengxiao.get(yiJi.chongShengxiao) ?? [])];
      excludedReasons.push(
        names.length > 0
          ? `冲${yiJi.chongShengxiao}，冲了${names.join('、')}`
          : `冲${yiJi.chongShengxiao}`
      );
    }
    const excluded = excludedReasons.length > 0;

    // 生成推荐理由
    const reasons: string[] = [];
    if (excluded) {
      reasons.push(...excludedReasons, '已排除');
    } else if (score >= 80) {
      reasons.push('大吉之日');
    } else if (score >= 60) {
      reasons.push('吉日');
    }

    for (const event of events) {
      if (yiJi.yi.some(y => event.includes(y) || y.includes(event))) {
        reasons.push(`宜${event}`);
      }
    }

    results.push({
      year, month, day,
      score,
      yi: yiJi.yi,
      ji: yiJi.ji,
      ganZhi: lunar.dayGanZhi,
      chong: yiJi.chong,
      chongShengxiao: yiJi.chongShengxiao,
      excluded,
      excludedReasons,
      reason: reasons.join('；') || '平日常日'
    });
  }

  // 被排除的日子排到最后，其余按分数排序
  return results.sort((a, b) => {
    if (a.excluded !== b.excluded) return a.excluded ? 1 : -1;
    return b.score - a.score;
  });
}

// 择日结果分类
export function categorizeResults(results: PickResult[]): {
  best: PickResult[];
  good: PickResult[];
  normal: PickResult[];
  bad: PickResult[];
  excluded: PickResult[];
} {
  const viable = results.filter(r => !r.excluded);
  return {
    best: viable.filter(r => r.score >= 80),
    good: viable.filter(r => r.score >= 60 && r.score < 80),
    normal: viable.filter(r => r.score >= 40 && r.score < 60),
    bad: viable.filter(r => r.score < 40),
    excluded: results.filter(r => r.excluded)
  };
}
