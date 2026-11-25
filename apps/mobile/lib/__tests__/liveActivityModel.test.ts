import type { LiveActivitySnapshot } from "@focusmakers/types";

import { deriveActivity, PAUSE_AUTO_END_MS, TIMER_AWAY_LIMIT_MS } from "../liveActivityModel";

const texts = {
  timerRunning: "T",
  cameraRunning: "C",
  paused: "P",
  endedTitle: "E",
  endedPause: "EP",
  endedAway: "EA",
};
const AT = 1_000_000;
const snap = (over: Partial<LiveActivitySnapshot> = {}): LiveActivitySnapshot => ({
  mode: "timer",
  subject: "수학",
  state: "running",
  elapsedSec: 100,
  ...over,
});

describe("deriveActivity", () => {
  it("앱 안에서 흐르면 시작 시각을 거꾸로 세고 끝날 시각을 두지 않는다", () => {
    const r = deriveActivity({
      snapshot: snap(),
      atMs: AT,
      backgroundSinceMs: null,
      texts,
      iconUri: null,
    });
    expect(r.props).toMatchObject({
      paused: false,
      startedAtMs: AT - 100_000,
      pausedAtMs: null,
      statusText: "T",
      islandStatusText: "T",
    });
    expect(r.staleDate).toBeUndefined();
  });

  it("섬 문구는 두 줄 문구의 첫 줄만 쓰고 한 줄 문구는 그대로 쓴다", () => {
    const twoLine = { ...texts, timerRunning: "T1", paused: "P1\nP2" };
    const paused = deriveActivity({
      snapshot: snap({ state: "paused" }),
      atMs: AT,
      backgroundSinceMs: null,
      texts: twoLine,
      iconUri: null,
    });
    expect(paused.props).toMatchObject({ statusText: "P1\nP2", islandStatusText: "P1" });
    const running = deriveActivity({
      snapshot: snap(),
      atMs: AT,
      backgroundSinceMs: null,
      texts: twoLine,
      iconUri: null,
    });
    expect(running.props).toMatchObject({ statusText: "T1", islandStatusText: "T1" });
  });

  it("관리 모드 문구를 고른다", () => {
    const r = deriveActivity({
      snapshot: snap({ mode: "camera" }),
      atMs: AT,
      backgroundSinceMs: null,
      texts,
      iconUri: null,
    });
    expect(r.props.statusText).toBe("C");
  });

  it("앱 안 일시정지와 휴식은 멈춘 모양이고 끝날 시각이 없다", () => {
    for (const state of ["paused", "break"] as const) {
      const r = deriveActivity({
        snapshot: snap({ state }),
        atMs: AT,
        backgroundSinceMs: null,
        texts,
        iconUri: null,
      });
      expect(r.props).toMatchObject({
        paused: true,
        startedAtMs: AT - 100_000,
        pausedAtMs: AT,
        statusText: "P",
      });
      expect(r.staleDate).toBeUndefined();
    }
  });

  it("자율 모드가 앱 밖에서 흐르면 나간 시각 2시간 뒤 끝난 모양이 된다", () => {
    const away = AT + 5_000;
    const r = deriveActivity({
      snapshot: snap(),
      atMs: AT,
      backgroundSinceMs: away,
      texts,
      iconUri: null,
    });
    expect(r.props).toMatchObject({ paused: false, pausedAtMs: null, endedBody: "EA" });
    expect(r.staleDate?.getTime()).toBe(away + TIMER_AWAY_LIMIT_MS);
  });

  it("관리 모드가 앱 밖으로 나가면 나간 시각까지 흐른 값에서 멈추고 20분 뒤 끝난다", () => {
    const away = AT + 5_000;
    const r = deriveActivity({
      snapshot: snap({ mode: "camera" }),
      atMs: AT,
      backgroundSinceMs: away,
      texts,
      iconUri: null,
    });
    expect(r.props).toMatchObject({
      paused: true,
      startedAtMs: AT - 100_000,
      pausedAtMs: away,
      statusText: "P",
      endedBody: "EP",
    });
    expect(r.staleDate?.getTime()).toBe(away + PAUSE_AUTO_END_MS);
  });

  it("직접 누른 일시정지는 스냅샷 시각부터 20분을 센다", () => {
    const r = deriveActivity({
      snapshot: snap({ state: "paused" }),
      atMs: AT,
      backgroundSinceMs: AT + 60_000,
      texts,
      iconUri: null,
    });
    expect(r.props).toMatchObject({ paused: true, pausedAtMs: AT, endedBody: "EP" });
    expect(r.staleDate?.getTime()).toBe(AT + PAUSE_AUTO_END_MS);
  });

  it("휴식 중에 나가면 나간 시각부터 20분을 센다", () => {
    const away = AT + 60_000;
    const r = deriveActivity({
      snapshot: snap({ state: "break" }),
      atMs: AT,
      backgroundSinceMs: away,
      texts,
      iconUri: null,
    });
    expect(r.props).toMatchObject({ paused: true, pausedAtMs: AT, endedBody: "EP" });
    expect(r.staleDate?.getTime()).toBe(away + PAUSE_AUTO_END_MS);
  });

  it("앱 안 딴짓은 그 시점 값에서 시간만 멈추고 일시정지 표시 없이 모드 문구를 쓴다", () => {
    const r = deriveActivity({
      snapshot: snap({ mode: "camera", state: "distracted" }),
      atMs: AT,
      backgroundSinceMs: null,
      texts,
      iconUri: null,
    });
    expect(r.props).toMatchObject({
      paused: false,
      startedAtMs: AT - 100_000,
      pausedAtMs: AT,
      statusText: "C",
    });
    expect(r.staleDate).toBeUndefined();
  });

  it("딴짓 중에 나가면 딴짓 시간을 더하지 않고 그 시점 값에서 멈춘 일시정지가 되고 나간 시각부터 20분을 센다", () => {
    const away = AT + 30_000;
    const r = deriveActivity({
      snapshot: snap({ mode: "camera", state: "distracted" }),
      atMs: AT,
      backgroundSinceMs: away,
      texts,
      iconUri: null,
    });
    expect(r.props).toMatchObject({
      paused: true,
      startedAtMs: AT - 100_000,
      pausedAtMs: AT,
      statusText: "P",
      endedBody: "EP",
    });
    expect(r.staleDate?.getTime()).toBe(away + PAUSE_AUTO_END_MS);
  });

  it("과목과 아이콘을 그대로 넘긴다", () => {
    const r = deriveActivity({
      snapshot: snap({ subject: null }),
      atMs: AT,
      backgroundSinceMs: null,
      texts,
      iconUri: "file:///i.png",
    });
    expect(r.props).toMatchObject({ subject: null, iconUri: "file:///i.png", endedTitle: "E" });
  });
});
