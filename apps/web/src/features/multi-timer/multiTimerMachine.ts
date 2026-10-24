/**
 * 타이머·뽀모도로 모드의 상태 전이 순수 함수
 *
 * 시계는 남은 시간과 흐르기 시작한 벽시계 시각(anchor)만 들고 있다.
 * 틱 횟수를 세지 않으므로 백그라운드에서 타이머가 늦게 돌아도 시간이 어긋나지 않는다.
 */
import { clampBreakMin, clampFocusMin, clampTimerSec } from "./multiTimerSettings";
import type { MultiTimerSettings } from "./multiTimerSettings";

export type ModeKind = "timer" | "pomodoro";
export type PomodoroPhase = "focus" | "break";
export type ModeStatus = "setup" | "running" | "paused" | "done";
export type ModeAlarm = "timer-done" | "focus-done" | "break-done";

export interface ModeClock {
  readonly remainingMs: number;
  /**
   * 흐르기 시작한 벽시계 시각
   *
   * 멈춰 있으면 null이다.
   */
  readonly anchorMs: number | null;
}

export interface ModeState {
  readonly kind: ModeKind;
  readonly status: ModeStatus;
  readonly phase: PomodoroPhase;
  readonly clock: ModeClock;
  readonly settings: MultiTimerSettings;
}

export function phaseDurationMs(
  state: Pick<ModeState, "kind" | "settings">,
  phase: PomodoroPhase,
): number {
  if (state.kind === "timer") return state.settings.timerSec * 1000;
  return (phase === "focus" ? state.settings.focusMin : state.settings.breakMin) * 60_000;
}

export function createModeState(kind: ModeKind, settings: MultiTimerSettings): ModeState {
  return {
    kind,
    status: "setup",
    phase: "focus",
    clock: { remainingMs: phaseDurationMs({ kind, settings }, "focus"), anchorMs: null },
    settings,
  };
}

export function updateModeSettings(
  state: ModeState,
  patch: Partial<MultiTimerSettings>,
): ModeState {
  if (state.status !== "setup") return state;
  const settings: MultiTimerSettings = {
    timerSec: clampTimerSec(patch.timerSec ?? state.settings.timerSec),
    focusMin: clampFocusMin(patch.focusMin ?? state.settings.focusMin),
    breakMin: clampBreakMin(patch.breakMin ?? state.settings.breakMin),
  };
  return {
    ...state,
    settings,
    clock: {
      remainingMs: phaseDurationMs({ kind: state.kind, settings }, "focus"),
      anchorMs: null,
    },
  };
}

export function startMode(state: ModeState): ModeState {
  if (state.status !== "setup") return state;
  const first = phaseDurationMs(state, "focus");
  if (first <= 0) return state;
  return {
    ...state,
    status: "running",
    phase: "focus",
    clock: { remainingMs: first, anchorMs: null },
  };
}

export function remainingMs(state: ModeState, nowMs: number): number {
  const { remainingMs: base, anchorMs } = state.clock;
  if (anchorMs === null) return base;
  return Math.max(0, base - (nowMs - anchorMs));
}

export function pauseMode(state: ModeState, nowMs: number): ModeState {
  if (state.status !== "running") return state;
  return {
    ...state,
    status: "paused",
    clock: { remainingMs: remainingMs(state, nowMs), anchorMs: null },
  };
}

export function resumeMode(state: ModeState): ModeState {
  if (state.status !== "paused") return state;
  return { ...state, status: "running" };
}

export function backToSetup(state: ModeState): ModeState {
  return createModeState(state.kind, state.settings);
}

/**
 * 벽시계에 맞춘 시계 동기화
 *
 * held 는 세션이 멈춘 동안 모드 시간도 함께 세우기 위한 신호다.
 * 단계는 한 번의 호출에서 최대 한 번만 넘겨, 오래 비운 뒤에도 알림이 쏟아지지 않게 한다.
 */
export function syncMode(
  state: ModeState,
  nowMs: number,
  held: boolean,
): { state: ModeState; alarms: readonly ModeAlarm[] } {
  const { remainingMs: base, anchorMs } = state.clock;
  const flowing = state.status === "running" && !held;

  if (!flowing) {
    if (anchorMs === null) return { state, alarms: [] };
    return {
      state: { ...state, clock: { remainingMs: remainingMs(state, nowMs), anchorMs: null } },
      alarms: [],
    };
  }

  if (anchorMs === null) {
    return { state: { ...state, clock: { remainingMs: base, anchorMs: nowMs } }, alarms: [] };
  }

  const left = base - (nowMs - anchorMs);
  if (left > 0) return { state, alarms: [] };

  if (state.kind === "timer") {
    return {
      state: { ...state, status: "done", clock: { remainingMs: 0, anchorMs: null } },
      alarms: ["timer-done"],
    };
  }

  const nextPhase: PomodoroPhase = state.phase === "focus" ? "break" : "focus";
  const nextFull = phaseDurationMs(state, nextPhase);
  // 늦게 깨어난 만큼은 다음 단계에서 깎되, 한 단계를 통째로 넘기지는 않는다.
  const carried = nextFull + left;
  return {
    state: {
      ...state,
      phase: nextPhase,
      clock: { remainingMs: carried > 0 ? carried : nextFull, anchorMs: nowMs },
    },
    alarms: [state.phase === "focus" ? "focus-done" : "break-done"],
  };
}
