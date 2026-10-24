import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MULTI_TIMER_SETTINGS,
  clampBreakMin,
  clampFocusMin,
  clampTimerSec,
  loadMultiTimerSettings,
  parseMultiTimerSettings,
  restoreMultiTimerStorage,
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
