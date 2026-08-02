/**
 * @fileoverview ドメイン共有型定義（JSDoc / TypeScript 互換）。
 * Java の Javadoc と同様に、エディタ補完とドキュメント生成の根拠になる。
 */

/**
 * タスクの優先度。
 * @typedef {"high"|"medium"|"low"} Priority
 */

/**
 * タスク進捗ステータス。
 * @typedef {"upcoming"|"active"|"done"|"unknown"} TaskProgressStatus
 */

/**
 * 割当検証ステータス。
 * @typedef {"ok"|"under"|"over"} AllocationStatus
 */

/**
 * 計画内の1タスク。
 * @typedef {Object} Task
 * @property {string} id 一意 ID
 * @property {number} order 実行順（1 始まり）
 * @property {string} name タスク名
 * @property {number} durationMinutes 所要時間（分）
 * @property {Priority} [priority] 優先度（既定 medium）
 * @property {string|null} [deadline] 締切日（YYYY-MM-DD）または null
 * @property {Date|null} startAt 開始日時（算出結果）
 * @property {Date|null} endAt 終了日時（算出結果）
 * @property {boolean} [isOverLimit] 累積が総時間超過か
 * @property {boolean} completed 完了済みか
 * @property {Date|null} [frozenStartAt] 完了時に固定した開始
 * @property {Date|null} [frozenEndAt] 完了時に固定した終了
 */

/**
 * アプリ全体の状態。
 * @typedef {Object} AppState
 * @property {number} totalHours 総時間の時
 * @property {number} totalMinutesPart 総時間の分（0–59）
 * @property {string} startTime 計画開始時刻（HH:mm）
 * @property {Task[]} tasks タスク一覧
 * @property {Date|null} nextAnchor 「次へ」後の未完了タスク開始アンカー
 * @property {boolean} focusMode フォーカスモード ON/OFF
 */

/**
 * 割当検証結果。
 * @typedef {Object} ValidationResult
 * @property {number} allocatedSum 割当合計（分）
 * @property {number} remaining 総時間 − 割当合計（分）
 * @property {AllocationStatus} status 過不足ステータス
 */

/**
 * 優先度・締切割当の結果。
 * @typedef {Object} PriorityAllocationResult
 * @property {Task[]|null} tasks 更新後タスク（失敗時 null）
 * @property {string|null} error エラーメッセージ（成功時 null）
 */

/**
 * タスク進捗の表示用情報。
 * @typedef {Object} TaskProgress
 * @property {TaskProgressStatus} status 進捗ステータス
 * @property {number|null} remainingMs 残りミリ秒（不明時 null）
 * @property {string} label 画面表示用ラベル
 */

/**
 * 画面 DOM 参照の束。
 * @typedef {Object} DomElements
 * @property {HTMLElement|null} nowTime
 * @property {HTMLInputElement|null} totalHours
 * @property {HTMLInputElement|null} totalMinutes
 * @property {HTMLElement|null} totalDisplay
 * @property {HTMLFormElement|null} totalForm
 * @property {HTMLInputElement|null} startTime
 * @property {HTMLFormElement|null} startForm
 * @property {HTMLButtonElement|null} useNow
 * @property {HTMLFormElement|null} taskForm
 * @property {HTMLInputElement|null} taskName
 * @property {HTMLInputElement|null} taskDuration
 * @property {HTMLElement|null} formError
 * @property {HTMLElement|null} totalError
 * @property {HTMLElement|null} startError
 * @property {HTMLButtonElement|null} allocateEvenly
 * @property {HTMLButtonElement|null} allocatePriority
 * @property {HTMLButtonElement|null} clearTasks
 * @property {HTMLSelectElement|null} taskPriority
 * @property {HTMLInputElement|null} taskDeadline
 * @property {HTMLElement|null} summary
 * @property {HTMLElement|null} tbody
 * @property {HTMLElement|null} planRange
 * @property {HTMLElement|null} statusToast
 * @property {HTMLElement|null} progressStatus
 * @property {HTMLElement|null} progressCurrent
 * @property {HTMLButtonElement|null} nextTaskBtn
 * @property {HTMLInputElement|null} focusMode
 * @property {HTMLElement|null} focusOverlay
 * @property {HTMLElement|null} focusTaskName
 * @property {HTMLElement|null} focusTimer
 * @property {HTMLElement|null} focusHint
 * @property {HTMLButtonElement|null} focusNextBtn
 * @property {HTMLButtonElement|null} focusExitBtn
 * @property {SVGElement|null} focusRingProgress
 * @property {HTMLElement|null} focusRingWrap
 */

export {};
