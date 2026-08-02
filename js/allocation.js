/**
 * @fileoverview 時間割当ロジック。
 * 均等割当、優先度・締切に基づく並び替えと重み按分、割当検証を提供する。
 *
 * @see ../docs/詳細設計書.md F-03
 */

/**
 * 優先度ごとの重みスコア。
 * @type {Readonly<{high: number, medium: number, low: number}>}
 */
export const PRIORITY_SCORE = Object.freeze({ high: 5, medium: 3, low: 1 });

/**
 * 優先度の日本語ラベル。
 * @type {Readonly<{high: string, medium: string, low: string}>}
 */
export const PRIORITY_LABEL = Object.freeze({ high: "高", medium: "中", low: "低" });

/**
 * 優先度文字列を正規化する。不正値は `"medium"`。
 *
 * @param {*} value 入力値
 * @returns {import("./types.js").Priority} 正規化済み優先度
 */
export function normalizePriority(value) {
  if (value === "high" || value === "medium" || value === "low") return value;
  return "medium";
}

/**
 * 締切日（YYYY-MM-DD）のその日 23:59:59.999 を返す。
 *
 * @param {string|null|undefined} deadline 締切日
 * @returns {Date|null} 終端日時。不正・未設定なら null
 */
export function deadlineEndOfDay(deadline) {
  if (!deadline) return null;
  const match = String(deadline).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59, 999);
}

/**
 * 締切の緊急度スコアを返す（大きいほど緊急）。
 *
 * @param {string|null|undefined} deadline 締切日
 * @param {Date} now 現在時刻
 * @returns {number} 1–8 程度のスコア
 */
export function deadlineUrgencyScore(deadline, now) {
  const end = deadlineEndOfDay(deadline);
  if (!end) return 1;
  const days = (end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (days < 0) return 8;
  if (days <= 1) return 5;
  if (days <= 3) return 3;
  if (days <= 7) return 2;
  return 1;
}

/**
 * タスクの割当重み（優先度 × 締切緊急度）。
 *
 * @param {import("./types.js").Task} task 対象タスク
 * @param {Date} now 現在時刻
 * @returns {number} 重み（正の数）
 */
export function taskWeight(task, now) {
  const p = PRIORITY_SCORE[normalizePriority(task.priority)] || 3;
  const d = deadlineUrgencyScore(task.deadline, now);
  return p * d;
}

/**
 * 並び替え用比較関数。締切が近い順 → 優先度が高い順 → order。
 *
 * @param {import("./types.js").Task} a
 * @param {import("./types.js").Task} b
 * @param {Date} now
 * @returns {number} Array#sort 向け比較結果
 */
export function compareByPriorityDeadline(a, b, now) {
  const aEnd = deadlineEndOfDay(a.deadline);
  const bEnd = deadlineEndOfDay(b.deadline);
  if (aEnd && bEnd && aEnd.getTime() !== bEnd.getTime()) {
    return aEnd.getTime() - bEnd.getTime();
  }
  if (aEnd && !bEnd) return -1;
  if (!aEnd && bEnd) return 1;
  const pa = PRIORITY_SCORE[normalizePriority(a.priority)] || 3;
  const pb = PRIORITY_SCORE[normalizePriority(b.priority)] || 3;
  if (pb !== pa) return pb - pa;
  return (a.order || 0) - (b.order || 0);
}

/**
 * 総時間をタスク数で均等分割する（余りは先頭から +1）。
 *
 * @param {number} totalMinutes 総時間（分）
 * @param {number} taskCount タスク数
 * @returns {number[]} 各タスクの所要分
 */
export function allocateEvenly(totalMinutes, taskCount) {
  if (taskCount <= 0) return [];
  const base = Math.floor(totalMinutes / taskCount);
  const remainder = totalMinutes % taskCount;
  return Array.from({ length: taskCount }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * 重みに応じて総時間を整数分で按分する（最大剰余法）。
 * 可能なら各要素最低 1 分を保証する。
 *
 * @param {number} totalMinutes 配分する総分数
 * @param {number[]} weights 各タスクの重み
 * @returns {number[]} 各タスクの所要分（合計は可能な限り totalMinutes）
 */
export function allocateByWeights(totalMinutes, weights) {
  const n = weights.length;
  if (n <= 0) return [];
  if (totalMinutes < n) {
    return Array.from({ length: n }, (_, i) => (i < totalMinutes ? 1 : 0));
  }
  const sumW = weights.reduce((s, w) => s + w, 0) || n;
  const exact = weights.map((w) => (totalMinutes * w) / sumW);
  const floors = exact.map((v) => Math.floor(v));
  let used = floors.reduce((s, v) => s + v, 0);
  for (let i = 0; i < n; i += 1) {
    if (floors[i] < 1) {
      floors[i] = 1;
      used += 1;
    }
  }
  while (used > totalMinutes) {
    let idx = -1;
    let best = -1;
    for (let i = 0; i < n; i += 1) {
      if (floors[i] > 1 && floors[i] > best) {
        best = floors[i];
        idx = i;
      }
    }
    if (idx < 0) break;
    floors[idx] -= 1;
    used -= 1;
  }
  let remain = totalMinutes - used;
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && remain > 0; k += 1) {
    floors[order[k].i] += 1;
    remain -= 1;
  }
  return floors;
}

/**
 * 優先度・締切で未完了タスクを並べ替え、残予算を重み按分する。
 * 完了済みタスクは先頭に維持し、所要時間は変更しない。
 *
 * @param {number} totalMinutes 計画の総時間（分）
 * @param {import("./types.js").Task[]} tasks 全タスク
 * @param {Date} now 現在時刻（緊急度計算用）
 * @returns {import("./types.js").PriorityAllocationResult} 更新結果
 */
export function allocateByPriorityAndDeadline(totalMinutes, tasks, now) {
  const completed = tasks.filter((t) => t.completed);
  const incomplete = tasks.filter((t) => !t.completed).slice();
  incomplete.sort((a, b) => compareByPriorityDeadline(a, b, now));

  const completedSum = completed.reduce((s, t) => s + t.durationMinutes, 0);
  let budget = totalMinutes - completedSum;
  if (budget < incomplete.length) {
    budget = totalMinutes;
  }
  if (incomplete.length === 0) {
    return { tasks: tasks.slice(), error: null };
  }
  if (budget < incomplete.length) {
    return {
      tasks: null,
      error: "割当可能な残時間がタスク数より少ないです",
    };
  }

  const weights = incomplete.map((t) => taskWeight(t, now));
  const parts = allocateByWeights(budget, weights);
  const nextIncomplete = incomplete.map((task, i) =>
    Object.assign({}, task, { durationMinutes: parts[i] })
  );
  return { tasks: completed.concat(nextIncomplete), error: null };
}

/**
 * 総時間に対する割当合計の過不足を検証する。
 *
 * @param {number} totalMinutes 総時間（分）
 * @param {import("./types.js").Task[]} tasks タスク一覧
 * @returns {import("./types.js").ValidationResult} 検証結果
 */
export function validateAllocation(totalMinutes, tasks) {
  const allocatedSum = tasks.reduce((sum, t) => sum + t.durationMinutes, 0);
  const remaining = totalMinutes - allocatedSum;
  let status = "ok";
  if (remaining > 0) status = "under";
  if (remaining < 0) status = "over";
  return { allocatedSum, remaining, status };
}
