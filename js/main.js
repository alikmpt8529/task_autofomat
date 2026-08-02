/**
 * @fileoverview アプリケーションエントリ。
 * 状態初期化・ユーザー操作のイベント配線・1 秒タイマーを起動する。
 *
 * モジュール構成の起点。ビジネスロジックは各ドメインモジュールに委譲する。
 */

import { uid, nowDate } from "./util.js";
import {
  toTotalMinutes,
  formatDuration,
  formatNowClock,
  normalizeTimeValue,
} from "./time.js";
import {
  allocateEvenly,
  allocateByPriorityAndDeadline,
  normalizePriority,
  PRIORITY_LABEL,
} from "./allocation.js";
import { syncDerived, getCurrentTask, getTaskProgress } from "./schedule.js";
import { createState, createElements, showError, showToast } from "./dom.js";
import { render, updateNowClock, updateLiveRemaining } from "./render.js";
import { updateFocusOverlay, setFocusMode, shouldShowFocusOverlay } from "./focus.js";

/** @type {import("./types.js").AppState} */
const state = createState();
/** @type {import("./types.js").DomElements} */
const els = createElements();

/**
 * 開始時刻変更時などに、完了状態と再開アンカーをクリアする。
 *
 * @returns {void}
 */
function resetProgressState() {
  state.nextAnchor = null;
  state.tasks = state.tasks.map((task) =>
    Object.assign({}, task, {
      completed: false,
      frozenStartAt: null,
      frozenEndAt: null,
    })
  );
}

/**
 * 現在タスクを完了にし、次タスクへ進む（残りは現在時刻から再スケジュール）。
 *
 * @returns {void}
 */
function goToNextTask() {
  const now = nowDate();
  syncDerived(state, now);
  const current = getCurrentTask(state.tasks);
  if (!current) {
    showToast(els, "進めるタスクがありません");
    return;
  }

  const progress = getTaskProgress(current, now);
  if (progress.status === "upcoming" || progress.status === "unknown") {
    showToast(els, "まだ開始前です。開始時刻を待つか現在時刻を取得してください");
    return;
  }

  const startAt = current.startAt ? new Date(current.startAt) : new Date(now);
  const endAt =
    progress.status === "done" && current.endAt ? new Date(current.endAt) : new Date(now);

  current.completed = true;
  current.frozenStartAt = startAt;
  current.frozenEndAt = endAt;

  const next = getCurrentTask(state.tasks);
  if (next) {
    state.nextAnchor = new Date(now);
    render(state, els);
    showToast(els, `「${current.name}」完了 → 次は「${next.name}」`);
    const nextRow = els.tbody.querySelector(`tr[data-id="${next.id}"]`);
    if (nextRow) {
      nextRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  } else {
    state.nextAnchor = null;
    render(state, els);
    showToast(els, "すべてのタスクが完了しました");
  }
}

/**
 * 総時間フォームを検証して state に反映する。
 *
 * @returns {boolean} 成功時 true
 */
function applyTotalTime() {
  const hours = Math.max(0, Math.floor(Number(els.totalHours.value)));
  const minutes = Math.floor(Number(els.totalMinutes.value));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    showError(els.totalError, "時間と分は数値で入力してください");
    return false;
  }
  if (minutes < 0 || minutes > 59) {
    showError(els.totalError, "分は 0〜59 で入力してください");
    return false;
  }
  const totalMinutes = toTotalMinutes(hours, minutes);
  if (totalMinutes < 1) {
    showError(els.totalError, "総時間は1分以上を指定してください");
    return false;
  }

  state.totalHours = hours;
  state.totalMinutesPart = minutes;
  els.totalHours.value = String(hours);
  els.totalMinutes.value = String(minutes);
  showError(els.totalError, "");
  render(state, els);
  showToast(els, `総時間を ${formatDuration(totalMinutes)} に決定しました`);
  return true;
}

/**
 * 開始時刻フォームを検証して state に反映し、進捗をリセットする。
 *
 * @returns {boolean} 成功時 true
 */
function applyStartTime() {
  const normalized = normalizeTimeValue(els.startTime.value);
  if (!normalized) {
    showError(els.startError, "開始時刻を入力して決定してください");
    return false;
  }
  state.startTime = normalized;
  els.startTime.value = normalized;
  resetProgressState();
  showError(els.startError, "");
  render(state, els);
  showToast(els, `開始時刻を ${normalized} に決定しました`);
  return true;
}

/**
 * 現在時刻を開始時刻として設定する。
 *
 * @returns {void}
 */
function useCurrentTimeAsStart() {
  const now = nowDate();
  const normalized = formatNowClock(now).slice(0, 5);
  state.startTime = normalized;
  els.startTime.value = normalized;
  resetProgressState();
  showError(els.startError, "");
  render(state, els);
  showToast(els, `現在時刻 ${normalized} を開始時刻に設定しました`);
}

/**
 * タスク追加フォームから新しいタスクを一覧に追加する。
 *
 * @returns {boolean} 成功時 true
 */
function addTask() {
  const name = els.taskName.value.trim();
  const durationMinutes = Math.floor(Number(els.taskDuration.value));
  const priority = normalizePriority(els.taskPriority.value);
  const deadline = els.taskDeadline.value || null;

  if (!name) {
    showError(els.formError, "タスク名を入力してください");
    return false;
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes < 1) {
    showError(els.formError, "所要時間は1分以上を指定してください");
    return false;
  }

  showError(els.formError, "");
  state.tasks.push({
    id: uid(),
    order: state.tasks.length + 1,
    name,
    durationMinutes,
    priority,
    deadline,
    startAt: null,
    endAt: null,
    isOverLimit: false,
    completed: false,
    frozenStartAt: null,
    frozenEndAt: null,
  });
  els.taskName.value = "";
  els.taskPriority.value = "medium";
  els.taskDeadline.value = "";
  els.taskName.focus();
  render(state, els);
  showToast(els, `「${name}」を追加しました`);
  return true;
}

/**
 * 未完了タスクの順序を上下に入れ替える。
 *
 * @param {string} id タスク ID
 * @param {number} delta `-1` で上へ、`1` で下へ
 * @returns {void}
 */
function moveTask(id, delta) {
  const index = state.tasks.findIndex((t) => t.id === id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= state.tasks.length) return;
  if (state.tasks[index].completed || state.tasks[next].completed) return;
  const copy = state.tasks.slice();
  const item = copy.splice(index, 1)[0];
  copy.splice(next, 0, item);
  state.tasks = copy;
  render(state, els);
}

/**
 * 表内の所要時間入力を確定し state に反映する。
 *
 * @param {HTMLInputElement} input 所要時間 input
 * @returns {void}
 */
function commitDurationInput(input) {
  const row = input.closest("tr");
  const task = state.tasks.find((t) => t.id === (row && row.dataset.id));
  if (!task || task.completed) return;
  const value = Math.floor(Number(input.value));
  if (!Number.isFinite(value) || value < 1) {
    input.value = String(task.durationMinutes);
    showToast(els, "所要時間は1分以上で入力してください");
    return;
  }
  if (value === task.durationMinutes) return;
  task.durationMinutes = value;
  render(state, els);
  showToast(els, `所要時間を ${value} 分に更新しました`);
}

/**
 * 1 秒ごとのティック。時計・導出値・ライブ残りを更新する。
 *
 * @returns {void}
 */
function tick() {
  const now = nowDate();
  updateNowClock(els, now);
  syncDerived(state, now);
  updateLiveRemaining(state, els, now);
  updateFocusOverlay(state, els, now);
}

/**
 * フォーム・ボタン・表操作のイベントリスナーを登録する。
 *
 * @returns {void}
 */
function bindEvents() {
  els.totalForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyTotalTime();
  });

  els.startForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyStartTime();
  });

  els.useNow.addEventListener("click", () => {
    useCurrentTimeAsStart();
  });

  els.nextTaskBtn.addEventListener("click", () => {
    goToNextTask();
  });

  els.focusNextBtn.addEventListener("click", () => {
    goToNextTask();
  });

  els.focusMode.addEventListener("change", () => {
    setFocusMode(state, els, els.focusMode.checked, (now) =>
      updateFocusOverlay(state, els, now)
    );
  });

  els.focusExitBtn.addEventListener("click", () => {
    setFocusMode(state, els, false, (now) => updateFocusOverlay(state, els, now));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.focusMode && shouldShowFocusOverlay(state, nowDate())) {
      setFocusMode(state, els, false, (now) => updateFocusOverlay(state, els, now));
    }
  });

  els.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addTask();
  });

  els.taskName.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (event.isComposing || event.keyCode === 229) {
      event.preventDefault();
    }
  });

  els.allocateEvenly.addEventListener("click", () => {
    if (state.tasks.length === 0) {
      showError(els.formError, "先にタスクを追加してください");
      return;
    }
    const totalMinutes = toTotalMinutes(state.totalHours, state.totalMinutesPart);
    if (totalMinutes < state.tasks.length) {
      showError(els.formError, "総時間がタスク数より少ないため均等割当できません");
      return;
    }
    showError(els.formError, "");
    const parts = allocateEvenly(totalMinutes, state.tasks.length);
    state.tasks = state.tasks.map((task, i) =>
      Object.assign({}, task, { durationMinutes: parts[i] })
    );
    state.nextAnchor = null;
    render(state, els);
    showToast(els, "総時間を均等に割り振りました");
  });

  els.allocatePriority.addEventListener("click", () => {
    if (state.tasks.length === 0) {
      showError(els.formError, "先にタスクを追加してください");
      return;
    }
    const incomplete = state.tasks.filter((t) => !t.completed);
    if (incomplete.length === 0) {
      showError(els.formError, "未完了のタスクがありません");
      return;
    }
    const totalMinutes = toTotalMinutes(state.totalHours, state.totalMinutesPart);
    const result = allocateByPriorityAndDeadline(totalMinutes, state.tasks, nowDate());
    if (result.error) {
      showError(els.formError, result.error);
      return;
    }
    showError(els.formError, "");
    state.tasks = result.tasks;
    state.nextAnchor = null;
    render(state, els);
    showToast(els, "優先度・締切に基づいて並び替えと時間割当を行いました");
  });

  els.clearTasks.addEventListener("click", () => {
    if (state.tasks.length === 0) return;
    if (!window.confirm("すべてのタスクを削除しますか？")) return;
    state.tasks = [];
    state.nextAnchor = null;
    showError(els.formError, "");
    render(state, els);
    showToast(els, "タスクをすべて削除しました");
  });

  els.tbody.addEventListener("change", (event) => {
    const row = event.target.closest("tr");
    const id = row && row.dataset.id;
    const task = state.tasks.find((t) => t.id === id);
    if (!task || task.completed) return;

    if (event.target.classList.contains("duration-input")) {
      commitDurationInput(event.target);
      return;
    }
    if (event.target.classList.contains("priority-select")) {
      task.priority = normalizePriority(event.target.value);
      render(state, els);
      showToast(els, `優先度を「${PRIORITY_LABEL[task.priority]}」に更新しました`);
      return;
    }
    if (event.target.classList.contains("deadline-input")) {
      task.deadline = event.target.value || null;
      render(state, els);
      showToast(
        els,
        task.deadline ? `締切を ${task.deadline} に設定しました` : "締切をクリアしました"
      );
    }
  });

  els.tbody.addEventListener("keydown", (event) => {
    const input = event.target.closest(".duration-input");
    if (!input) return;
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
      commitDurationInput(input);
    }
  });

  els.tbody.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const row = button.closest("tr");
    const id = row && row.dataset.id;
    if (!id) return;

    if (button.classList.contains("delete")) {
      state.tasks = state.tasks.filter((t) => t.id !== id);
      if (!state.tasks.some((t) => !t.completed)) {
        state.nextAnchor = null;
      }
      render(state, els);
      return;
    }
    if (button.classList.contains("move-up")) {
      moveTask(id, -1);
      return;
    }
    if (button.classList.contains("move-down")) {
      moveTask(id, 1);
    }
  });
}

bindEvents();
els.totalHours.value = String(state.totalHours);
els.totalMinutes.value = String(state.totalMinutesPart);
els.startTime.value = state.startTime;
render(state, els);
setInterval(tick, 1000);
