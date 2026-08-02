/**
 * @fileoverview 画面描画。
 * 現在時計、割当サマリー、進行パネル、タスク一覧表の更新を担当する。
 */

import { escapeHtml, nowDate } from "./util.js";
import {
  formatNowClock,
  formatDuration,
  formatRemainingMs,
  formatClock,
  parseTimeToDate,
} from "./time.js";
import { normalizePriority, deadlineEndOfDay } from "./allocation.js";
import {
  syncDerived,
  getCurrentTask,
  getTaskProgress,
  getPlanRemainingMs,
} from "./schedule.js";
import { updateFocusOverlay } from "./focus.js";

/**
 * ヘッダーの現在時刻表示を更新する。
 *
 * @param {import("./types.js").DomElements} els
 * @param {Date} now
 * @returns {void}
 */
export function updateNowClock(els, now) {
  const text = formatNowClock(now);
  els.nowTime.textContent = text;
  els.nowTime.setAttribute("datetime", now.toISOString());
}

/**
 * 「進行中のタスク」パネルと次へボタンの文言・表示を更新する。
 *
 * @param {import("./types.js").AppState} state
 * @param {import("./types.js").DomElements} els
 * @param {Date} now
 * @returns {void}
 */
export function updateProgressPanel(state, els, now) {
  const current = getCurrentTask(state.tasks);

  if (!state.tasks.length) {
    els.progressStatus.textContent = "タスクを追加してください";
    els.progressCurrent.textContent = "";
    els.nextTaskBtn.hidden = true;
    els.nextTaskBtn.classList.remove("is-ready");
    return;
  }

  if (!current) {
    els.progressStatus.textContent = "すべてのタスクが完了しました";
    els.progressCurrent.textContent = "お疲れさまでした";
    els.nextTaskBtn.hidden = true;
    els.nextTaskBtn.classList.remove("is-ready");
    return;
  }

  const progress = getTaskProgress(current, now);
  els.progressCurrent.textContent = `${current.order}. ${current.name}`;

  if (progress.status === "done") {
    const hasNext = state.tasks.some((t) => !t.completed && t.id !== current.id);
    els.progressStatus.textContent = hasNext
      ? "このタスクが完了しました。次へ進んでください"
      : "このタスクが完了しました（最後のタスク）";
    els.nextTaskBtn.hidden = false;
    els.nextTaskBtn.disabled = false;
    els.nextTaskBtn.textContent = hasNext ? "次へ" : "完了にする";
    els.nextTaskBtn.classList.add("is-ready");
    return;
  }

  if (progress.status === "active") {
    els.progressStatus.textContent = `進行中 — 残り ${progress.label}`;
    els.nextTaskBtn.hidden = false;
    els.nextTaskBtn.disabled = false;
    els.nextTaskBtn.textContent = "完了して次へ";
    els.nextTaskBtn.classList.remove("is-ready");
    return;
  }

  if (progress.status === "upcoming") {
    els.progressStatus.textContent = `開始前 — ${progress.label}`;
    els.nextTaskBtn.hidden = true;
    els.nextTaskBtn.classList.remove("is-ready");
    return;
  }

  els.progressStatus.textContent = "開始時刻を決定すると進行状況が表示されます";
  els.progressCurrent.textContent = `${current.order}. ${current.name}`;
  els.nextTaskBtn.hidden = true;
  els.nextTaskBtn.classList.remove("is-ready");
}

/**
 * 毎秒の軽量更新。残り時間セルと進行パネル・フォーカス UI のみを書き換える。
 *
 * @param {import("./types.js").AppState} state
 * @param {import("./types.js").DomElements} els
 * @param {Date} now
 * @returns {void}
 */
export function updateLiveRemaining(state, els, now) {
  const planRemainingMs = getPlanRemainingMs(state.tasks, now);
  const planRemainingEl = document.getElementById("plan-remaining-value");
  if (planRemainingEl) {
    if (planRemainingMs === null) {
      planRemainingEl.textContent = "-";
    } else if (planRemainingMs <= 0) {
      planRemainingEl.textContent = state.tasks.every((t) => t.completed) ? "すべて完了" : "終了";
    } else {
      planRemainingEl.textContent = formatRemainingMs(planRemainingMs);
    }
  }

  state.tasks.forEach((task) => {
    const cell = els.tbody.querySelector(`[data-remaining-for="${task.id}"]`);
    const row = els.tbody.querySelector(`tr[data-id="${task.id}"]`);
    if (!cell) return;
    const progress = getTaskProgress(task, now);
    cell.textContent = progress.label;
    cell.className = `remaining-cell is-${progress.status}`;
    if (row) {
      row.classList.toggle("is-active-task", progress.status === "active" && !task.completed);
      row.classList.toggle("is-completed-task", !!task.completed);
    }
  });

  updateProgressPanel(state, els, now);
  updateFocusOverlay(state, els, now);
}

/**
 * 画面全体を再描画する（導出値の同期 → サマリー → 表 → フォーカス）。
 *
 * @param {import("./types.js").AppState} state
 * @param {import("./types.js").DomElements} els
 * @returns {void}
 */
export function render(state, els) {
  const now = nowDate();
  updateNowClock(els, now);

  const { totalMinutes, validation } = syncDerived(state, now);
  const base = parseTimeToDate(state.startTime, now);
  const planRemainingMs = getPlanRemainingMs(state.tasks, now);

  els.totalDisplay.textContent =
    totalMinutes > 0
      ? `決定済み: ${formatDuration(totalMinutes)}（${totalMinutes} 分）`
      : "まだ決定されていません";

  const statusLabel =
    validation.status === "ok"
      ? "ちょうど割当済み"
      : validation.status === "under"
        ? `残り ${formatDuration(validation.remaining)}`
        : `超過 ${formatDuration(Math.abs(validation.remaining))}`;

  const planRemainingLabel =
    planRemainingMs === null
      ? "-"
      : planRemainingMs <= 0
        ? state.tasks.length && state.tasks.every((t) => t.completed)
          ? "すべて完了"
          : "終了"
        : formatRemainingMs(planRemainingMs);

  els.summary.innerHTML =
    `<div class="summary-card">` +
    `<span class="label">総時間</span>` +
    `<span class="value">${escapeHtml(formatDuration(totalMinutes))}</span>` +
    `</div>` +
    `<div class="summary-card">` +
    `<span class="label">割当合計</span>` +
    `<span class="value">${escapeHtml(formatDuration(validation.allocatedSum))}</span>` +
    `</div>` +
    `<div class="summary-card status-${validation.status}">` +
    `<span class="label">差分</span>` +
    `<span class="value">${escapeHtml(statusLabel)}</span>` +
    `</div>` +
    `<div class="summary-card">` +
    `<span class="label">全体の残り</span>` +
    `<span id="plan-remaining-value" class="value">${escapeHtml(planRemainingLabel)}</span>` +
    `</div>`;

  updateProgressPanel(state, els, now);

  if (state.tasks.length === 0) {
    els.tbody.innerHTML = `<tr><td colspan="9" class="empty">タスクを追加してください</td></tr>`;
    els.planRange.textContent = "";
    updateFocusOverlay(state, els, now);
    return;
  }

  const activeId =
    document.activeElement &&
    (document.activeElement.classList.contains("duration-input") ||
      document.activeElement.classList.contains("priority-select") ||
      document.activeElement.classList.contains("deadline-input"))
      ? document.activeElement.closest("tr") && document.activeElement.closest("tr").dataset.id
      : null;
  const activeField =
    activeId && document.activeElement
      ? document.activeElement.classList.contains("priority-select")
        ? "priority"
        : document.activeElement.classList.contains("deadline-input")
          ? "deadline"
          : "duration"
      : null;
  const activeValue = activeId && document.activeElement ? document.activeElement.value : null;

  els.tbody.innerHTML = state.tasks
    .map((task) => {
      const progress = getTaskProgress(task, now);
      const priority = normalizePriority(task.priority);
      const deadlineOverdue =
        task.deadline && deadlineEndOfDay(task.deadline) && deadlineEndOfDay(task.deadline) < now;
      const classes = [];
      if (task.isOverLimit) classes.push("over-limit");
      if (progress.status === "active" && !task.completed) classes.push("is-active-task");
      if (task.completed) classes.push("is-completed-task");
      const rowClass = classes.length ? ` class="${classes.join(" ")}"` : "";
      const disabled = task.completed ? " disabled" : "";
      return (
        `<tr${rowClass} data-id="${task.id}">` +
        `<td data-label="番号">${task.order}</td>` +
        `<td data-label="タスク名">${escapeHtml(task.name)}${task.completed ? "（完了）" : ""}</td>` +
        `<td data-label="優先度">` +
        `<select class="priority-select"${disabled} aria-label="${escapeHtml(task.name)} の優先度">` +
        `<option value="high"${priority === "high" ? " selected" : ""}>高</option>` +
        `<option value="medium"${priority === "medium" ? " selected" : ""}>中</option>` +
        `<option value="low"${priority === "low" ? " selected" : ""}>低</option>` +
        `</select>` +
        `</td>` +
        `<td data-label="締切">` +
        `<input class="deadline-input${deadlineOverdue ? " deadline-overdue" : ""}" type="date" value="${task.deadline || ""}"${disabled} aria-label="${escapeHtml(task.name)} の締切" />` +
        `</td>` +
        `<td data-label="所要時間">` +
        `<input class="duration-input" type="number" min="1" step="1" value="${task.durationMinutes}"${disabled} aria-label="${escapeHtml(task.name)} の所要時間" />` +
        `</td>` +
        `<td data-label="開始時刻">${formatClock(task.startAt, base)}</td>` +
        `<td data-label="終了時刻">${formatClock(task.endAt, base)}</td>` +
        `<td data-label="残り時間"><span class="remaining-cell is-${progress.status}" data-remaining-for="${task.id}">${escapeHtml(progress.label)}</span></td>` +
        `<td data-label="操作">` +
        `<div class="row-actions">` +
        `<button type="button" class="btn small move-up"${task.order === 1 || task.completed ? " disabled" : ""}>上へ</button>` +
        `<button type="button" class="btn small move-down"${task.order === state.tasks.length || task.completed ? " disabled" : ""}>下へ</button>` +
        `<button type="button" class="btn small danger-outline delete">削除</button>` +
        `</div>` +
        `</td>` +
        `</tr>`
      );
    })
    .join("");

  if (activeId && activeField) {
    const selector =
      activeField === "priority"
        ? ".priority-select"
        : activeField === "deadline"
          ? ".deadline-input"
          : ".duration-input";
    const input = els.tbody.querySelector(`tr[data-id="${activeId}"] ${selector}`);
    if (input && !input.disabled) {
      input.focus();
      if (activeValue !== null && activeField === "duration") input.value = activeValue;
    }
  }

  const first = state.tasks[0];
  const last = state.tasks[state.tasks.length - 1];
  if (first && first.startAt && last && last.endAt) {
    els.planRange.textContent =
      `全体: ${formatClock(first.startAt, base)} 〜 ${formatClock(last.endAt, base)}`;
  } else {
    els.planRange.textContent = "開始時刻を決定すると各タスクの時刻が表示されます";
  }

  updateFocusOverlay(state, els, now);
}
