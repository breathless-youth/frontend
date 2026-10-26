import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MULTI_TIMER_SETTINGS,
  clampBreakMin,
  clampFocusMin,
  clampTimerSec,
  loadAlarmSoundOn,
  loadLastModeKind,
  loadMultiTimerSettings,
  parseMultiTimerSettings,
  restoreMultiTimerStorage,
  saveAlarmSoundOn,
  saveLastModeKind,
  saveMultiTimerSettings,
  setMultiTimerStorage,
} from "../multiTimerSettings";

const KEY = "focuson.multiTimer.v1";

afterEach(() => {
  restoreMultiTimerStorage();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("loadMultiTimerSettings", () => {
  it("저장값이 없으면 기본값", () => {
    expect(loadMultiTimerSettings()).toEqual({ timerSec: 1800, focusMin: 25, breakMin: 5 });
  });

  it("저장한 값을 같은 키에서 그대로 복원한다", () => {
    const next = { timerSec: 4323, focusMin: 50, breakMin: 10 };
    saveMultiTimerSettings(next);
    expect(JSON.parse(localStorage.getItem(KEY) ?? "null")).toEqual(next);
    expect(loadMultiTimerSettings()).toEqual(next);
  });

  it("깨진 JSON 이면 기본값", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadMultiTimerSettings()).toEqual(DEFAULT_MULTI_TIMER_SETTINGS);
  });

  it("접근이 throw 해도 기본값이고 저장도 예외를 내지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(loadMultiTimerSettings()).toEqual(DEFAULT_MULTI_TIMER_SETTINGS);
    expect(() => saveMultiTimerSettings(DEFAULT_MULTI_TIMER_SETTINGS)).not.toThrow();
  });

  it("저장소가 없어도 throw 하지 않는다", () => {
    setMultiTimerStorage(null);
    expect(loadMultiTimerSettings()).toEqual(DEFAULT_MULTI_TIMER_SETTINGS);
    expect(() => saveMultiTimerSettings(DEFAULT_MULTI_TIMER_SETTINGS)).not.toThrow();
  });
});

describe("parseMultiTimerSettings", () => {
  it("객체가 아니면 기본값", () => {
    expect(parseMultiTimerSettings(null)).toEqual(DEFAULT_MULTI_TIMER_SETTINGS);
    expect(parseMultiTimerSettings([])).toEqual(DEFAULT_MULTI_TIMER_SETTINGS);
    expect(parseMultiTimerSettings("x")).toEqual(DEFAULT_MULTI_TIMER_SETTINGS);
  });

  it("필드별로 유효하지 않으면 그 필드만 기본값이고 범위 밖은 자른다", () => {
    expect(parseMultiTimerSettings({ timerSec: -5, focusMin: 999, breakMin: "x" })).toEqual({
      timerSec: 1800,
      focusMin: 180,
      breakMin: 5,
    });
  });

  it("저장된 timerSec 이 0이면 기본값", () => {
    expect(parseMultiTimerSettings({ timerSec: 0 }).timerSec).toBe(1800);
  });
});

describe("clamp", () => {
  it("범위로 자르고 정수로 만든다", () => {
    expect(clampTimerSec(100_000)).toBe(86399);
    expect(clampTimerSec(-1)).toBe(0);
    expect(clampTimerSec(10.7)).toBe(10);
    expect(clampFocusMin(0)).toBe(1);
    expect(clampFocusMin(500)).toBe(180);
    expect(clampBreakMin(0)).toBe(1);
    expect(clampBreakMin(500)).toBe(60);
  });
});

describe("loadLastModeKind", () => {
  it("저장값이 없으면 기본 타이머", () => {
    expect(loadLastModeKind()).toBe("timer");
  });

  it("저장한 모드를 설정과 다른 키에서 복원한다", () => {
    saveLastModeKind("pomodoro");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(loadLastModeKind()).toBe("pomodoro");
  });

  it("모르는 값이면 기본 타이머", () => {
    localStorage.setItem("focuson.multiTimer.lastKind.v1", "stopwatch");
    expect(loadLastModeKind()).toBe("timer");
  });

  it("접근이 throw 해도 기본 타이머이고 저장도 예외를 내지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(loadLastModeKind()).toBe("timer");
    expect(() => saveLastModeKind("pomodoro")).not.toThrow();
  });
});

describe("loadAlarmSoundOn", () => {
  it("저장값이 없으면 켜짐", () => {
    expect(loadAlarmSoundOn()).toBe(true);
  });

  it("끈 값을 설정과 다른 키에서 복원한다", () => {
    saveAlarmSoundOn(false);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(loadAlarmSoundOn()).toBe(false);
    saveAlarmSoundOn(true);
    expect(loadAlarmSoundOn()).toBe(true);
  });

  it("모르는 값이면 켜짐", () => {
    localStorage.setItem("focuson.multiTimer.alarmSound.v1", "maybe");
    expect(loadAlarmSoundOn()).toBe(true);
  });

  it("접근이 throw 해도 켜짐이고 저장도 예외를 내지 않는다", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(loadAlarmSoundOn()).toBe(true);
    expect(() => saveAlarmSoundOn(false)).not.toThrow();
  });
});
