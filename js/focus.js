/**
 * @fileoverview フォーカスモード UI。
 * 実行中タスクがあるとき、大型タイマーと進捗リングのみを全画面表示する。
 */

import { formatTimerClock } from "./time.js";
import { getCurrentTask, getTaskProgress } from "./schedule.js";
import { nowDate } from "./util.js";
import { showToast } from "./dom.js";

/**
 * フォーカスオーバーレイを出すべきか判定する。
 * フォーカス ON かつ現在タスクが active / done のとき true。
 *
 * @param {import("./types.js").AppState} state
 * @param {Date} now
 * @returns {boolean}
 */
export function shouldShowFocusOverlay(state, now) {
  if (!state.focusMode) return false;
  const current = getCurrentTask(state.tasks);
  if (!current) return false;
  const progress = getTaskProgress(current, now);
  return progress.status === "active" || progress.status === "done";
}

/**
 * SVG 進捗リングの残り比率を更新する。
 *
 * @param {import("./types.js").DomElements} els
 * @param {number} ratio 残り割合 0–1
 * @param {boolean} isDone 完了時は見た目を変更
 * @returns {void}
 */
function updateFocusRing(els, ratio, isDone) {
  const circumference = 2 * Math.PI * 54;
  const clamped = Math.max(0, Math.min(1, ratio));
  const offset = circumference * (1 - clamped);
  els.focusRingProgress.style.strokeDasharray = String(circumference);
  els.focusRingProgress.style.strokeDashoffset = String(offset);
  els.focusRingWrap.classList.toggle("is-done", !!isDone);
}

/**
 * フォーカスオーバーレイの表示内容を現在時刻に合わせて更新する。
 *
 * @param {import("./types.js").AppState} state
 * @param {import("./types.js").DomElements} els
 * @param {Date} now
 * @returns {void}
 */
export function updateFocusOverlay(state, els, now) {
  const show = shouldShowFocusOverlay(state, now);
  document.body.classList.toggle("focus-active", show);
  els.focusOverlay.hidden = !show;
  els.focusOverlay.setAttribute("aria-hidden", show ? "false" : "true");

  if (!show) {
    els.focusNextBtn.hidden = true;
    return;
  }

  const current = getCurrentTask(state.tasks);
  const progress = getTaskProgress(current, now);
  els.focusTaskName.textContent = `${current.order}. ${current.name}`;

  const totalMs = Math.max(
    1,
    current.endAt && current.startAt
      ? current.endAt.getTime() - current.startAt.getTime()
      : current.durationMinutes * 60 * 1000
  );

  if (progress.status === "active") {
    const ratio = progress.remainingMs / totalMs;
    els.focusTimer.textContent = formatTimerClock(progress.remainingMs);
    els.focusTimer.classList.remove("is-done");
    updateFocusRing(els, ratio, false);
    els.focusHint.textContent = "集中して進めましょう";
    els.focusNextBtn.hidden = false;
    els.focusNextBtn.textContent = "完了して次へ";
    return;
  }

  const hasNext = state.tasks.some((t) => !t.completed && t.id !== current.id);
  els.focusTimer.textContent = "00:00";
  els.focusTimer.classList.add("is-done");
  updateFocusRing(els, 0, true);
  els.focusHint.textContent = hasNext
    ? "時間です。次のタスクへ進んでください"
    : "最後のタスクが完了しました";
  els.focusNextBtn.hidden = false;
  els.focusNextBtn.textContent = hasNext ? "次へ" : "完了にする";
}

/**
 * フォーカスモードの ON/OFF を切り替える。
 *
 * @param {import("./types.js").AppState} state
 * @param {import("./types.js").DomElements} els
 * @param {boolean} enabled ON にするか
 * @param {(now: Date) => void} onOverlayUpdate オーバーレイ再描画コールバック
 * @returns {void}
 */
export function setFocusMode(state, els, enabled, onOverlayUpdate) {
  state.focusMode = !!enabled;
  els.focusMode.checked = state.focusMode;
  onOverlayUpdate(nowDate());
  if (state.focusMode) {
    showToast(els, "フォーカスモード ON — 実行中はタイマーのみ表示");
  } else {
    showToast(els, "フォーカスモード OFF");
  }
}
