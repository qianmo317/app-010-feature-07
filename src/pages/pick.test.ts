// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderPick } from './pick';

function app() {
  return document.getElementById('app')!;
}

function addPersonViaUI(name: string, shengxiao: string) {
  const input = app().querySelector('.person-add input') as HTMLInputElement;
  const select = app().querySelector('.person-add select') as HTMLSelectElement;
  input.value = name;
  select.value = shengxiao;
  (app().querySelector('.person-add-btn') as HTMLButtonElement).click();
}

function runPick() {
  // 选一个事项再提交
  (app().querySelector('.event-btn') as HTMLButtonElement).click();
  (app().querySelector('.submit-btn') as HTMLButtonElement).click();
}

describe('择日页 · 家人避讳', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('空清单时应显示引导提示', () => {
    renderPick(app());
    expect(app().querySelector('.people-empty')).toBeTruthy();
    // 不应再出现手打生肖的输入框
    expect(document.getElementById('avoid-shengxiao')).toBeNull();
  });

  it('应能添加家人，默认勾选并持久保存', () => {
    renderPick(app());
    addPersonViaUI('爸爸', '鼠');

    const checkbox = app().querySelector('.person-check input') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(true);
    expect(app().textContent).toContain('爸爸');
    expect(app().textContent).toContain('属鼠');

    // 重新打开页面（重新渲染）家人仍在且保持勾选
    renderPick(app());
    const checkbox2 = app().querySelector('.person-check input') as HTMLInputElement;
    expect(checkbox2).toBeTruthy();
    expect(checkbox2.checked).toBe(true);
    expect(app().textContent).toContain('爸爸');
  });

  it('输入有误时应给出提示而不是静默失败', () => {
    renderPick(app());
    // 不填称呼直接添加
    (app().querySelector('.person-add-btn') as HTMLButtonElement).click();
    expect(app().querySelector('.form-hint')!.textContent).toContain('请填写称呼');

    // 填称呼但不选属相
    addPersonViaUI('爸爸', '');
    expect(app().querySelector('.form-hint')!.textContent).toContain('请选择正确的属相');
  });

  it('应能修改属相、停用与启用', () => {
    renderPick(app());
    addPersonViaUI('妈妈', '马');

    // 改属相
    const sxSelect = app().querySelector('.person-sx-select') as HTMLSelectElement;
    sxSelect.value = '羊';
    sxSelect.dispatchEvent(new Event('change'));
    expect(app().textContent).toContain('属羊');

    // 停用：行变灰、勾选框不可用
    (app().querySelector('.person-toggle') as HTMLButtonElement).click();
    expect(app().querySelector('.person-row')!.className).toContain('disabled');
    const checkbox = app().querySelector('.person-check input') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);

    // 启用后恢复
    (app().querySelector('.person-toggle') as HTMLButtonElement).click();
    expect(app().querySelector('.person-row')!.className).not.toContain('disabled');
  });

  it('被排除的日期应单独展示并注明冲了谁', () => {
    renderPick(app());
    addPersonViaUI('爸爸', '鼠');
    runPick();

    // 统计中出现「已排除」
    expect(app().querySelector('.excluded-stat')!.textContent).toContain('已排除');
    // 有独立的排除分组
    expect(app().querySelector('.section-title.excluded')).toBeTruthy();
    // 排除卡片注明冲了谁
    const excludedCard = app().querySelector('.result-card.excluded')!;
    expect(excludedCard.textContent).toContain('冲爸爸（属鼠）');
    expect(excludedCard.querySelector('.excluded-badge')).toBeTruthy();
    // 排除卡片不会出现在大吉/吉日分组里（分组可能不存在，统一直接全局核对）
    const bestSection = app().querySelector('.section-title.best')?.parentElement;
    const goodSection = app().querySelector('.section-title.good')?.parentElement;
    expect(bestSection?.querySelector('.result-card.excluded') ?? null).toBeNull();
    expect(goodSection?.querySelector('.result-card.excluded') ?? null).toBeNull();
  });

  it('停用家人后其属相不再导致排除', () => {
    renderPick(app());
    addPersonViaUI('爸爸', '鼠');
    // 停用
    (app().querySelector('.person-toggle') as HTMLButtonElement).click();
    runPick();

    expect(app().querySelector('.excluded-stat')).toBeNull();
    expect(app().querySelector('.result-card.excluded')).toBeNull();
  });
});
