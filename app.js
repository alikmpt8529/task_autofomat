(() => {
  const state = {
    totalHours: 2,
    totalMinutesPart: 30,
    startTime: "09:00",
    tasks: [],
    /** Date | null — 次タスク以降の開始アンカー（次へ押下時に現在時刻を設定） */
    nextAnchor: null,
  };

  const els = {
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
    clearTasks: document.getElementById("clear-tasks"),
    summary: document.getElementById("summary"),
    tbody: document.getElementById("task-tbody"),
    planRange: document.getElementById("plan-range"),
    statusToast: document.getElementById("status-toast"),
    progressStatus: document.getElementById("progress-status"),
    progressCurrent: document.getElementById("progress-current"),
    nextTaskBtn: document.getElementById("next-task-btn"),
  };

  let toastTimer = null;

  function uid() {
    return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowDate() {
    return new Date();
  }

  function formatNowClock(date) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function toTotalMinutes(hours, minutes) {
    return Math.max(0, (Number(hours) || 0) * 60 + (Number(minutes) || 0));
  }

  function formatDuration(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h > 0 && m > 0) return `${h}時間${m}分`;
    if (h > 0) return `${h}時間`;
    return `${m}分`;
  }

  function formatRemainingMs(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}時間${m}分${String(s).padStart(2, "0")}秒`;
    if (m > 0) return `${m}分${String(s).padStart(2, "0")}秒`;
    return `${s}秒`;
  }

  function normalizeTimeValue(value) {
    if (!value) return "";
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return "";
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h < 0 || h > 23 || m < 0 || m > 59) return "";
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function parseTimeToDate(hhmm, baseDate) {
    const normalized = normalizeTimeValue(hhmm);
    if (!normalized) return null;
    const [h, m] = normalized.split(":").map(Number);
    const d = new Date(baseDate || nowDate());
    d.setHours(h, m, 0, 0);
    return d;
  }

  function formatClock(date, baseDate) {
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

  function allocateEvenly(totalMinutes, taskCount) {
    if (taskCount <= 0) return [];
    const base = Math.floor(totalMinutes / taskCount);
    const remainder = totalMinutes % taskCount;
    return Array.from({ length: taskCount }, (_, i) => base + (i < remainder ? 1 : 0));
  }

  function validateAllocation(totalMinutes, tasks) {
    const allocatedSum = tasks.reduce((sum, t) => sum + t.durationMinutes, 0);
    const remaining = totalMinutes - allocatedSum;
    let status = "ok";
    if (remaining > 0) status = "under";
    if (remaining < 0) status = "over";
    return { allocatedSum, remaining, status };
  }

  function markOverLimit(totalMinutes, tasks) {
    let cumulative = 0;
    return tasks.map((task) => {
      cumulative += task.durationMinutes;
      return Object.assign({}, task, { isOverLimit: cumulative > totalMinutes });
    });
  }

  function reindex(tasks) {
    return tasks.map((task, index) => Object.assign({}, task, { order: index + 1 }));
  }

  function getCurrentTask(tasks) {
    return tasks.find((task) => !task.completed) || null;
  }

  function recalculateSchedule(startTime, tasks, baseDate) {
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

        if (!appliedAnchor && state.nextAnchor && !task.completed) {
          cursor = new Date(state.nextAnchor);
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
   * status: upcoming | active | done | unknown
   */
  function getTaskProgress(task, now) {
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

  function getPlanRemainingMs(tasks, now) {
    const incomplete = tasks.filter((t) => !t.completed);
    if (!incomplete.length) return 0;
    const last = incomplete[incomplete.length - 1];
    if (!last || !last.endAt) return null;
    return Math.max(0, last.endAt.getTime() - now.getTime());
  }

  function syncDerived(baseDate) {
    const totalMinutes = toTotalMinutes(state.totalHours, state.totalMinutesPart);
    let tasks = reindex(state.tasks);
    tasks = recalculateSchedule(state.startTime, tasks, baseDate);
    tasks = markOverLimit(totalMinutes, tasks);
    state.tasks = tasks;
    return { totalMinutes, validation: validateAllocation(totalMinutes, tasks) };
  }

  function showError(el, message) {
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function showToast(message) {
    if (!els.statusToast) return;
    els.statusToast.textContent = message;
    els.statusToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.statusToast.hidden = true;
    }, 2000);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function updateNowClock(now) {
    const text = formatNowClock(now);
    els.nowTime.textContent = text;
    els.nowTime.setAttribute("datetime", now.toISOString());
  }

  function updateProgressPanel(now) {
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

  function updateLiveRemaining(now) {
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

    updateProgressPanel(now);
  }

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

  function goToNextTask() {
    const now = nowDate();
    syncDerived(now);
    const current = getCurrentTask(state.tasks);
    if (!current) {
      showToast("進めるタスクがありません");
      return;
    }

    const progress = getTaskProgress(current, now);
    if (progress.status === "upcoming" || progress.status === "unknown") {
      showToast("まだ開始前です。開始時刻を待つか現在時刻を取得してください");
      return;
    }

    const startAt = current.startAt ? new Date(current.startAt) : new Date(now);
    const endAt =
      progress.status === "done" && current.endAt
        ? new Date(current.endAt)
        : new Date(now);

    current.completed = true;
    current.frozenStartAt = startAt;
    current.frozenEndAt = endAt;

    const next = getCurrentTask(state.tasks);
    if (next) {
      state.nextAnchor = new Date(now);
      render();
      showToast(`「${current.name}」完了 → 次は「${next.name}」`);
      const nextRow = els.tbody.querySelector(`tr[data-id="${next.id}"]`);
      if (nextRow) {
        nextRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else {
      state.nextAnchor = null;
      render();
      showToast("すべてのタスクが完了しました");
    }
  }

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
    render();
    showToast(`総時間を ${formatDuration(totalMinutes)} に決定しました`);
    return true;
  }

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
    render();
    showToast(`開始時刻を ${normalized} に決定しました`);
    return true;
  }

  function useCurrentTimeAsStart() {
    const now = nowDate();
    const normalized = formatNowClock(now).slice(0, 5);
    state.startTime = normalized;
    els.startTime.value = normalized;
    resetProgressState();
    showError(els.startError, "");
    render();
    showToast(`現在時刻 ${normalized} を開始時刻に設定しました`);
  }

  function addTask() {
    const name = els.taskName.value.trim();
    const durationMinutes = Math.floor(Number(els.taskDuration.value));

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
      startAt: null,
      endAt: null,
      isOverLimit: false,
      completed: false,
      frozenStartAt: null,
      frozenEndAt: null,
    });
    els.taskName.value = "";
    els.taskName.focus();
    render();
    showToast(`「${name}」を追加しました`);
    return true;
  }

  function render() {
    const now = nowDate();
    updateNowClock(now);

    const { totalMinutes, validation } = syncDerived(now);
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

    updateProgressPanel(now);

    if (state.tasks.length === 0) {
      els.tbody.innerHTML = `<tr><td colspan="7" class="empty">タスクを追加してください</td></tr>`;
      els.planRange.textContent = "";
      return;
    }

    const activeId =
      document.activeElement && document.activeElement.classList.contains("duration-input")
        ? document.activeElement.closest("tr") && document.activeElement.closest("tr").dataset.id
        : null;
    const activeValue = activeId && document.activeElement ? document.activeElement.value : null;
    const activeSelectionStart =
      activeId && document.activeElement ? document.activeElement.selectionStart : null;
    const activeSelectionEnd =
      activeId && document.activeElement ? document.activeElement.selectionEnd : null;

    els.tbody.innerHTML = state.tasks
      .map((task) => {
        const progress = getTaskProgress(task, now);
        const classes = [];
        if (task.isOverLimit) classes.push("over-limit");
        if (progress.status === "active" && !task.completed) classes.push("is-active-task");
        if (task.completed) classes.push("is-completed-task");
        const rowClass = classes.length ? ` class="${classes.join(" ")}"` : "";
        return (
          `<tr${rowClass} data-id="${task.id}">` +
          `<td data-label="番号">${task.order}</td>` +
          `<td data-label="タスク名">${escapeHtml(task.name)}${task.completed ? "（完了）" : ""}</td>` +
          `<td data-label="所要時間">` +
          `<input class="duration-input" type="number" min="1" step="1" value="${task.durationMinutes}" ${task.completed ? "disabled " : ""}aria-label="${escapeHtml(task.name)} の所要時間" />` +
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

    if (activeId) {
      const input = els.tbody.querySelector(`tr[data-id="${activeId}"] .duration-input`);
      if (input && !input.disabled) {
        input.focus();
        if (activeValue !== null) input.value = activeValue;
        if (activeSelectionStart !== null && activeSelectionEnd !== null) {
          try {
            input.setSelectionRange(activeSelectionStart, activeSelectionEnd);
          } catch (_) {
            /* ignore */
          }
        }
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
  }

  function tick() {
    const now = nowDate();
    updateNowClock(now);
    syncDerived(now);
    updateLiveRemaining(now);
  }

  function moveTask(id, delta) {
    const index = state.tasks.findIndex((t) => t.id === id);
    const next = index + delta;
    if (index < 0 || next < 0 || next >= state.tasks.length) return;
    if (state.tasks[index].completed || state.tasks[next].completed) return;
    const copy = state.tasks.slice();
    const item = copy.splice(index, 1)[0];
    copy.splice(next, 0, item);
    state.tasks = copy;
    render();
  }

  function commitDurationInput(input) {
    const row = input.closest("tr");
    const task = state.tasks.find((t) => t.id === (row && row.dataset.id));
    if (!task || task.completed) return;
    const value = Math.floor(Number(input.value));
    if (!Number.isFinite(value) || value < 1) {
      input.value = String(task.durationMinutes);
      showToast("所要時間は1分以上で入力してください");
      return;
    }
    if (value === task.durationMinutes) return;
    task.durationMinutes = value;
    render();
    showToast(`所要時間を ${value} 分に更新しました`);
  }

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
    render();
    showToast("総時間を均等に割り振りました");
  });

  els.clearTasks.addEventListener("click", () => {
    if (state.tasks.length === 0) return;
    if (!window.confirm("すべてのタスクを削除しますか？")) return;
    state.tasks = [];
    state.nextAnchor = null;
    showError(els.formError, "");
    render();
    showToast("タスクをすべて削除しました");
  });

  els.tbody.addEventListener("change", (event) => {
    const input = event.target.closest(".duration-input");
    if (!input) return;
    commitDurationInput(input);
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
      render();
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

  els.totalHours.value = String(state.totalHours);
  els.totalMinutes.value = String(state.totalMinutesPart);
  els.startTime.value = state.startTime;
  render();
  setInterval(tick, 1000);
})();
