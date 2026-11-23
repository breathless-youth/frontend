import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DistractionTrigger } from "@/features/study-session/sessionState";
import { trackSpaceDistractSceneEntered, trackSpaceDistractSceneLeft } from "@/lib/amplitude";

import type { LoopSound } from "../loopSound";
import type { DistractScene, SpaceScenes } from "../spaceManifest";
import { useDistractScene } from "../useDistractScene";
import type { CueSound, SpaceCue } from "../watcher/watcherSound";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackSpaceDistractSceneEntered: vi.fn(),
  trackSpaceDistractSceneLeft: vi.fn(),
}));

const DISTRACT: DistractScene = { visual: "video", loop: "own", cue: true, approach: false };
const SCENES: SpaceScenes = {
  timing: { distractAfterMs: 3_000, returnAfterMs: 1_000 },
  focus: { loopSound: true },
  distract: DISTRACT,
};

function fakeLoop() {
  return {
    prime: vi.fn(),
    setActive: vi.fn(),
    setVolume: vi.fn(),
    fade: vi.fn(),
    dispose: vi.fn(),
  } satisfies LoopSound;
}

type Duration = number | null | Promise<number | null>;

function fakeCues(duration: Duration) {
  return {
    prime: vi.fn(),
    play: vi.fn(),
    fadeApproach: vi.fn(),
    durationSec: vi.fn(() => Promise.resolve(duration)),
    setMuted: vi.fn(),
    setVolume: vi.fn(),
    stopAll: vi.fn(),
    dispose: vi.fn(),
  } satisfies CueSound;
}

function setup(
  scenes: SpaceScenes,
  duration: Duration = null,
  wrapper?: (props: { children: ReactNode }) => ReactNode,
) {
  const loops: { url: string; sound: ReturnType<typeof fakeLoop> }[] = [];
  const cues: { urls: Partial<Record<SpaceCue, string>>; sound: ReturnType<typeof fakeCues> }[] =
    [];
  const options = {
    loadScenes: vi.fn(() => Promise.resolve(scenes)),
    createSound: vi.fn((url: string) => {
      const sound = fakeLoop();
      loops.push({ url, sound });
      return sound;
    }),
    createCues: vi.fn((urls: Partial<Record<SpaceCue, string>>) => {
      const sound = fakeCues(duration);
      cues.push({ urls, sound });
      return sound;
    }),
  };
  const view = renderHook(
    ({
      assetKey = "rain/1",
      itemCode = "SPACE_RAIN",
      trigger = null,
    }: {
      assetKey?: string | null;
      itemCode?: string | null;
      trigger?: DistractionTrigger | null;
    }) => useDistractScene({ assetKey, itemCode, trigger, active: true, volume: 80 }, options),
    { initialProps: {}, wrapper },
  );
  return { ...view, loops, cues, options };
}

/** 지금 쓰는(정리하지 않은) 예고 소리 재생기 */
function liveCues(cues: { sound: ReturnType<typeof fakeCues> }[]) {
  const live = cues.filter(({ sound }) => sound.dispose.mock.calls.length === 0);
  expect(live).toHaveLength(1);
  return live[0].sound;
}

function approachCalls(sound: ReturnType<typeof fakeCues>) {
  return sound.play.mock.calls.filter(([cue]) => cue === "approach");
}

/** 매니페스트와 예고 소리 길이를 받는 약속을 끝낸다. */
async function settle() {
  await act(async () => {});
  await act(async () => {});
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useDistractScene", () => {
  it("딴짓이 시작되면 비집중 반복 소리를 받기 시작하고, 기준 시간이 지나면 장면을 바꾸며 한 번씩 알린다", async () => {
    const { result, rerender, loops, cues } = setup(SCENES);
    await settle();
    expect(result.current.armed).toBe(false);
    expect(loops).toEqual([]);

    rerender({ trigger: "PHONE" });
    expect(result.current.armed).toBe(true);
    expect(loops.map((loop) => loop.url)).toEqual(["/spaces/rain/1/distract/sound/loop.m4a"]);
    expect(loops[0].sound.fade).toHaveBeenLastCalledWith(0);

    advance(2_999);
    expect(result.current.present).toBe(false);
    advance(1);
    expect(result.current.present).toBe(true);
    expect(result.current.focusLevel).toBe(0);
    expect(loops[0].sound.fade).toHaveBeenLastCalledWith(1);
    expect(cues[0].sound.play).toHaveBeenCalledExactlyOnceWith("cue");
    expect(trackSpaceDistractSceneEntered).toHaveBeenCalledExactlyOnceWith({
      itemCode: "SPACE_RAIN",
      trigger: "PHONE",
    });

    rerender({ trigger: null });
    advance(999);
    expect(result.current.present).toBe(true);
    advance(1);
    expect(result.current.present).toBe(false);
    expect(result.current.focusLevel).toBe(1);
    expect(loops[0].sound.fade).toHaveBeenLastCalledWith(0);
    expect(trackSpaceDistractSceneLeft).toHaveBeenCalledExactlyOnceWith({
      itemCode: "SPACE_RAIN",
      durationSec: 1,
    });
    expect(trackSpaceDistractSceneEntered).toHaveBeenCalledOnce();
    expect(cues[0].sound.play).toHaveBeenCalledOnce();
  });

  it.each([
    ["keep", 1],
    ["none", 0],
  ] as const)(
    "비집중 소리가 %s이면 바뀐 동안 집중 소리 크기가 %s이고 비집중 반복 소리는 없다",
    async (loop, focusLevel) => {
      const { result, rerender, loops } = setup({ ...SCENES, distract: { ...DISTRACT, loop } });
      await settle();

      rerender({ trigger: "AWAY" });
      advance(3_000);

      expect(result.current.present).toBe(true);
      expect(result.current.focusLevel).toBe(focusLevel);
      expect(loops).toEqual([]);
    },
  );

  it("예고 소리를 받았으면 바뀌는 순간에 끝나도록 앞서 틀고, 그 전에 집중하면 줄여 끈다", async () => {
    const { rerender, cues } = setup({ ...SCENES, distract: { ...DISTRACT, approach: true } }, 2);
    await settle();
    expect(cues[0].urls).toEqual({
      approach: "/spaces/rain/1/distract/sound/approach.m4a",
      cue: "/spaces/rain/1/distract/sound/cue.m4a",
    });

    rerender({ trigger: "PHONE" });
    advance(999);
    expect(approachCalls(cues[0].sound)).toEqual([]);
    advance(1);
    expect(approachCalls(cues[0].sound)).toEqual([["approach", 0]]);

    cues[0].sound.fadeApproach.mockClear();
    rerender({ trigger: null });
    expect(cues[0].sound.fadeApproach).toHaveBeenCalled();
  });

  it("예고 소리 길이를 늦게 알면 늦은 만큼 앞부분을 건너뛰어 튼다", async () => {
    let resolveDuration: (sec: number) => void = () => {};
    const duration = new Promise<number | null>((resolve) => {
      resolveDuration = resolve;
    });
    const { result, rerender, cues } = setup(
      { ...SCENES, distract: { ...DISTRACT, approach: true } },
      duration,
    );
    await settle();

    rerender({ trigger: "PHONE" });
    advance(2_500);
    expect(approachCalls(cues[0].sound)).toEqual([]);

    // 2.5초짜리 예고는 0.5초 전에 시작해야 했으니 2초 늦었다.
    resolveDuration(2.5);
    await settle();
    advance(0);
    expect(approachCalls(cues[0].sound)).toEqual([["approach", 2]]);

    advance(500);
    expect(result.current.present).toBe(true);
  });

  it("예고 소리를 아직 받지 못했으면 예고 없이 바꾼다", async () => {
    const { result, rerender, cues } = setup(
      { ...SCENES, distract: { ...DISTRACT, approach: true } },
      null,
    );
    await settle();

    rerender({ trigger: "PHONE" });
    advance(3_000);

    expect(result.current.present).toBe(true);
    expect(approachCalls(cues[0].sound)).toEqual([]);
  });

  it("비집중 장면인 채로 공부가 끝나면 떠난 이벤트를 보낸다", async () => {
    const { result, rerender } = setup(SCENES);
    await settle();
    rerender({ trigger: "SLEEP" });
    advance(3_000);
    advance(2_000);
    expect(result.current.present).toBe(true);

    rerender({ assetKey: null, trigger: "SLEEP" });

    expect(result.current.present).toBe(false);
    expect(trackSpaceDistractSceneLeft).toHaveBeenCalledExactlyOnceWith({
      itemCode: "SPACE_RAIN",
      durationSec: 2,
    });
  });

  it("소리는 공간 음량을 따르고, 화면이 숨으면 멈춘다", async () => {
    const { cues } = setup(SCENES);
    await settle();
    expect(cues[0].sound.prime).toHaveBeenCalled();
    expect(cues[0].sound.setVolume).toHaveBeenLastCalledWith(0.8);

    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(cues[0].sound.stopAll).toHaveBeenCalled();
  });

  it("StrictMode에서도 정리한 재생기는 다시 쓰지 않고, 바뀔 때 한 번씩만 알린다", async () => {
    const { result, rerender, cues } = setup(
      { ...SCENES, distract: { ...DISTRACT, approach: true } },
      2,
      ({ children }) => createElement(StrictMode, null, children),
    );
    await settle();

    rerender({ trigger: "PHONE" });
    advance(1_000);
    advance(2_000);
    expect(result.current.present).toBe(true);

    const live = liveCues(cues);
    expect(live.prime).toHaveBeenCalled();
    expect(approachCalls(live)).toEqual([["approach", 0]]);
    expect(live.play).toHaveBeenCalledWith("cue");
    for (const { sound } of cues.filter(({ sound }) => sound !== live)) {
      const disposedAt = sound.dispose.mock.invocationCallOrder[0];
      for (const fn of [sound.prime, sound.play, sound.durationSec, sound.setVolume]) {
        expect(fn.mock.invocationCallOrder.every((order) => order < disposedAt)).toBe(true);
      }
    }
    expect(trackSpaceDistractSceneEntered).toHaveBeenCalledOnce();

    rerender({ trigger: null });
    advance(1_000);
    expect(result.current.present).toBe(false);
    expect(trackSpaceDistractSceneLeft).toHaveBeenCalledOnce();
  });

  it("장면이 사라졌다 같은 공간이 바로 돌아와도 곧장 바뀌지 않고 기준 시간을 다시 잰다", async () => {
    const { result, rerender } = setup(SCENES);
    await settle();
    rerender({ trigger: "PHONE" });
    advance(3_000);
    expect(result.current.present).toBe(true);

    rerender({ assetKey: null, trigger: "PHONE" });
    expect(trackSpaceDistractSceneLeft).toHaveBeenCalledOnce();
    rerender({ assetKey: "rain/1", trigger: "PHONE" });
    await settle();
    expect(result.current.present).toBe(false);

    advance(2_999);
    expect(result.current.present).toBe(false);
    advance(1);
    expect(result.current.present).toBe(true);
    expect(trackSpaceDistractSceneEntered).toHaveBeenCalledTimes(2);
  });

  it("공간이 빠졌다 돌아오면 새로 딴짓하기 전까지 비집중 파일을 받지 않는다", async () => {
    const { result, rerender, loops } = setup(SCENES);
    await settle();
    rerender({ trigger: "PHONE" });
    expect(result.current.armed).toBe(true);
    rerender({ trigger: null });

    rerender({ assetKey: null });
    rerender({ assetKey: "rain/1" });
    await settle();

    expect(result.current.armed).toBe(false);
    expect(loops.filter(({ sound }) => sound.dispose.mock.calls.length === 0)).toEqual([]);

    rerender({ trigger: "AWAY" });
    expect(result.current.armed).toBe(true);
  });

  it("다른 공간으로 바꾸면 앞 공간을 떠난 것으로 알리고, 새 공간에서 딴짓해야 받기 시작한다", async () => {
    const { result, rerender, loops } = setup(SCENES);
    await settle();
    rerender({ trigger: "PHONE" });
    advance(3_000);
    expect(result.current.present).toBe(true);

    rerender({ assetKey: "forest/2", trigger: null });
    expect(trackSpaceDistractSceneLeft).toHaveBeenCalledExactlyOnceWith({
      itemCode: "SPACE_RAIN",
      durationSec: 0,
    });
    await settle();
    expect(result.current.present).toBe(false);
    expect(result.current.armed).toBe(false);
    expect(loops.filter(({ sound }) => sound.dispose.mock.calls.length === 0)).toEqual([]);

    rerender({ assetKey: "forest/2", trigger: "PHONE" });
    expect(result.current.armed).toBe(true);
    expect(loops.at(-1)?.url).toBe("/spaces/forest/2/distract/sound/loop.m4a");
  });

  it("상품 코드가 없어도 바뀌는 순간 신호 소리는 내고 이벤트만 보내지 않는다", async () => {
    const { result, rerender, cues } = setup(SCENES);
    await settle();

    rerender({ itemCode: null, trigger: "PHONE" });
    advance(3_000);

    expect(result.current.present).toBe(true);
    expect(cues[0].sound.play).toHaveBeenCalledExactlyOnceWith("cue");
    expect(trackSpaceDistractSceneEntered).not.toHaveBeenCalled();
  });

  it("비집중 장면이 없는 공간은 바꾸지도 알리지도 않는다", async () => {
    const { result, rerender, options } = setup({ ...SCENES, distract: null });
    await settle();

    rerender({ trigger: "PHONE" });
    advance(20_000);

    expect(result.current).toEqual({
      scene: null,
      armed: false,
      present: false,
      focusLevel: 1,
      hasSound: false,
    });
    expect(options.createCues).not.toHaveBeenCalled();
    expect(options.createSound).not.toHaveBeenCalled();
    expect(trackSpaceDistractSceneEntered).not.toHaveBeenCalled();
  });

  // 집중 반복 소리가 없어도 비집중 장면에 소리가 있으면 음량 줄을 열어야 해서 소리 유무를 따로 알린다.
  it.each([
    {
      name: "비집중 반복 소리",
      distract: { ...DISTRACT, loop: "own", cue: false },
      hasSound: true,
    },
    { name: "신호 소리", distract: { ...DISTRACT, loop: "none", cue: true }, hasSound: true },
    {
      name: "예고 소리",
      distract: { ...DISTRACT, loop: "none", cue: false, approach: true },
      hasSound: true,
    },
    {
      name: "집중 소리를 두는 장면만",
      distract: { ...DISTRACT, loop: "keep", cue: false },
      hasSound: false,
    },
    { name: "비집중 장면 없음", distract: null, hasSound: false },
  ] satisfies { name: string; distract: DistractScene | null; hasSound: boolean }[])(
    "소리 있음 $hasSound: $name",
    async ({ distract, hasSound }) => {
      const { result } = setup({ ...SCENES, focus: { loopSound: false }, distract });
      await settle();

      expect(result.current.hasSound).toBe(hasSound);
    },
  );
});
