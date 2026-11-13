import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DetectorSignal } from "../focusDetector";
import { createTouchDetector } from "../touchDetector";

describe("createTouchDetector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const target = new EventTarget();
    const detector = createTouchDetector({ target, holdMs: 2000 });
    const signals: DetectorSignal[] = [];
    detector.subscribe((signal) => signals.push(signal));
    detector.start();
    return { target, detector, signals };
  }

  function tap(target: EventTarget) {
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("pointerup"));
  }

  it("탭하면 켜지고 마지막 탭 2초 뒤 꺼진다", () => {
    const { target, signals } = setup();
    tap(target);
    expect(signals).toEqual([{ source: "TOUCH", active: true }]);

    vi.advanceTimersByTime(1500);
    tap(target);
    vi.advanceTimersByTime(1999);
    expect(signals).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(signals).toEqual([
      { source: "TOUCH", active: true },
      { source: "TOUCH", active: false },
    ]);
  });

  it("누르고 있는 동안은 계속 켜 두고 손을 떼고 2초 뒤 끈다", () => {
    const { target, signals } = setup();
    target.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(5000);
    expect(signals).toEqual([{ source: "TOUCH", active: true }]);

    target.dispatchEvent(new Event("pointerup"));
    vi.advanceTimersByTime(1999);
    expect(signals).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(signals.at(-1)).toEqual({ source: "TOUCH", active: false });
  });

  it("터치가 취소되어도 손을 뗀 것으로 본다", () => {
    const { target, signals } = setup();
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("pointercancel"));
    vi.advanceTimersByTime(2000);
    expect(signals.at(-1)).toEqual({ source: "TOUCH", active: false });
  });

  it("멈추면 신호를 끄고 더는 터치를 듣지 않는다", () => {
    const { target, detector, signals } = setup();
    target.dispatchEvent(new Event("pointerdown"));
    detector.stop();
    target.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(5000);
    expect(signals).toEqual([
      { source: "TOUCH", active: true },
      { source: "TOUCH", active: false },
    ]);
  });
});
