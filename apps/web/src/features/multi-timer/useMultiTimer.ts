import { useEffect, useEffectEvent, useRef, useState } from "react";

import type { HapticStyle } from "@focusmakers/types";

import { isSessionHeld, isStudyRunning } from "@/features/study-session/sessionState";
import type { SessionState } from "@/features/study-session/sessionState";
import { hasAlertHaptic } from "@/lib/alertHapticCapability";
import {
  trackMultiTimerClosed,
  trackMultiTimerOpened,
  trackMultiTimerPhaseCompleted,
  trackMultiTimerRestarted,
  trackMultiTimerStarted,
} from "@/lib/amplitude";
import type { MultiTimerUse } from "@/lib/amplitude";
import { haptic } from "@/lib/haptics";

import { createAlarmSound } from "./alarmSound";
import type { AlarmSound } from "./alarmSound";
import {
  backToSetup,
  createModeState,
  pauseMode,
  remainingMs,
  resumeMode,
  startMode,
  syncMode,
  updateModeSettings,
} from "./multiTimerMachine";
import type { ModeAlarm, ModeKind, ModeState } from "./multiTimerMachine";
import {
  loadAlarmSoundOn,
  loadLastModeKind,
  loadMultiTimerSettings,
  saveAlarmSoundOn,
  saveLastModeKind,
  saveMultiTimerSettings,
} from "./multiTimerSettings";
import type { MultiTimerSettings } from "./multiTimerSettings";

export interface MultiTimerUsage {
  mark(kind: ModeKind): void;
  snapshot(): MultiTimerUse;
}

/**
 * 세션 동안 시작한 모드 종류 기록
 *
 * 세션 훅이 타이머 훅보다 먼저 생겨서 화면이 이 기록을 만들어 양쪽에 넘긴다.
 * 타이머 훅은 시작할 때 mark 를 부르고 세션 훅은 종료 때 snapshot 만 읽는다.
 */
export function createMultiTimerUsage(): MultiTimerUsage {
  const kinds = new Set<ModeKind>();
  return {
    mark(kind) {
      kinds.add(kind);
    },
    snapshot() {
      return kinds.size > 1 ? "both" : ([...kinds][0] ?? "none");
    },
  };
}

export interface UseMultiTimerOptions {
  readonly sessionState: SessionState;
  readonly studying: boolean;
  readonly onStartBreak: () => void;
  readonly onEndBreak: () => void;
  readonly onResumeSession: () => void;
  readonly alarm?: AlarmSound;
  readonly usage?: MultiTimerUsage;
  readonly now?: () => number;
  readonly tickMs?: number;
}

export type ModePrimaryLabel = "시작" | "일시정지" | "계속";

export interface MultiTimerControls {
  /** null 이면 모드가 꺼져 있다. */
  readonly mode: ModeState | null;
  /** 같은 초 안에서는 다시 맞추지 않아 표기 단위인 초까지만 정확하다. */
  readonly remainingMs: number;
  /**
   * 사용자가 세션을 멈춘 상태 여부
   *
   * 휴식은 여기에 들지 않는다.
   */
  readonly held: boolean;
  readonly distracted: boolean;
  readonly primaryLabel: ModePrimaryLabel;
  readonly primaryDisabled: boolean;
  /** 시작하기 전에는 되돌릴 것이 없어 처음부터를 막는다. */
  readonly restartDisabled: boolean;
  /** 진행 중인 모드는 다른 모드로 바꿀 수 없다. */
  readonly kindLocked: boolean;
  /** 꺼도 끝 알림의 햅틱은 그대로 낸다. */
  readonly soundOn: boolean;
  /** 마지막으로 고른 모드로 연다. */
  open(): void;
  close(): void;
  /** 설정 화면에서만 바꾸고 고른 모드를 다음 열기에 쓴다. */
  switchKind(kind: ModeKind): void;
  setSoundOn(on: boolean): void;
  changeSettings(patch: Partial<MultiTimerSettings>): void;
  pressPrimary(): void;
  restart(): void;
}

interface Snapshot {
  readonly mode: ModeState | null;
  /** 이 상태를 맞춘 벽시계 시각이고 남은 시간을 그리는 기준이다. */
  readonly atMs: number;
}

const ALARM_HAPTIC_GAP_MS = 180;

const ALARM_PHASE = {
  "timer-done": "timer",
  "focus-done": "focus",
  "break-done": "break",
} as const;

/**
 * 끝 알림 햅틱 순서
 *
 * alert 를 받는 앱은 진동 패턴을 스스로 내서 한 번만 보낸다.
 * alert 를 모르는 구버전 앱은 그 메시지를 버려서 짧은 heavy 를 세 번 친다.
 */
function alarmHaptics(): readonly HapticStyle[] {
  return hasAlertHaptic() ? ["alert"] : ["heavy", "heavy", "heavy"];
}

function isActive(mode: ModeState | null): boolean {
  return mode?.status === "running" || mode?.status === "paused";
}

function isInBreak(mode: ModeState | null): boolean {
  return mode?.kind === "pomodoro" && isActive(mode) && mode.phase === "break";
}

/**
 * 세션 정지를 반영한 시계 동기화
 *
 * 흐르던 시계를 바로 멈추면 틱 사이에 끝난 단계가 0에 묶여 알림이 세션 재개 뒤로 밀린다.
 * 그래서 멈추기 전에 흐르는 쪽으로 한 번 맞춰 끝난 단계를 먼저 넘긴다.
 */
function syncClock(state: ModeState, nowMs: number, held: boolean) {
  if (!held || state.clock.anchorMs === null) return syncMode(state, nowMs, held);
  const flowed = syncMode(state, nowMs, false);
  return { state: syncMode(flowed.state, nowMs, true).state, alarms: flowed.alarms };
}

/**
 * 화면에 보이는 남은 초
 *
 * 표기 함수와 같이 올림해서 이 값이 그대로면 화면 숫자도 그대로다.
 */
function shownSecond(mode: ModeState | null, atMs: number): number | null {
  return mode === null ? null : Math.ceil(remainingMs(mode, atMs) / 1000);
}

function primaryLabelOf(mode: ModeState | null, held: boolean): ModePrimaryLabel {
  switch (mode?.status) {
    case "running":
      return held ? "계속" : "일시정지";
    case "paused":
      return "계속";
    default:
      return "시작";
  }
}

/**
 * 타이머·뽀모도로 모드의 상태, 틱, 알림, 휴식 신호
 *
 * 세션과는 콜백과 sessionState 로만 이어져 카메라·감지 코드에 닿지 않는다.
 * 최신 모드를 ref 에도 두는 이유는 렌더 전에 틱이 몰려 와도 이전 틱 결과 위에서 이어 가야 알림이 겹치지 않기 때문이다.
 */
export function useMultiTimer({
  sessionState,
  studying,
  onStartBreak,
  onEndBreak,
  onResumeSession,
  alarm: injectedAlarm,
  usage,
  now = Date.now,
  tickMs = 250,
}: UseMultiTimerOptions): MultiTimerControls {
  const [alarm] = useState(() => injectedAlarm ?? createAlarmSound());
  const [snapshot, setSnapshot] = useState<Snapshot>({ mode: null, atMs: 0 });
  const modeRef = useRef<ModeState | null>(null);
  const inBreakRef = useRef(false);
  const shownSecondRef = useRef<number | null>(null);
  const hapticTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  // 닫힘 계측용으로 이번에 연 시각과 그 뒤 시작한 적이 있는지를 둔다.
  const openedAtRef = useRef(0);
  const startedRef = useRef(false);
  const [soundOn, setSoundOnState] = useState(loadAlarmSoundOn);
  const held = isSessionHeld(sessionState);
  const studyRunning = isStudyRunning(sessionState);

  const commit = (next: ModeState | null, atMs: number, alarms: readonly ModeAlarm[] = []) => {
    modeRef.current = next;
    shownSecondRef.current = shownSecond(next, atMs);
    setSnapshot({ mode: next, atMs });
    alarms.forEach((done) => {
      trackMultiTimerPhaseCompleted(ALARM_PHASE[done], soundOn);
      if (soundOn) alarm.play();
      alarmHaptics().forEach((style, index) => {
        if (index === 0) {
          haptic(style);
          return;
        }
        const timer = setTimeout(() => {
          hapticTimersRef.current.delete(timer);
          haptic(style);
        }, index * ALARM_HAPTIC_GAP_MS);
        hapticTimersRef.current.add(timer);
      });
    });
    const inBreak = isInBreak(next);
    if (inBreak === inBreakRef.current) return;
    inBreakRef.current = inBreak;
    if (!inBreak) {
      onEndBreak();
    } else if (!held) {
      // 멈춘 세션을 휴식으로 바꾸면 사용자가 건 일시정지가 풀려서 휴식은 계속을 누를 때 들어간다.
      onStartBreak();
    }
  };

  const resumeSession = (mode: ModeState) => {
    if (isInBreak(mode)) {
      onStartBreak();
    } else {
      onResumeSession();
    }
  };

  const pressed = (mode: ModeState, atMs: number): ModeState => {
    switch (mode.status) {
      case "setup": {
        const started = startMode(mode);
        if (started === mode) return mode;
        // 모드가 든 다른 모드의 값은 열 때 읽은 것이라 그대로 쓰면 그 뒤 저장된 값을 덮는다.
        const stored = loadMultiTimerSettings();
        const { timerSec, focusMin, breakMin } = started.settings;
        saveMultiTimerSettings(
          started.kind === "timer" ? { ...stored, timerSec } : { ...stored, focusMin, breakMin },
        );
        alarm.prime();
        trackMultiTimerStarted({
          kind: started.kind,
          timerSec,
          focusMin,
          breakMin,
          soundOn,
          fromPause: held,
        });
        startedRef.current = true;
        usage?.mark(started.kind);
        // 멈춘 세션 위에서 시작한 모드는 세션이 다시 흐를 때까지 서 있어서 세션도 함께 다시 시작한다.
        if (held) resumeSession(started);
        return syncClock(started, atMs, held).state;
      }
      case "running":
        if (!held) return pauseMode(mode, atMs);
        alarm.prime();
        resumeSession(mode);
        return mode;
      case "paused":
        alarm.prime();
        if (held) resumeSession(mode);
        return syncClock(resumeMode(mode), atMs, held).state;
    }
  };

  const pressPrimary = () => {
    const current = modeRef.current;
    if (current === null) return;
    const atMs = now();
    // 틱 사이에 끝난 단계가 누름에 묻히지 않게 누른 시각까지 먼저 맞춘다.
    const { state: synced, alarms } = syncClock(current, atMs, held);
    // 누른 순간 타이머가 끝났으면 다시 시작하지 않고 시작 전으로 돌아간 화면을 보여 준다.
    commit(synced.status === current.status ? pressed(synced, atMs) : synced, atMs, alarms);
  };

  const open = () => {
    const kind = loadLastModeKind();
    openedAtRef.current = now();
    startedRef.current = false;
    trackMultiTimerOpened(kind);
    commit(createModeState(kind, loadMultiTimerSettings()), openedAtRef.current);
  };

  const switchKind = (kind: ModeKind) => {
    const current = modeRef.current;
    if (current === null || current.kind === kind || isActive(current)) return;
    saveLastModeKind(kind);
    commit(createModeState(kind, loadMultiTimerSettings()), now());
  };

  const setSoundOn = (on: boolean) => {
    saveAlarmSoundOn(on);
    setSoundOnState(on);
  };

  const close = () => {
    const current = modeRef.current;
    const atMs = now();
    if (current !== null) {
      trackMultiTimerClosed({
        kind: current.kind,
        state: held && current.status === "running" ? "paused" : current.status,
        started: startedRef.current,
        openSec: Math.round((atMs - openedAtRef.current) / 1000),
        ...(current.kind === "pomodoro" && { phase: current.phase }),
      });
    }
    commit(null, atMs);
  };

  const changeSettings = (patch: Partial<MultiTimerSettings>) => {
    const current = modeRef.current;
    if (current === null) return;
    commit(updateModeSettings(current, patch), now());
  };

  const restart = () => {
    const current = modeRef.current;
    if (current === null) return;
    if (current.status !== "setup") {
      if (current.kind === "pomodoro") {
        trackMultiTimerRestarted(current.kind, current.phase);
      } else {
        trackMultiTimerRestarted(current.kind);
      }
    }
    commit(backToSetup(current), now());
  };

  const tick = useEffectEvent(() => {
    const current = modeRef.current;
    if (current === null) return;
    const atMs = now();
    const { state, alarms } = syncClock(current, atMs, held);
    // 이 훅을 쓰는 세션 화면은 카메라·감지를 함께 들고 있어 같은 초를 그리는 틱마다 다시 그리면 무겁다.
    // 표본은 1/4초로 촘촘히 두어 초가 바뀌는 순간과 알림 시각은 늦지 않게 한다.
    if (
      state === current &&
      alarms.length === 0 &&
      shownSecond(state, atMs) === shownSecondRef.current
    ) {
      return;
    }
    commit(state, atMs, alarms);
  });

  const closeForSessionEnd = useEffectEvent(() => {
    if (modeRef.current !== null) commit(null, now());
  });

  const returnToBreak = useEffectEvent(() => {
    if (isInBreak(modeRef.current)) onStartBreak();
  });

  const mode = snapshot.mode;
  const running = mode?.status === "running";

  useEffect(() => {
    if (!running) return;
    // 시작·재개 직후와 세션 정지가 바뀐 순간은 다음 틱까지 기다리지 않는다.
    tick();
    if (held) return;
    const interval = setInterval(() => tick(), tickMs);
    return () => clearInterval(interval);
  }, [running, held, tickMs]);

  useEffect(() => {
    if (!studying) closeForSessionEnd();
  }, [studying]);

  // 계속 버튼이 아닌 길로 세션이 다시 흘러도 휴식 시간이 공부 시간에 들지 않게 휴식으로 되돌린다.
  useEffect(() => {
    if (studyRunning) returnToBreak();
  }, [studyRunning]);

  useEffect(() => () => alarm.dispose(), [alarm]);

  useEffect(() => {
    const timers = hapticTimersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const primaryLabel = primaryLabelOf(mode, held);
  const active = isActive(mode);

  return {
    mode,
    remainingMs: mode === null ? 0 : remainingMs(mode, snapshot.atMs),
    held,
    distracted: active && mode?.phase === "focus" && sessionState.kind === "DISTRACTION",
    primaryLabel,
    primaryDisabled:
      mode?.kind === "timer" && mode.status === "setup" && mode.settings.timerSec === 0,
    restartDisabled: mode === null || mode.status === "setup",
    kindLocked: active,
    soundOn,
    open,
    close,
    switchKind,
    setSoundOn,
    changeSettings,
    pressPrimary,
    restart,
  };
}
