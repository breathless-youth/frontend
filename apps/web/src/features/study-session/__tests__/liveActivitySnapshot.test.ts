import { describe, expect, it } from "vitest";

import { toLiveActivitySnapshot } from "../liveActivitySnapshot";
import { BREAK_STATE, FOCUS_STATE, distractionState, pauseState } from "../sessionState";

const base = {
  measureMode: "camera" as const,
  subject: "수학",
  sessionState: FOCUS_STATE,
  phaseName: "studying" as const,
  focusSec: 5,
};

describe("toLiveActivitySnapshot", () => {
  it("공부 중이 아니면 null이라 네이티브가 표시를 끝낸다", () => {
    for (const phaseName of ["submitting", "done", "error", "unsaved"] as const) {
      expect(toLiveActivitySnapshot({ ...base, phaseName })).toBeNull();
    }
  });

  it("집중 중이면 running이고 측정 방식과 과목을 그대로 싣는다", () => {
    expect(toLiveActivitySnapshot(base)).toEqual({
      mode: "camera",
      subject: "수학",
      state: "running",
      elapsedSec: 5,
    });
    expect(toLiveActivitySnapshot({ ...base, measureMode: "timer", subject: null })).toEqual({
      mode: "timer",
      subject: null,
      state: "running",
      elapsedSec: 5,
    });
  });

  it("휴식은 break다", () => {
    expect(toLiveActivitySnapshot({ ...base, sessionState: BREAK_STATE })?.state).toBe("break");
  });

  it("그 밖의 일시정지는 paused다", () => {
    for (const sessionState of [pauseState("MANUAL"), pauseState("BACKGROUND")]) {
      expect(toLiveActivitySnapshot({ ...base, sessionState })?.state).toBe("paused");
    }
  });

  it("딴짓 상태는 화면 숫자가 멈추므로 distracted다", () => {
    for (const trigger of ["AWAY", "PHONE", "DEVICE", "SLEEP"] as const) {
      expect(
        toLiveActivitySnapshot({ ...base, sessionState: distractionState(trigger) })?.state,
      ).toBe("distracted");
    }
  });

  it("시간은 초 단위 정수로 내린다", () => {
    expect(toLiveActivitySnapshot({ ...base, focusSec: 5.7 })?.elapsedSec).toBe(5);
  });
});
