import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
import { pickDays, categorizeResults, PickResult } from '../almanac/pick-day';
import { EVENT_WEIGHTS } from '../almanac/yiji';
import { SHENG_XIAO } from '../almanac/constants';
import {
  loadPeople, addPerson, updatePerson, setPersonEnabled, removePerson,
  loadCheckedIds, saveCheckedIds
} from '../data/people';
import html2canvas from 'html2canvas';

export function renderPick(app: HTMLElement) {
  clearElement(app);
  app.className = 'page pick-page';

  const now = new Date();
  const defaultStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const defaultEnd = `${now.getFullYear() + 1}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // 头部
  const header = createElement('div', 'page-header');
  const backBtn = createElement('button', 'back-btn', '◀ 返回');
  backBtn.addEventListener('click', () => router.navigate('/'));
  const title = createElement('h1', 'page-title', '择日向导');
  header.append(backBtn, title);

  // 表单
  const form = createElement('div', 'pick-form');

  // 事项选择
  const eventsSection = createElement('div', 'form-section');
  eventsSection.innerHTML = '<label>选择事项（可多选）</label>';
  const eventsGrid = createElement('div', 'events-grid');
  const selectedEvents = new Set<string>();

  Object.keys(EVENT_WEIGHTS).forEach(event => {
    const btn = createElement('button', 'event-btn', event);
    btn.addEventListener('click', () => {
      if (selectedEvents.has(event)) {
        selectedEvents.delete(event);
        btn.classList.remove('selected');
      } else {
        selectedEvents.add(event);
        btn.classList.add('selected');
      }
    });
    eventsGrid.appendChild(btn);
  });
  eventsSection.appendChild(eventsGrid);

  // 日期范围
  const dateSection = createElement('div', 'form-section');
  dateSection.innerHTML = `
    <label>日期范围</label>
    <div class="date-range">
      <input type="date" id="start-date" value="${defaultStart}">
      <span>至</span>
      <input type="date" id="end-date" value="${defaultEnd}">
    </div>
  `;

  // 家人避讳：保存过的家人列成勾选清单，冲其属相的日期会被排除并注明
  const avoidSection = createElement('div', 'form-section');
  const avoidLabel = createElement('label', '', '家人避讳（勾选后，冲其属相的日期将被排除并注明冲了谁）');
  const peopleList = createElement('div', 'people-list');
  const hint = createElement('div', 'form-hint');

  const checkedIds = new Set<string>(loadCheckedIds());
  const persistChecked = () => saveCheckedIds([...checkedIds]);

  function renderPeopleList() {
    clearElement(peopleList);
    const people = loadPeople();

    if (people.length === 0) {
      peopleList.appendChild(
        createElement('div', 'people-empty', '还没有保存的家人。在下方添加称呼和属相，之后每次择日直接勾选即可。')
      );
      return;
    }

    people.forEach(person => {
      const row = createElement('div', `person-row${person.enabled ? '' : ' disabled'}`);

      // 勾选参与本次择日
      const checkLabel = createElement('label', 'person-check');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = person.enabled && checkedIds.has(person.id);
      checkbox.disabled = !person.enabled;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) checkedIds.add(person.id);
        else checkedIds.delete(person.id);
        persistChecked();
      });
      checkLabel.append(
        checkbox,
        createElement('span', 'person-name', person.name),
        createElement('span', 'person-sx', `属${person.shengxiao}`)
      );

      // 改属相
      const sxSelect = document.createElement('select');
      sxSelect.className = 'person-sx-select';
      sxSelect.title = '修改属相';
      SHENG_XIAO.forEach(sx => {
        const opt = document.createElement('option');
        opt.value = sx;
        opt.textContent = `属${sx}`;
        if (sx === person.shengxiao) opt.selected = true;
        sxSelect.appendChild(opt);
      });
      sxSelect.addEventListener('change', () => {
        try {
          updatePerson(person.id, { shengxiao: sxSelect.value });
          hint.textContent = '';
          renderPeopleList();
        } catch (err) {
          hint.textContent = (err as Error).message;
        }
      });

      // 停用 / 启用
      const toggleBtn = createElement('button', 'person-toggle', person.enabled ? '停用' : '启用');
      toggleBtn.addEventListener('click', () => {
        setPersonEnabled(person.id, !person.enabled);
        if (person.enabled) {
          checkedIds.delete(person.id);
          persistChecked();
        }
        renderPeopleList();
      });

      // 删除
      const delBtn = createElement('button', 'person-delete', '删除');
      delBtn.addEventListener('click', () => {
        if (!confirm(`确定把「${person.name}」从清单中删除吗？`)) return;
        removePerson(person.id);
        checkedIds.delete(person.id);
        persistChecked();
        renderPeopleList();
      });

      row.append(checkLabel, sxSelect, toggleBtn, delBtn);
      peopleList.appendChild(row);
    });
  }

  // 添加家人
  const addRow = createElement('div', 'person-add');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = '称呼，如：爸爸';
  nameInput.maxLength = 12;
  const sxSelect = document.createElement('select');
  const placeholderOpt = document.createElement('option');
  placeholderOpt.value = '';
  placeholderOpt.textContent = '选择属相';
  placeholderOpt.disabled = true;
  placeholderOpt.selected = true;
  sxSelect.appendChild(placeholderOpt);
  SHENG_XIAO.forEach(sx => {
    const opt = document.createElement('option');
    opt.value = sx;
    opt.textContent = `属${sx}`;
    sxSelect.appendChild(opt);
  });
  const addBtn = createElement('button', 'person-add-btn', '＋ 添加家人');
  const doAdd = () => {
    try {
      const person = addPerson(nameInput.value, sxSelect.value);
      checkedIds.add(person.id); // 新添加的家人默认参与本次择日
      persistChecked();
      nameInput.value = '';
      sxSelect.value = '';
      hint.textContent = '';
      renderPeopleList();
    } catch (err) {
      hint.textContent = (err as Error).message;
    }
  };
  addBtn.addEventListener('click', doAdd);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAdd();
  });
  addRow.append(nameInput, sxSelect, addBtn);

  avoidSection.append(avoidLabel, peopleList, addRow, hint);
  renderPeopleList();

  // 提交按钮
  const submitBtn = createElement('button', 'submit-btn', '开始择日');

  form.append(eventsSection, dateSection, avoidSection, submitBtn);

  // 结果区域
  const resultArea = createElement('div', 'result-area');

  submitBtn.addEventListener('click', () => {
    if (selectedEvents.size === 0) {
      alert('请至少选择一个事项');
      return;
    }

    const startDate = (document.getElementById('start-date') as HTMLInputElement).value;
    const endDate = (document.getElementById('end-date') as HTMLInputElement).value;

    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);

    // 勾选且未停用的家人参与避讳
    const avoidPeople = loadPeople()
      .filter(p => p.enabled && checkedIds.has(p.id))
      .map(p => ({ name: p.name, shengxiao: p.shengxiao }));

    const startTime = performance.now();
    const results = pickDays(sy, sm, sd, ey, em, ed, Array.from(selectedEvents), [], avoidPeople);
    const endTime = performance.now();

    renderResults(resultArea, results, endTime - startTime);
  });

  app.append(header, form, resultArea);
}

function renderResults(container: HTMLElement, results: PickResult[], elapsed: number) {
  clearElement(container);

  const { best, good, normal, bad, excluded } = categorizeResults(results);

  const stats = createElement('div', 'result-stats');
  stats.innerHTML = `
    <span>大吉 ${best.length} 天</span>
    <span>吉 ${good.length} 天</span>
    <span>平 ${normal.length} 天</span>
    <span>凶 ${bad.length} 天</span>
    ${excluded.length > 0 ? `<span class="excluded-stat">已排除 ${excluded.length} 天</span>` : ''}
    <span class="elapsed">计算耗时 ${elapsed.toFixed(1)}ms</span>
  `;
  container.appendChild(stats);

  // 最佳日期
  if (best.length > 0) {
    const bestSection = createElement('div', 'result-section');
    bestSection.innerHTML = '<h3 class="section-title best">大吉之日</h3>';
    const grid = createElement('div', 'result-grid');
    best.forEach(r => grid.appendChild(createResultCard(r)));
    bestSection.appendChild(grid);
    container.appendChild(bestSection);
  }

  // 吉日
  if (good.length > 0) {
    const goodSection = createElement('div', 'result-section');
    goodSection.innerHTML = '<h3 class="section-title good">吉日</h3>';
    const grid = createElement('div', 'result-grid');
    good.slice(0, 20).forEach(r => grid.appendChild(createResultCard(r)));
    goodSection.appendChild(grid);
    container.appendChild(goodSection);
  }

  // 已排除：冲犯避讳的日期单独展示，注明冲了谁
  if (excluded.length > 0) {
    const excludedSection = createElement('div', 'result-section');
    excludedSection.innerHTML = '<h3 class="section-title excluded">已排除 · 冲犯家人避讳</h3>';
    const grid = createElement('div', 'result-grid');
    excluded.slice(0, 30).forEach(r => grid.appendChild(createResultCard(r)));
    excludedSection.appendChild(grid);
    if (excluded.length > 30) {
      excludedSection.appendChild(
        createElement('div', 'result-more', `仅列出前 30 天，共排除 ${excluded.length} 天`)
      );
    }
    container.appendChild(excludedSection);
  }

  // 导出按钮
  const exportBtn = createElement('button', 'export-btn', '导出吉日清单') as HTMLButtonElement;
  exportBtn.addEventListener('click', () => {
    exportBtn.textContent = '生成图片中...';
    exportBtn.disabled = true;
    exportResults(results).finally(() => {
      exportBtn.textContent = '导出吉日清单';
      exportBtn.disabled = false;
    });
  });
  container.appendChild(exportBtn);
}

function createResultCard(result: PickResult): HTMLElement {
  const dateText = `${result.year}-${String(result.month).padStart(2, '0')}-${String(result.day).padStart(2, '0')}`;

  if (result.excluded) {
    // 被排除的日期：虚线灰底卡片 + 「避」标记，与低分日期明显区分
    const card = createElement('div', 'result-card excluded');
    const date = createElement('div', 'result-date', dateText);
    const ganzhi = createElement('div', 'result-ganzhi', `${result.ganZhi}日 · 原评 ${result.score} 分`);
    const badge = createElement('span', 'excluded-badge', '避');
    const reason = createElement('div', 'result-reason', result.reason);
    card.append(date, ganzhi, badge, reason);
    card.addEventListener('click', () => {
      router.navigate(`/day/${dateText}`);
    });
    return card;
  }

  const card = createElement('div', `result-card score-${Math.floor(result.score / 20)}`);
  card.innerHTML = `
    <div class="result-date">${dateText}</div>
    <div class="result-ganzhi">${result.ganZhi}日</div>
    <div class="result-score">${result.score}分</div>
    <div class="result-reason">${result.reason}</div>
    <div class="result-yi">${result.yi.slice(0, 4).map(y => `<span>${y}</span>`).join('')}</div>
  `;
  card.addEventListener('click', () => {
    router.navigate(`/day/${dateText}`);
  });
  return card;
}

async function exportResults(results: PickResult[]) {
  // 被排除的日期不得进入吉日清单
  const goodResults = results.filter(r => !r.excluded && r.score >= 60).slice(0, 50);
  if (goodResults.length === 0) {
    alert('没有可导出的吉日');
    return;
  }

  // 创建离屏容器用于生成图片
  const exportContainer = document.createElement('div');
  exportContainer.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 360px;
    background: #f7f3e9;
    padding: 24px;
    font-family: "Noto Serif SC", "Source Han Serif SC", serif;
    color: #333;
  `;

  const title = document.createElement('h2');
  title.style.cssText = 'text-align: center; margin: 0 0 16px 0; color: #c41e3a; font-size: 22px; letter-spacing: 4px;';
  title.textContent = '择日吉日清单';

  const subtitle = document.createElement('div');
  subtitle.style.cssText = 'text-align: center; font-size: 12px; color: #888; margin-bottom: 20px;';
  subtitle.textContent = `共 ${goodResults.length} 个吉日 · ${new Date().toLocaleDateString('zh-CN')}`;

  const seal = document.createElement('div');
  seal.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    width: 48px;
    height: 48px;
    border: 2px solid #c41e3a;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #c41e3a;
    font-size: 11px;
    font-weight: bold;
    transform: rotate(-12deg);
    opacity: 0.8;
  `;
  seal.textContent = '大吉';

  const list = document.createElement('div');
  list.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

  goodResults.forEach((r) => {
    const item = document.createElement('div');
    const scoreColor = r.score >= 80 ? '#c41e3a' : r.score >= 60 ? '#d4a017' : '#666';
    item.style.cssText = `
      background: #fff;
      border-radius: 8px;
      padding: 12px;
      border-left: 4px solid ${scoreColor};
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    `;
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-size: 16px; font-weight: bold;">${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}</span>
        <span style="font-size: 14px; color: ${scoreColor}; font-weight: bold;">${r.score}分</span>
      </div>
      <div style="font-size: 13px; color: #666; margin-bottom: 4px;">${r.ganZhi}日 · ${r.reason}</div>
      <div style="font-size: 12px; color: #888;">宜：${r.yi.slice(0, 5).join('、')}</div>
    `;
    list.appendChild(item);
  });

  const footer = document.createElement('div');
  footer.style.cssText = 'text-align: center; margin-top: 20px; font-size: 11px; color: #aaa;';
  footer.textContent = '老黄历择日 · 仅供参考';

  exportContainer.appendChild(seal);
  exportContainer.appendChild(title);
  exportContainer.appendChild(subtitle);
  exportContainer.appendChild(list);
  exportContainer.appendChild(footer);
  document.body.appendChild(exportContainer);

  try {
    const canvas = await html2canvas(exportContainer, {
      scale: 3,
      useCORS: true,
      backgroundColor: '#f7f3e9',
      logging: false,
      width: 360,
      windowWidth: 360,
    });

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `吉日清单_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  } catch (err) {
    console.error('导出图片失败:', err);
    alert('导出图片失败，请重试');
  } finally {
    document.body.removeChild(exportContainer);
  }
}
