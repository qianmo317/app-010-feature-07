import { SHENG_XIAO } from '../almanac/constants';

// 家人避讳条目：称呼 + 属相
export interface Person {
  id: string;
  name: string;      // 称呼，如「爸爸」
  shengxiao: string; // 属相，如「鼠」
  enabled: boolean;  // 停用后不参与择日避讳，但保留在清单中
}

const STORAGE_KEY = 'almanac-family-people';
const CHECKED_KEY = 'almanac-pick-checked-people';

// localStorage 不可用时（隐私模式、测试环境）退化为内存存储
const memoryStore = new Map<string, string>();

function getItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch { /* 落入内存回退 */ }
  return memoryStore.get(key) ?? null;
}

function setItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch { /* 落入内存回退 */ }
  memoryStore.set(key, value);
}

export function isValidShengxiao(s: string): boolean {
  return SHENG_XIAO.includes(s);
}

function normalize(raw: unknown): Person | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Person>;
  if (typeof p.id !== 'string' || !p.id) return null;
  if (typeof p.name !== 'string' || !p.name.trim()) return null;
  if (typeof p.shengxiao !== 'string' || !isValidShengxiao(p.shengxiao)) return null;
  return { id: p.id, name: p.name.trim(), shengxiao: p.shengxiao, enabled: p.enabled !== false };
}

export function loadPeople(): Person[] {
  const text = getItem(STORAGE_KEY);
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return [];
    return arr.map(normalize).filter((p): p is Person => p !== null);
  } catch {
    return [];
  }
}

export function savePeople(people: Person[]): void {
  setItem(STORAGE_KEY, JSON.stringify(people));
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('请填写称呼');
  if (trimmed.length > 12) throw new Error('称呼最多 12 个字');
  return trimmed;
}

export function addPerson(name: string, shengxiao: string): Person {
  const trimmed = validateName(name);
  if (!isValidShengxiao(shengxiao)) throw new Error('请选择正确的属相');
  const people = loadPeople();
  if (people.some(p => p.name === trimmed && p.shengxiao === shengxiao)) {
    throw new Error(`「${trimmed}（属${shengxiao}）」已在清单中`);
  }
  const person: Person = { id: genId(), name: trimmed, shengxiao, enabled: true };
  people.push(person);
  savePeople(people);
  return person;
}

export function updatePerson(id: string, patch: { name?: string; shengxiao?: string }): Person | null {
  const people = loadPeople();
  const person = people.find(p => p.id === id);
  if (!person) return null;
  if (patch.name !== undefined) person.name = validateName(patch.name);
  if (patch.shengxiao !== undefined) {
    if (!isValidShengxiao(patch.shengxiao)) throw new Error('请选择正确的属相');
    person.shengxiao = patch.shengxiao;
  }
  savePeople(people);
  return person;
}

export function setPersonEnabled(id: string, enabled: boolean): void {
  const people = loadPeople();
  const person = people.find(p => p.id === id);
  if (!person) return;
  person.enabled = enabled;
  savePeople(people);
}

export function removePerson(id: string): void {
  savePeople(loadPeople().filter(p => p.id !== id));
}

// 择日页勾选的家人 id，刷新后保留
export function loadCheckedIds(): string[] {
  const text = getItem(CHECKED_KEY);
  if (!text) return [];
  try {
    const arr = JSON.parse(text);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function saveCheckedIds(ids: string[]): void {
  setItem(CHECKED_KEY, JSON.stringify(ids));
}
