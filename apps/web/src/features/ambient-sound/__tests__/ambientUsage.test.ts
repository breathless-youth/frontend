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

  describe("소리별 재생 시간", () => {
    const white = { id: "white", group: "noise" } as const;
    const rain = { id: "rain-trp", group: "ambience" } as const;

    it("재생 중인 동안 켜진 소리마다 시간이 쌓인다", () => {
      const clock = fakeClock();
      const usage = createAmbientUsage(clock.now);
      usage.setSounds([white, rain]);
      usage.start();
      clock.advance(10_000);

      expect(usage.soundSeconds()).toEqual([
        { id: "white", group: "noise", sec: 10 },
        { id: "rain-trp", group: "ambience", sec: 10 },
      ]);
    });

    it("소리를 바꾸면 그 시점부터 새 소리에 쌓인다", () => {
      const clock = fakeClock();
      const usage = createAmbientUsage(clock.now);
      usage.setSounds([white]);
      usage.start();
      clock.advance(5_000);
      usage.setSounds([rain]);
      clock.advance(7_000);

      expect(usage.soundSeconds()).toEqual([
        { id: "white", group: "noise", sec: 5 },
        { id: "rain-trp", group: "ambience", sec: 7 },
      ]);
    });

    it("멈춘 동안은 쌓지 않는다", () => {
      const clock = fakeClock();
      const usage = createAmbientUsage(clock.now);
      usage.setSounds([white]);
      usage.start();
      clock.advance(3_000);
      usage.stop();
      clock.advance(60_000);
      // 일시정지 상태로 세션이 끝나면 멈춘 채로 읽는다.
      expect(usage.soundSeconds()).toEqual([{ id: "white", group: "noise", sec: 3 }]);
      usage.start();
      clock.advance(2_000);

      expect(usage.soundSeconds()).toEqual([{ id: "white", group: "noise", sec: 5 }]);
    });

    it("재생 중이 아닐 때 소리를 바꿔도 시간이 생기지 않는다", () => {
      const clock = fakeClock();
      const usage = createAmbientUsage(clock.now);
      usage.setSounds([white]);
      clock.advance(10_000);
      usage.setSounds([rain]);
      clock.advance(10_000);

      expect(usage.soundSeconds()).toEqual([]);
    });

    it("1초 미만은 버리고, 0초인 소리는 목록에 없다", () => {
      const clock = fakeClock();
      const usage = createAmbientUsage(clock.now);
      usage.setSounds([white]);
      usage.start();
      clock.advance(900);
      usage.setSounds([rain]);
      clock.advance(2_300);

      expect(usage.soundSeconds()).toEqual([{ id: "rain-trp", group: "ambience", sec: 2 }]);
    });
  });
});
