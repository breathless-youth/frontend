import { describe, expect, it } from "vitest";

import { DEFAULT_MULTI_TIMER_SETTINGS } from "@/features/multi-timer/multiTimerSettings";

import { pomodoroIntro, timerStartLabel } from "../roomTimerCopy";

describe("공부방 타이머 문구", () => {
  const base = { ...DEFAULT_MULTI_TIMER_SETTINGS };

  it("시작 버튼 글자는 고른 시간을 따른다", () => {
    expect(timerStartLabel("timer", { ...base, timerSec: 1800 })).toBe("30분 시작");
    expect(timerStartLabel("timer", { ...base, timerSec: 3600 })).toBe("1시간 시작");
    expect(timerStartLabel("timer", { ...base, timerSec: 5400 })).toBe("1시간 30분 시작");
    expect(timerStartLabel("timer", { ...base, timerSec: 45 })).toBe("45초 시작");
    expect(timerStartLabel("pomodoro", { ...base, focusMin: 25, breakMin: 5 })).toBe(
      "25분 집중 시작",
    );
  });

  it("처음 값은 기본 30분과 뽀모도로 집중 25분이다", () => {
    expect(timerStartLabel("timer", DEFAULT_MULTI_TIMER_SETTINGS)).toBe("30분 시작");
    expect(timerStartLabel("pomodoro", DEFAULT_MULTI_TIMER_SETTINGS)).toBe("25분 집중 시작");
    expect(pomodoroIntro(DEFAULT_MULTI_TIMER_SETTINGS)).toBe("집중 25분, 휴식 5분을 번갈아 해요");
  });

  it("뽀모도로 설명은 집중과 휴식 시간을 함께 쓴다", () => {
    expect(pomodoroIntro({ ...base, focusMin: 50, breakMin: 10 })).toBe(
      "집중 50분, 휴식 10분을 번갈아 해요",
    );
  });

  it("한 시간이 넘는 집중은 시간과 분으로 쓴다", () => {
    expect(timerStartLabel("pomodoro", { ...base, focusMin: 90 })).toBe("1시간 30분 집중 시작");
    expect(pomodoroIntro({ ...base, focusMin: 60, breakMin: 60 })).toBe(
      "집중 1시간, 휴식 1시간을 번갈아 해요",
    );
  });

  it("기본 타이머의 시, 분, 초를 모두 쓴다", () => {
    expect(timerStartLabel("timer", { ...base, timerSec: 3661 })).toBe("1시간 1분 1초 시작");
  });
});
