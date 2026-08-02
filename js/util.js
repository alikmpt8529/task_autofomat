/**
 * @fileoverview 共通ユーティリティ。
 * ID 生成・現在時刻・HTML エスケープなど、ドメイン非依存の小さな関数群。
 */

/**
 * タスク等に使う一意 ID を生成する。
 *
 * @returns {string} `task-` 接頭辞付きのユニーク文字列
 */
export function uid() {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 現在日時を返す。テスト差し替えしやすいよう Date 生成をここに集約する。
 *
 * @returns {Date} 現在時刻
 */
export function nowDate() {
  return new Date();
}

/**
 * HTML 挿入前に危険な文字をエスケープする。
 *
 * @param {*} value 任意の値（文字列化される）
 * @returns {string} エスケープ済み文字列
 */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
