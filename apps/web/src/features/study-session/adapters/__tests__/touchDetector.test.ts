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

  it("두 손가락 중 하나만 떼면 계속 켜 두고 모두 떼야 2초 뒤 끈다", () => {
    const { target, signals } = setup();
    const pointer = (type: string, pointerId: number) =>
      target.dispatchEvent(Object.assign(new Event(type), { pointerId }));
    pointer("pointerdown", 1);
    pointer("pointerdown", 2);
    pointer("pointerup", 1);
    vi.advanceTimersByTime(5000);
    expect(signals).toEqual([{ source: "TOUCH", active: true }]);

    pointer("pointerup", 2);
    vi.advanceTimersByTime(2000);
    expect(signals.at(-1)).toEqual({ source: "TOUCH", active: false });
  });

  it("떼는 신호를 놓쳐도 새 첫 터치부터 다시 센다", () => {
    const { target, signals } = setup();
    const pointer = (type: string, pointerId: number, isPrimary: boolean) =>
      target.dispatchEvent(Object.assign(new Event(type), { pointerId, isPrimary }));
    pointer("pointerdown", 1, true);
    // 1번의 pointerup이 오지 않았다.
    pointer("pointerdown", 2, true);
    pointer("pointerup", 2, true);
    vi.advanceTimersByTime(2000);
    expect(signals.at(-1)).toEqual({ source: "TOUCH", active: false });
  });

  it("화면이 가려지면 눌린 손가락을 잊고 2초 뒤 끈다", () => {
    const { target, signals } = setup();
    target.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerId: 1 }));
    target.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(2000);
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
