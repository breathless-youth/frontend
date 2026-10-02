import { describe, expect, it } from "vitest";

import { createAmbientUsage } from "../ambientUsage";

function fakeClock(startMs = 0) {
  let t = startMs;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createAmbientUsage", () => {
  it("미사용이면 used 가 false 이고 0초다", () => {
    const usage = createAmbientUsage(fakeClock().now);
    expect(usage.snapshot()).toEqual({ used: false, sec: 0 });
  });

  it("start·stop 구간을 누적하고 내림한다", () => {
    const clock = fakeClock(1000);
    const usage = createAmbientUsage(clock.now);
    usage.start();
    clock.advance(2500);
    usage.stop();
    clock.advance(10000);
    usage.start();
    clock.advance(1900);
    usage.stop();
    expect(usage.snapshot()).toEqual({ used: true, sec: 4 });
  });

  it("재생 중 snapshot 은 그 순간까지의 누적이다", () => {
    const clock = fakeClock();
    const usage = createAmbientUsage(clock.now);
    usage.start();
    clock.advance(3200);
    expect(usage.snapshot()).toEqual({ used: true, sec: 3 });
    clock.advance(1000);
    expect(usage.snapshot().sec).toBe(4);
  });

  it("중복 start 는 첫 start 시각을 유지한다", () => {
    const clock = fakeClock();
    const usage = createAmbientUsage(clock.now);
    usage.start();
    clock.advance(2000);
    usage.start();
    clock.advance(1000);
    usage.stop();
    expect(usage.snapshot().sec).toBe(3);
  });

  it("중복 stop 은 무시한다", () => {
    const clock = fakeClock();
    const usage = createAmbientUsage(clock.now);
    usage.stop();
    usage.start();
    clock.advance(1000);
    usage.stop();
    clock.advance(5000);
    usage.stop();
    expect(usage.snapshot()).toEqual({ used: true, sec: 1 });
  });
});
