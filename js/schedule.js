/**
 * @fileoverview スケジュール算出と進捗判定。
 * 開始時刻からの連鎖計算、超過フラグ、現在タスクの進捗ステータスを担当する。
 *
 * @see ../docs/詳細設計書.md F-04 / F-06
 */

import { nowDate } from "./util.js";
import { parseTimeToDate, formatRemainingMs, toTotalMinutes } from "./time.js";
import { validateAllocation } from "./allocation.js";

/**
 * 実行順に累積し、総時間を超えたタスクに `isOverLimit` を付ける。
 *
 * @param {number} totalMinutes 総時間（分）
 * @param {import("./types.js").Task[]} tasks タスク一覧
 * @returns {import("./types.js").Task[]} isOverLimit 付きの新配列
 */
export function markOverLimit(totalMinutes, tasks) {
  let cumulative = 0;
  return tasks.map((task) => {
    cumulative += task.durationMinutes;
    return Object.assign({}, task, { isOverLimit: cumulative > totalMinutes });
  });
}

/**
 * 配列順に `order` を 1 始まりで振り直す。
 *
 * @param {import("./types.js").Task[]} tasks タスク一覧
 * @returns {import("./types.js").Task[]} order 更新済み配列
 */
export function reindex(tasks) {
  return tasks.map((task, index) => Object.assign({}, task, { order: index + 1 }));
}

/**
 * 未完了の先頭タスク（現在の実行対象）を返す。
 *
 * @param {import("./types.js").Task[]} tasks タスク一覧
 * @returns {import("./types.js").Task|null} 現在タスク。なければ null
 */
export function getCurrentTask(tasks) {
  return tasks.find((task) => !task.completed) || null;
}

/**
 * 開始時刻を起点に、各タスクの開始・終了を連鎖計算する。
 * 完了タスクは frozen 時刻を維持し、nextAnchor がある場合は
 * 最初の未完了タスクの開始をそこに合わせる。
 *
 * @param {string} startTime 計画開始（HH:mm）
 * @param {import("./types.js").Task[]} tasks タスク一覧
 * @param {Date} [baseDate] 日付基準（省略時は現在）
 * @param {Date|null} [nextAnchor] 「次へ」後の再開時刻
 * @returns {import("./types.js").Task[]} startAt / endAt 更新済み配列
 */
export function recalculateSchedule(startTime, tasks, baseDate, nextAnchor = null) {
  const now = baseDate || nowDate();
  let cursor = parseTimeToDate(startTime, now);
  let appliedAnchor = false;

  return tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((task) => {
      if (task.completed && task.frozenStartAt && task.frozenEndAt) {
        const startAt = new Date(task.frozenStartAt);
        const endAt = new Date(task.frozenEndAt);
        cursor = new Date(endAt);
        return Object.assign({}, task, { startAt, endAt });
      }

      if (!appliedAnchor && nextAnchor && !task.completed) {
        cursor = new Date(nextAnchor);
        appliedAnchor = true;
      }

      if (!cursor) {
        return Object.assign({}, task, { startAt: null, endAt: null });
      }

      const startAt = new Date(cursor);
      const endAt = new Date(cursor.getTime() + task.durationMinutes * 60 * 1000);
      cursor = endAt;
      return Object.assign({}, task, { startAt, endAt });
    });
}

/**
 * 現在時刻に対するタスクの進捗（未開始 / 進行中 / 完了）を求める。
 *
 * @param {import("./types.js").Task} task 対象タスク
 * @param {Date} now 現在時刻
 * @returns {import("./types.js").TaskProgress} 進捗情報
 */
export function getTaskProgress(task, now) {
  if (task.completed) {
    return { status: "done", remainingMs: 0, label: "完了" };
  }
  if (!task.startAt || !task.endAt) {
    return { status: "unknown", remainingMs: null, label: "-" };
  }
  const start = task.startAt.getTime();
  const end = task.endAt.getTime();
  const t = now.getTime();

  if (t < start) {
    return {
      status: "upcoming",
      remainingMs: end - start,
      label: `未開始（${formatRemainingMs(end - start)}）`,
    };
  }
  if (t >= end) {
    return { status: "done", remainingMs: 0, label: "完了" };
  }
  return {
    status: "active",
    remainingMs: end - t,
    label: formatRemainingMs(end - t),
  };
}

/**
 * 未完了計画全体の残り時間（ミリ秒）を返す。
 *
 * @param {import("./types.js").Task[]} tasks タスク一覧
 * @param {Date} now 現在時刻
 * @returns {number|null} 残り ms。未完了なしは 0、終了不明は null
 */
export function getPlanRemainingMs(tasks, now) {
  const incomplete = tasks.filter((t) => !t.completed);
  if (!incomplete.length) return 0;
  const last = incomplete[incomplete.length - 1];
  if (!last || !last.endAt) return null;
  return Math.max(0, last.endAt.getTime() - now.getTime());
}

/**
 * 状態から導出値（順序・開始終了・超過・検証）を同期し、state.tasks を更新する。
 *
 * @param {import("./types.js").AppState} state アプリ状態（破壊的に tasks を更新）
 * @param {Date} [baseDate] 計算基準日時
 * @returns {{totalMinutes: number, validation: import("./types.js").ValidationResult}}
 */
export function syncDerived(state, baseDate) {
  const totalMinutes = toTotalMinutes(state.totalHours, state.totalMinutesPart);
  let tasks = reindex(state.tasks);
  tasks = recalculateSchedule(state.startTime, tasks, baseDate, state.nextAnchor);
  tasks = markOverLimit(totalMinutes, tasks);
  state.tasks = tasks;
  return { totalMinutes, validation: validateAllocation(totalMinutes, tasks) };
}
