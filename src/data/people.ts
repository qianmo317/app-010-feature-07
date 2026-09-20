import { SHENG_XIAO } from '../almanac/constants';

// 家人档案：称呼 + 属相，可勾选参与择日、可停用
export interface FamilyMember {
  id: string;
  name: string; // 称呼，如「爸爸」
  shengxiao: string; // 属相
  active: boolean; // 是否启用（停用后不出现在择日勾选清单里，但数据保留）
  selected: boolean; // 本次择日是否勾选
}

const STORAGE_KEY = 'almanac.family.v1';
const NAME_MAX_LENGTH = 12;

function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidShengxiao(value: string): boolean {
  return SHENG_XIAO.includes(value);
}

// 测试环境（node）下没有 localStorage，降级为纯内存
function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage !== undefined) return storage;
  try {
    if (typeof localStorage !== 'undefined') {
      const probeKey = '__almanac_probe__';
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      return localStorage;
    }
  } catch {
    // 隐私模式等场景 localStorage 可能不可用
  }
  return null;
}

export class MemberStore {
  private members: FamilyMember[] = [];

  constructor(private storage: Storage | null = resolveStorage()) {
    this.load();
  }

  list(): FamilyMember[] {
    return this.members.map(m => ({ ...m }));
  }

  add(nameRaw: string, shengxiao: string): { ok: true; member: FamilyMember } | { ok: false; error: string } {
    const name = nameRaw.trim();
    if (!name) return { ok: false, error: '请输入称呼，如：爸爸' };
    if (name.length > NAME_MAX_LENGTH) return { ok: false, error: `称呼最多 ${NAME_MAX_LENGTH} 个字` };
    if (!isValidShengxiao(shengxiao)) return { ok: false, error: '请选择属相' };
    if (this.members.some(m => m.name === name)) return { ok: false, error: `已存在「${name}」，请勿重复添加` };

    const member: FamilyMember = { id: createId(), name, shengxiao, active: true, selected: true };
    this.members.push(member);
    this.persist();
    return { ok: true, member };
  }

  update(id: string, patch: Partial<Pick<FamilyMember, 'name' | 'shengxiao' | 'active' | 'selected'>>): boolean {
    const member = this.members.find(m => m.id === id);
    if (!member) return false;

    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) return false;
      if (name.length > NAME_MAX_LENGTH) return false;
      if (this.members.some(m => m.id !== id && m.name === name)) return false;
      member.name = name;
    }
    if (patch.shengxiao !== undefined) {
      if (!isValidShengxiao(patch.shengxiao)) return false;
      member.shengxiao = patch.shengxiao;
    }
    if (patch.active !== undefined) member.active = patch.active;
    if (patch.selected !== undefined) member.selected = patch.selected;

    this.persist();
    return true;
  }

  remove(id: string): void {
    this.members = this.members.filter(m => m.id !== id);
    this.persist();
  }

  // 批量设置勾选状态（只影响启用中的家人）
  setSelectedForActive(selected: boolean): void {
    this.members.forEach(m => {
      if (m.active) m.selected = selected;
    });
    this.persist();
  }

  // 本次择日实际生效的避讳：启用且勾选
  selectedMembers(): FamilyMember[] {
    return this.members.filter(m => m.active && m.selected).map(m => ({ ...m }));
  }

  // 导出为 JSON 文本，可用于换设备迁移
  exportJSON(): string {
    return JSON.stringify(this.members, null, 2);
  }

  // 从备份文本恢复，校验通过后整体覆盖
  importJSON(text: string): number {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('备份内容不是合法的 JSON');
    }
    if (!Array.isArray(parsed)) throw new Error('备份格式不正确：应为家人列表');

    const incoming: FamilyMember[] = [];
    const names = new Set<string>();
    const ids = new Set<string>();
    for (const item of parsed as unknown[]) {
      if (typeof item !== 'object' || item === null) throw new Error('备份中存在无法识别的条目');
      const row = item as Record<string, unknown>;
      if (typeof row.name !== 'string' || !row.name.trim()) throw new Error('备份中存在缺少称呼的条目');
      const name = row.name.trim();
      if (name.length > NAME_MAX_LENGTH) throw new Error(`称呼「${name}」超长`);
      if (names.has(name)) throw new Error(`备份中称呼「${name}」重复`);
      if (typeof row.shengxiao !== 'string' || !isValidShengxiao(row.shengxiao)) {
        throw new Error(`备份中「${name}」的属相无效`);
      }
      let id = typeof row.id === 'string' ? row.id : createId();
      if (ids.has(id)) id = createId();
      ids.add(id);
      names.add(name);
      incoming.push({
        id,
        name,
        shengxiao: row.shengxiao,
        active: row.active !== false,
        selected: row.selected === true,
      });
    }

    this.members = incoming;
    this.persist();
    return incoming.length;
  }

  private load() {
    if (!this.storage) return;
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.members = (parsed as unknown[]).flatMap(item => {
        if (typeof item !== 'object' || item === null) return [];
        const row = item as Record<string, unknown>;
        if (typeof row.id !== 'string' || typeof row.name !== 'string' || !isValidShengxiao(String(row.shengxiao))) {
          return [];
        }
        return [{
          id: row.id,
          name: row.name,
          shengxiao: String(row.shengxiao),
          active: row.active !== false,
          selected: row.selected === true,
        }];
      });
    } catch {
      // 数据损坏时保持空列表，不影响页面使用
    }
  }

  private persist() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.members));
    } catch (err) {
      console.warn('家人数据保存失败：', err);
    }
  }
}

export const memberStore = new MemberStore();
