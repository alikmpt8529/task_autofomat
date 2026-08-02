/**
 * @fileoverview 時刻・所要時間の変換と表示整形。
 * HH:mm の正規化、分数表示、カウントダウン表示などを担当する。
 */

import { nowDate } from "./util.js";

/**
 * 日時を `HH:mm:ss` 形式の文字列にする。
 *
 * @param {Date} date 対象日時
 * @returns {string} 例: `"15:04:09"`
 */
export function formatNowClock(date) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * 時と分から総分数を算出する。
 *
 * @param {number} hours 時間（0 以上）
 * @param {number} minutes 分（通常 0–59）
 * @returns {number} 総分数（負にならない）
 */
export function toTotalMinutes(hours, minutes) {
  return Math.max(0, (Number(hours) || 0) * 60 + (Number(minutes) || 0));
}

/**
 * 分数を日本語の所要時間表記にする。
 *
 * @param {number} totalMinutes 総分数
 * @returns {string} 例: `"2時間30分"` / `"45分"`
 */
export function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

/**
 * ミリ秒を日本語の残り時間表記にする。
 *
 * @param {number} ms 残りミリ秒
 * @returns {string} 例: `"12分05秒"`
 */
export function formatRemainingMs(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}時間${m}分${String(s).padStart(2, "0")}秒`;
  if (m > 0) return `${m}分${String(s).padStart(2, "0")}秒`;
  return `${s}秒`;
}

/**
 * ミリ秒をフォーカスモード用のデジタル時計表記にする。
 *
 * @param {number} ms 残りミリ秒
 * @returns {string} 例: `"12:05"` または `"1:05:00"`
 */
export function formatTimerClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * ブラウザの time 入力値などを `HH:mm` に正規化する。
 * `HH:mm:ss` も受け付ける。不正値は空文字。
 *
 * @param {string} value 入力文字列
 * @returns {string} 正規化済み `HH:mm`、または `""`
 */
export function normalizeTimeValue(value) {
  if (!value) return "";
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return "";
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return "";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * `HH:mm` を、基準日（省略時は今日）の Date に変換する。
 *
 * @param {string} hhmm `HH:mm`
 * @param {Date} [baseDate] 日付の基準
 * @returns {Date|null} 変換結果。不正なら null
 */
export function parseTimeToDate(hhmm, baseDate) {
  const normalized = normalizeTimeValue(hhmm);
  if (!normalized) return null;
  const [h, m] = normalized.split(":").map(Number);
  const d = new Date(baseDate || nowDate());
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * 開始・終了列向けに時刻を表示用文字列にする。
 * 基準日と日付が異なれば「翌日」を付ける。
 *
 * @param {Date|null|undefined} date 表示対象
 * @param {Date|null|undefined} baseDate 計画開始日など比較基準
 * @returns {string} 例: `"09:30"` / `"翌日 01:15"` / `"-"`
 */
export function formatClock(date, baseDate) {
  if (!date) return "-";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const sameDay =
    baseDate &&
    date.getFullYear() === baseDate.getFullYear() &&
    date.getMonth() === baseDate.getMonth() &&
    date.getDate() === baseDate.getDate();
  return sameDay ? `${hh}:${mm}` : `翌日 ${hh}:${mm}`;
}
