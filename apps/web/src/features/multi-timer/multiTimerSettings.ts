/**
 * 멀티 타이머 설정(타이머 길이·집중·휴식)의 영속 저장
 *
 * localStorage 를 쓰는 이유는 탭 화면과 세션 화면이 별도 WebView 라 sessionStorage 가 공유되지 않기 때문이다.
 * 저장소 접근은 프라이버시 모드 등에서 throw 할 수 있어 모든 접근을 삼킨다.
 */

import type { ModeKind } from "./multiTimerMachine";

const KEY = "focuson.multiTimer.v1";
// 설정 저장은 알려진 필드만 다시 써서 같은 객체에 넣으면 지워지므로 키를 따로 둔다.
const LAST_KIND_KEY = "focuson.multiTimer.lastKind.v1";
const ALARM_SOUND_KEY = "focuson.multiTimer.alarmSound.v1";

export interface MultiTimerSettings {
  readonly timerSec: number;
  readonly focusMin: number;
  readonly breakMin: number;
}

export const DEFAULT_MULTI_TIMER_SETTINGS: MultiTimerSettings = {
  timerSec: 1800,
  focusMin: 25,
  breakMin: 5,
};

export const TIMER_MAX_SEC = 86399;
export const FOCUS_MIN_LIMIT = { min: 1, max: 180 } as const;
export const BREAK_MIN_LIMIT = { min: 1, max: 60 } as const;

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function clampTimerSec(sec: number): number {
  return clampInt(sec, 0, TIMER_MAX_SEC);
}

export function clampFocusMin(min: number): number {
  return clampInt(min, FOCUS_MIN_LIMIT.min, FOCUS_MIN_LIMIT.max);
}

export function clampBreakMin(min: number): number {
  return clampInt(min, BREAK_MIN_LIMIT.min, BREAK_MIN_LIMIT.max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 저장된 값이 어떤 모양이든 예외 없이 정상 설정으로 만든다. */
export function parseMultiTimerSettings(raw: unknown): MultiTimerSettings {
  if (!isRecord(raw)) return DEFAULT_MULTI_TIMER_SETTINGS;
  const { timerSec, focusMin, breakMin } = raw;
  return {
    // 0초 타이머는 시작할 수 없는 값이라 저장돼 있어도 기본값으로 되돌린다.
    timerSec:
      isFiniteNumber(timerSec) && timerSec > 0
        ? clampTimerSec(timerSec)
        : DEFAULT_MULTI_TIMER_SETTINGS.timerSec,
    focusMin: isFiniteNumber(focusMin)
      ? clampFocusMin(focusMin)
      : DEFAULT_MULTI_TIMER_SETTINGS.focusMin,
    breakMin: isFiniteNumber(breakMin)
      ? clampBreakMin(breakMin)
      : DEFAULT_MULTI_TIMER_SETTINGS.breakMin,
  };
}

/** 기본 저장소인 localStorage는 접근 자체가 throw 할 수 있어 접근 시점에 읽는다. */
function defaultStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

let override: { readonly storage: Storage | null } | null = null;

function currentStorage(): Storage | null {
  return override === null ? defaultStorage() : override.storage;
}

/**
 * 테스트가 바꿔 끼우는 저장소 구현체
 *
 * null 이면 저장소가 없는 환경을 흉내 낸다.
 */
export function setMultiTimerStorage(storage: Storage | null): void {
  override = { storage };
}

/** 테스트끼리 저장소를 나눠 쓰지 않게 기본 저장소로 되돌린다. */
export function restoreMultiTimerStorage(): void {
  override = null;
}

/** 조회 실패는 기본값으로 떨어져서 최악의 결과가 마지막 설정을 잊는 정도에 그친다. */
export function loadMultiTimerSettings(): MultiTimerSettings {
  try {
    const raw = currentStorage()?.getItem(KEY) ?? null;
    return raw === null ? DEFAULT_MULTI_TIMER_SETTINGS : parseMultiTimerSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_MULTI_TIMER_SETTINGS;
  }
}

/** 타이머 진행이 저장소 사정에 막히면 안 돼서 저장 실패는 throw 하지 않는다. */
export function saveMultiTimerSettings(next: MultiTimerSettings): void {
  try {
    currentStorage()?.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장 실패는 다음 진입 때 기본값으로 시작하는 정도의 손해라 무시한다.
  }
}

/** 마지막으로 고른 모드이고 모르는 값이나 조회 실패는 기본 타이머로 떨어진다. */
export function loadLastModeKind(): ModeKind {
  try {
    return currentStorage()?.getItem(LAST_KIND_KEY) === "pomodoro" ? "pomodoro" : "timer";
  } catch {
    return "timer";
  }
}

export function saveLastModeKind(kind: ModeKind): void {
  try {
    currentStorage()?.setItem(LAST_KIND_KEY, kind);
  } catch {
    // 저장 실패는 다음에 기본 타이머로 여는 정도의 손해라 무시한다.
  }
}

/** 알림음 켜짐 여부이고 끈 값이 확실할 때만 끈다. */
export function loadAlarmSoundOn(): boolean {
  try {
    return currentStorage()?.getItem(ALARM_SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveAlarmSoundOn(on: boolean): void {
  try {
    currentStorage()?.setItem(ALARM_SOUND_KEY, on ? "on" : "off");
  } catch {
    // 저장 실패는 다음에 알림음이 켜진 채로 여는 정도의 손해라 무시한다.
  }
}
