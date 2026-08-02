/**
 * @fileoverview DOM 参照と画面フィードバック。
 * 状態オブジェクト生成、要素キャッシュ、エラー表示・トーストを担当する。
 */

/**
 * 初期アプリ状態を生成する。
 *
 * @returns {import("./types.js").AppState} 新規状態
 */
export function createState() {
  return {
    totalHours: 2,
    totalMinutesPart: 30,
    startTime: "09:00",
    tasks: [],
    /** @type {Date|null} */
    nextAnchor: null,
    focusMode: false,
  };
}

/**
 * 画面上の主要 DOM 要素を取得して束ねる。
 * DOMContentLoaded 後（または body 末尾スクリプト）で呼ぶこと。
 *
 * @returns {import("./types.js").DomElements} 要素マップ
 */
export function createElements() {
  return {
    nowTime: document.getElementById("now-time"),
    totalHours: document.getElementById("total-hours"),
    totalMinutes: document.getElementById("total-minutes"),
    totalDisplay: document.getElementById("total-display"),
    totalForm: document.getElementById("total-form"),
    startTime: document.getElementById("start-time"),
    startForm: document.getElementById("start-form"),
    useNow: document.getElementById("use-now"),
    taskForm: document.getElementById("task-form"),
    taskName: document.getElementById("task-name"),
    taskDuration: document.getElementById("task-duration"),
    formError: document.getElementById("form-error"),
    totalError: document.getElementById("total-error"),
    startError: document.getElementById("start-error"),
    allocateEvenly: document.getElementById("allocate-evenly"),
    allocatePriority: document.getElementById("allocate-priority"),
    clearTasks: document.getElementById("clear-tasks"),
    taskPriority: document.getElementById("task-priority"),
    taskDeadline: document.getElementById("task-deadline"),
    summary: document.getElementById("summary"),
    tbody: document.getElementById("task-tbody"),
    planRange: document.getElementById("plan-range"),
    statusToast: document.getElementById("status-toast"),
    progressStatus: document.getElementById("progress-status"),
    progressCurrent: document.getElementById("progress-current"),
    nextTaskBtn: document.getElementById("next-task-btn"),
    focusMode: document.getElementById("focus-mode"),
    focusOverlay: document.getElementById("focus-overlay"),
    focusTaskName: document.getElementById("focus-task-name"),
    focusTimer: document.getElementById("focus-timer"),
    focusHint: document.getElementById("focus-hint"),
    focusNextBtn: document.getElementById("focus-next-btn"),
    focusExitBtn: document.getElementById("focus-exit-btn"),
    focusRingProgress: document.getElementById("focus-ring-progress"),
    focusRingWrap: document.querySelector(".focus-ring-wrap"),
  };
}

/**
 * フィールド横などのエラーメッセージを表示／消去する。
 *
 * @param {HTMLElement|null|undefined} el メッセージ要素
 * @param {string} [message] 空または省略で非表示
 * @returns {void}
 */
export function showError(el, message) {
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

/** @type {ReturnType<typeof setTimeout>|null} */
let toastTimer = null;

/**
 * 画面上部のトーストを一時表示する（約 2 秒）。
 *
 * @param {import("./types.js").DomElements} els DOM 参照
 * @param {string} message 表示文言
 * @returns {void}
 */
export function showToast(els, message) {
  if (!els.statusToast) return;
  els.statusToast.textContent = message;
  els.statusToast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.statusToast.hidden = true;
  }, 2000);
}
