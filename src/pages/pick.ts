import { router } from '../router';
import { createElement, clearElement } from '../utils/dom';
import { pickDays, categorizeResults, PickResult } from '../almanac/pick-day';
import { EVENT_WEIGHTS } from '../almanac/yiji';
import { SHENG_XIAO } from '../almanac/constants';
import { memberStore, FamilyMember } from '../data/people';
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

  // 避讳（家人勾选清单）
  const avoidSection = createElement('div', 'form-section');
  avoidSection.innerHTML = `
    <label>避讳家人（勾选后，冲其属相的日子将排除）</label>
  `;
  const avoidHint = createElement('p', 'form-hint', '当天冲的生肖若与勾选家人属相相同，该日不计入吉日，并在结果中注明冲了谁。');
  const peopleArea = createElement('div', 'people-area');
  avoidSection.append(avoidHint, peopleArea);

  // 提交按钮
  const submitBtn = createElement('button', 'submit-btn', '开始择日');

  form.append(eventsSection, dateSection, avoidSection, submitBtn);

  // 结果区域
  const resultArea = createElement('div', 'result-area');

  // 渲染家人勾选清单 + 管理入口
  function renderPeople() {
    clearElement(peopleArea);
    const members = memberStore.list();

    if (members.length === 0) {
      const empty = createElement('div', 'people-empty', '还没有保存家人，先添加家里常算的几个人吧。');
      peopleArea.appendChild(empty);
    } else {
      const list = createElement('div', 'people-list');
      members.forEach(member => list.appendChild(createPersonRow(member)));
      peopleArea.appendChild(list);

      const activeMembers = members.filter(m => m.active);
      if (activeMembers.length > 0) {
        const bulk = createElement('div', 'people-bulk');
        const allSelected = activeMembers.every(m => m.selected);
        const selectAllBtn = createElement('button', 'link-btn', allSelected ? '全部取消' : '全部勾选');
        selectAllBtn.addEventListener('click', () => {
          memberStore.setSelectedForActive(!allSelected);
          renderPeople();
        });
        bulk.appendChild(selectAllBtn);
        peopleArea.appendChild(bulk);
      }
    }

    const manageRow = createElement('div', 'people-manage-row');
    const manageBtn = createElement('button', 'link-btn', '⚙ 管理家人（增改属相 / 停用）');
    manageBtn.addEventListener('click', () => openManagePanel());
    const backupBtn = createElement('button', 'link-btn', '备份 / 换机恢复');
    backupBtn.addEventListener('click', () => openBackupModal());
    manageRow.append(manageBtn, backupBtn);
    peopleArea.appendChild(manageRow);
  }

  function createPersonRow(member: FamilyMember): HTMLElement {
    const row = createElement('label', `person-row${member.active ? '' : ' disabled'}`);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = member.selected && member.active;
    checkbox.disabled = !member.active;
    checkbox.addEventListener('change', () => {
      memberStore.update(member.id, { selected: checkbox.checked });
    });

    const name = createElement('span', 'person-name', member.name);
    const sx = createElement('span', 'person-sx', `属${member.shengxiao}`);

    const status = createElement('span', 'person-status', member.active ? '' : '已停用');
    row.append(checkbox, name, sx, status);
    return row;
  }

  // 家人管理面板（添加 / 改属相 / 停用启用 / 删除）
  function openManagePanel() {
    const overlay = createElement('div', 'modal-overlay');
    const panel = createElement('div', 'modal-panel manage-panel');

    const head = createElement('div', 'modal-head');
    head.innerHTML = '<h2>管理家人</h2>';
    const closeBtn = createElement('button', 'modal-close', '✕');
    closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
    head.appendChild(closeBtn);

    // 添加表单
    const addForm = createElement('div', 'member-add-form');
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = '称呼，如：爸爸';
    nameInput.className = 'member-name-input';
    nameInput.maxLength = 12;

    const sxSelect = document.createElement('select');
    sxSelect.className = 'member-sx-select';
    SHENG_XIAO.forEach(sx => {
      const opt = document.createElement('option');
      opt.value = sx;
      opt.textContent = `属${sx}`;
      sxSelect.appendChild(opt);
    });

    const addBtn = createElement('button', 'member-add-btn', '添加');
    const addError = createElement('p', 'field-error');

    const doAdd = () => {
      const result = memberStore.add(nameInput.value, sxSelect.value);
      if (!result.ok) {
        addError.textContent = result.error;
        return;
      }
      addError.textContent = '';
      nameInput.value = '';
      sxSelect.value = SHENG_XIAO[0];
      renderManageList();
      renderPeople();
      nameInput.focus();
    };
    addBtn.addEventListener('click', doAdd);
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') doAdd();
    });

    const addRow = createElement('div', 'member-add-row');
    addRow.append(nameInput, sxSelect, addBtn);
    addForm.append(addRow, addError);

    // 现有家人列表
    const listWrap = createElement('div', 'manage-list-wrap');

    function renderManageList() {
      clearElement(listWrap);
      const members = memberStore.list();
      if (members.length === 0) {
        listWrap.appendChild(createElement('p', 'manage-empty', '暂无家人'));
        return;
      }
      members.forEach(member => {
        const row = createElement('div', `manage-member-row${member.active ? '' : ' disabled'}`);

        const nameSpan = createElement('span', 'manage-name', member.name);

        const sxEdit = document.createElement('select');
        sxEdit.className = 'member-sx-select sm';
        SHENG_XIAO.forEach(sx => {
          const opt = document.createElement('option');
          opt.value = sx;
          opt.textContent = `属${sx}`;
          if (sx === member.shengxiao) opt.selected = true;
          sxEdit.appendChild(opt);
        });
        sxEdit.addEventListener('change', () => {
          if (memberStore.update(member.id, { shengxiao: sxEdit.value })) {
            renderPeople();
          } else {
            sxEdit.value = member.shengxiao;
          }
        });

        const toggleBtn = createElement('button', 'link-btn', member.active ? '停用' : '启用');
        toggleBtn.title = member.active ? '停用后不参与择日，数据保留' : '重新启用';
        toggleBtn.addEventListener('click', () => {
          memberStore.update(member.id, { active: !member.active, selected: !member.active ? member.selected : false });
          renderManageList();
          renderPeople();
        });

        const delBtn = createElement('button', 'link-btn danger', '删除');
        delBtn.addEventListener('click', () => {
          if (window.confirm(`确定删除「${member.name}」吗？`)) {
            memberStore.remove(member.id);
            renderManageList();
            renderPeople();
          }
        });

        const actions = createElement('div', 'manage-actions');
        actions.append(toggleBtn, delBtn);
        row.append(nameSpan, sxEdit, actions);
        listWrap.appendChild(row);
      });
    }
    renderManageList();

    panel.append(head, addForm, listWrap);
    overlay.appendChild(panel);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
    nameInput.focus();
  }

  // 备份 / 换机恢复（静态站点无后端，用文本导出导入实现跨设备迁移）
  function openBackupModal() {
    const overlay = createElement('div', 'modal-overlay');
    const panel = createElement('div', 'modal-panel backup-panel');

    const head = createElement('div', 'modal-head');
    head.innerHTML = '<h2>备份 / 换机恢复</h2>';
    const closeBtn = createElement('button', 'modal-close', '✕');
    closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
    head.appendChild(closeBtn);

    const tip = createElement('p', 'form-hint', '家人数据保存在本机浏览器中。换设备时，先在旧设备复制备份文本，再到新设备粘贴恢复。');

    const tabs = createElement('div', 'backup-tabs');
    const exportTab = createElement('button', 'backup-tab selected', '导出备份');
    const importTab = createElement('button', 'backup-tab', '导入恢复');
    tabs.append(exportTab, importTab);

    const exportPane = createElement('div', 'backup-pane');
    const textarea = document.createElement('textarea');
    textarea.className = 'backup-textarea';
    textarea.readOnly = true;
    textarea.value = memberStore.exportJSON();
    textarea.rows = 8;
    const copyBtn = createElement('button', 'submit-btn sm', '复制备份文本');
    const copyMsg = createElement('span', 'copy-msg');
    copyBtn.addEventListener('click', async () => {
      textarea.select();
      try {
        await navigator.clipboard.writeText(textarea.value);
        copyMsg.textContent = '已复制';
      } catch {
        // 非安全上下文（如 http 内网访问）下剪贴板 API 不可用
        document.execCommand('copy');
        copyMsg.textContent = '已复制（如失败请手动全选复制）';
      }
      setTimeout(() => { copyMsg.textContent = ''; }, 2500);
    });
    const copyRow = createElement('div', 'backup-actions');
    copyRow.append(copyBtn, copyMsg);
    exportPane.append(textarea, copyRow);

    const importPane = createElement('div', 'backup-pane hidden');
    const importArea = document.createElement('textarea');
    importArea.className = 'backup-textarea';
    importArea.rows = 8;
    importArea.placeholder = '在此粘贴旧设备的备份文本';
    const importError = createElement('p', 'field-error');
    const importBtn = createElement('button', 'submit-btn sm danger-bg', '恢复（覆盖本机数据）');
    importBtn.addEventListener('click', () => {
      try {
        const count = memberStore.importJSON(importArea.value);
        document.body.removeChild(overlay);
        renderPeople();
        alert(`已恢复 ${count} 位家人`);
      } catch (err) {
        importError.textContent = err instanceof Error ? err.message : '恢复失败';
      }
    });
    const importActions = createElement('div', 'backup-actions');
    importActions.appendChild(importBtn);
    importPane.append(importArea, importError, importActions);

    exportTab.addEventListener('click', () => {
      exportTab.classList.add('selected');
      importTab.classList.remove('selected');
      exportPane.classList.remove('hidden');
      importPane.classList.add('hidden');
    });
    importTab.addEventListener('click', () => {
      importTab.classList.add('selected');
      exportTab.classList.remove('selected');
      importPane.classList.remove('hidden');
      exportPane.classList.add('hidden');
    });

    panel.append(head, tip, tabs, exportPane, importPane);
    overlay.appendChild(panel);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
  }

  renderPeople();

  submitBtn.addEventListener('click', () => {
    if (selectedEvents.size === 0) {
      alert('请至少选择一个事项');
      return;
    }

    const startDate = (document.getElementById('start-date') as HTMLInputElement).value;
    const endDate = (document.getElementById('end-date') as HTMLInputElement).value;
    if (!startDate || !endDate) {
      alert('请选择日期范围');
      return;
    }
    if (endDate < startDate) {
      alert('结束日期不能早于开始日期');
      return;
    }

    const selectedPeople = memberStore.selectedMembers();

    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);

    const startTime = performance.now();
    const results = pickDays(sy, sm, sd, ey, em, ed, Array.from(selectedEvents), selectedPeople);
    const endTime = performance.now();

    renderResults(resultArea, results, selectedPeople.map(p => p.name), endTime - startTime);
  });

  app.append(header, form, resultArea);
}

function renderResults(container: HTMLElement, results: PickResult[], peopleNames: string[], elapsed: number) {
  clearElement(container);

  const { best, good, normal, bad, excluded } = categorizeResults(results);

  const stats = createElement('div', 'result-stats');
  stats.innerHTML = `
    <span>大吉 ${best.length} 天</span>
    <span>吉 ${good.length} 天</span>
    <span>平 ${normal.length} 天</span>
    <span>凶 ${bad.length} 天</span>
    <span class="excluded-chip">冲煞排除 ${excluded.length} 天</span>
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

  if (best.length === 0 && good.length === 0) {
    container.appendChild(createElement('p', 'no-result', '所选范围内没有吉日，可调整事项、日期范围或取消部分避讳后重试。'));
  }

  // 被排除的日子：折叠展示，写明冲了谁，和吉日卡片明显区分
  if (excluded.length > 0) {
    const excludedSection = createElement('details', 'excluded-section');
    excludedSection.innerHTML = `
      <summary class="excluded-summary">
        已排除 ${excluded.length} 天（冲${peopleNames.length > 0 ? `避讳家人：${peopleNames.join('、')}` : '避讳生肖'}）
        <span class="excluded-summary-hint">点击查看原因</span>
      </summary>
    `;
    const list = createElement('div', 'excluded-list');
    const shown = excluded.slice(0, 300);
    shown.forEach(r => list.appendChild(createExcludedCard(r)));
    if (excluded.length > shown.length) {
      list.appendChild(createElement('p', 'excluded-more', `其余 ${excluded.length - shown.length} 天已省略，请缩小日期范围查看`));
    }
    excludedSection.appendChild(list);
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

function formatDate(r: PickResult): string {
  return `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`;
}

function createResultCard(result: PickResult): HTMLElement {
  const card = createElement('div', `result-card score-${Math.floor(result.score / 20)}`);
  card.innerHTML = `
    <div class="result-date">${formatDate(result)}</div>
    <div class="result-ganzhi">${result.ganZhi}日 · 冲${result.chongShengxiao}</div>
    <div class="result-score">${result.score}分</div>
    <div class="result-reason">${result.reason}</div>
    <div class="result-yi">${result.yi.slice(0, 4).map(y => `<span>${y}</span>`).join('')}</div>
  `;
  card.addEventListener('click', () => {
    router.navigate(`/day/${formatDate(result)}`);
  });
  return card;
}

// 被排除日期卡片：灰底、删除线日期、醒目的排除原因，和普通结果一眼区分
function createExcludedCard(result: PickResult): HTMLElement {
  const card = createElement('div', 'excluded-card');
  card.innerHTML = `
    <div class="excluded-date">${formatDate(result)} <span class="excluded-badge">已排除</span></div>
    <div class="excluded-ganzhi">${result.ganZhi}日 · 冲${result.chongShengxiao}</div>
    <div class="excluded-reason">${result.excludedReasons.join('；')}</div>
    <div class="excluded-score">评分 ${result.score} 分（已含冲煞扣分），不计入吉日</div>
  `;
  card.addEventListener('click', () => {
    router.navigate(`/day/${formatDate(result)}`);
  });
  return card;
}

async function exportResults(results: PickResult[]) {
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
        <span style="font-size: 16px; font-weight: bold;">${formatDate(r)}</span>
        <span style="font-size: 14px; color: ${scoreColor}; font-weight: bold;">${r.score}分</span>
      </div>
      <div style="font-size: 13px; color: #666; margin-bottom: 4px;">${r.ganZhi}日 · 冲${r.chongShengxiao} · ${r.reason}</div>
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
