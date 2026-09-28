import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import type { StudyRoomPhase } from "@/features/study-session/useStudyRoomSession";
import type { SessionState } from "@/features/study-session/sessionState";
import { FOCUS_STATE, distractionState, pauseState } from "@/features/study-session/sessionState";

import type { AmbientPlayer, AmbientPlayerState } from "../ambientPlayer";
import { createMemoryPlayer } from "../ambientPlayer";
import type { AmbientSoundSettings, AmbientSoundStore } from "../ambientSoundStore";
import {
  DEFAULT_AMBIENT_SETTINGS,
  createMemoryAmbientSoundStore,
  resetAmbientSoundStore,
  setAmbientSoundStore,
} from "../ambientSoundStore";
import { createAmbientUsage } from "../ambientUsage";
import type { AmbientSound } from "../catalog";
import { useAmbientSound } from "../useAmbientSound";

const mocks = vi.hoisted(() => ({
  changed: vi.fn(),
  duckToggled: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackAmbientSoundChanged: mocks.changed,
  trackAmbientSoundDuckToggled: mocks.duckToggled,
}));

const catalog: AmbientSound[] = [
  { id: "white", kind: "synth", label: "백색소음" },
  { id: "pink", kind: "synth", label: "핑크노이즈" },
  { id: "rain", kind: "file", label: "빗소리", file: "rain.mp3" },
  { id: "cafe", kind: "file", label: "카페", file: "cafe.mp3" },
];

const STUDYING: StudyRoomPhase = { name: "studying" };
const DONE: StudyRoomPhase = { name: "done", sessions: [] };

type Props = { sessionState: SessionState; phase: StudyRoomPhase };

function setup(
  initial: Partial<AmbientSoundSettings> = {},
  initialProps: Props = defaultProps(),
  injectedCatalog: readonly AmbientSound[] = catalog,
) {
  const store = createMemoryAmbientSoundStore({ ...DEFAULT_AMBIENT_SETTINGS, ...initial });
  setAmbientSoundStore(store);
  const player = createMemoryPlayer();
  let nowMs = 0;
  const usage = createAmbientUsage(() => nowMs);
  const hook = renderHook(
    (props: Props) => useAmbientSound({ ...props, usage, player, catalog: injectedCatalog }),
    { initialProps },
  );
  return {
    ...hook,
    player,
    usage,
    store,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

function defaultProps(): Props {
  return { sessionState: FOCUS_STATE, phase: STUDYING };
}

/** 저장소·카탈로그 로드는 resolved Promise 몇 단이다 — 매크로태스크 하나로 전부 흘려보낸다. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  resetAmbientSoundStore();
});

describe("useAmbientSound — 자동 시작", () => {
  it("저장된 믹스가 비어 있지 않으면 세션 시작에 그대로 재생하고 auto_start 이벤트를 보낸다", async () => {
    const { result, player } = setup({ mix: { rain: 70, white: 40 } });
    await flush();

    expect(player.commands).toEqual([{ type: "applyMix", mix: { rain: 70, white: 40 } }]);
    expect(result.current.mix).toEqual({ rain: 70, white: 40 });
    expect(result.current.isOn).toBe(true);
    expect(mocks.changed).toHaveBeenCalledTimes(1);
    expect(mocks.changed).toHaveBeenCalledWith({ sounds: ["white", "rain"], source: "auto_start" });
  });

  it("저장된 믹스가 비어 있으면 플레이어를 건드리지 않고 이벤트도 없다", async () => {
    const { result, player } = setup();
    await flush();

    expect(player.commands).toEqual([]);
    expect(result.current.isOn).toBe(false);
    expect(result.current.catalog).toEqual(catalog);
    expect(mocks.changed).not.toHaveBeenCalled();
  });

  it("카탈로그에 없는 소리 id 는 복원 시 지우고 지운 결과를 저장한다", async () => {
    const { result, player, store } = setup({ mix: { rain: 70, ghost: 50 } });
    await flush();

    expect(player.commands).toEqual([{ type: "applyMix", mix: { rain: 70 } }]);
    expect(result.current.mix).toEqual({ rain: 70 });
    await expect(store.load()).resolves.toMatchObject({ mix: { rain: 70 } });
  });

  it("전부 카탈로그 밖이면 빈 믹스라 재생하지 않는다", async () => {
    const { player } = setup({ mix: { ghost: 50 } });
    await flush();

    expect(player.commands).toEqual([]);
    expect(mocks.changed).not.toHaveBeenCalled();
  });

  it("카탈로그를 못 받아 비어 있으면 저장된 믹스를 지우지 않고 재생만 건너뛴다", async () => {
    const { result, player, store } = setup({ mix: { white: 60 } }, defaultProps(), []);
    await flush();

    expect(player.commands).toEqual([]);
    expect(mocks.changed).not.toHaveBeenCalled();
    expect(result.current.mix).toEqual({ white: 60 });
    await expect(store.load()).resolves.toMatchObject({ mix: { white: 60 } });
  });
});

describe("useAmbientSound — 세션 전이", () => {
  it("일시정지에 suspend, 해제에 resume 를 한 번씩 보낸다", async () => {
    const { rerender, player } = setup({ mix: { white: 60 } });
    await flush();

    rerender({ sessionState: pauseState("MANUAL"), phase: STUDYING });
    // 트리거만 바뀐 일시정지는 같은 정지다 — 다시 suspend 하지 않는다.
    rerender({ sessionState: pauseState("BACKGROUND"), phase: STUDYING });
    rerender({ sessionState: FOCUS_STATE, phase: STUDYING });

    expect(player.commands.slice(1)).toEqual([{ type: "suspend" }, { type: "resume" }]);
  });

  it("비집중이면 setDucked(true), 집중 복귀에 false — 트리거가 바뀌어도 한 번만", async () => {
    const { rerender, player } = setup({ mix: { white: 60 } });
    await flush();

    rerender({ sessionState: distractionState("AWAY"), phase: STUDYING });
    rerender({ sessionState: distractionState("PHONE"), phase: STUDYING });
    rerender({ sessionState: FOCUS_STATE, phase: STUDYING });

    expect(player.commands.slice(1)).toEqual([
      { type: "setDucked", ducked: true },
      { type: "setDucked", ducked: false },
    ]);
  });

  it("연동이 꺼져 있으면 비집중에도 낮추지 않는다", async () => {
    const { rerender, player } = setup({ mix: { white: 60 }, duckEnabled: false });
    await flush();

    rerender({ sessionState: distractionState("AWAY"), phase: STUDYING });
    rerender({ sessionState: FOCUS_STATE, phase: STUDYING });

    expect(player.commands.slice(1)).toEqual([]);
  });

  it("비집중 중에 연동을 끄면 즉시 원래 음량으로, 다시 켜면 즉시 낮춘다", async () => {
    const { result, rerender, player } = setup({ mix: { white: 60 } });
    await flush();
    rerender({ sessionState: distractionState("AWAY"), phase: STUDYING });

    act(() => {
      result.current.setDuckEnabled(false);
    });
    act(() => {
      result.current.setDuckEnabled(true);
    });

    expect(player.commands.slice(1)).toEqual([
      { type: "setDucked", ducked: true },
      { type: "setDucked", ducked: false },
      { type: "setDucked", ducked: true },
    ]);
    expect(mocks.duckToggled).toHaveBeenNthCalledWith(1, false);
    expect(mocks.duckToggled).toHaveBeenNthCalledWith(2, true);
  });

  it("세션이 끝나면(phase !== studying) dispose 하고 이후 전이는 무시한다", async () => {
    const { rerender, player } = setup({ mix: { white: 60 } });
    await flush();

    rerender({ sessionState: FOCUS_STATE, phase: DONE });
    rerender({ sessionState: pauseState("MANUAL"), phase: DONE });

    expect(player.commands.slice(1)).toEqual([{ type: "dispose" }]);
  });

  it("언마운트에 dispose 한다", async () => {
    const { unmount, player } = setup({ mix: { white: 60 } });
    await flush();

    unmount();

    expect(player.commands.at(-1)).toEqual({ type: "dispose" });
  });

  it("복원 세션이 일시정지 상태로 시작하면 재생을 걸고 바로 멈춘다", async () => {
    const { player } = setup(
      { mix: { white: 60 } },
      {
        sessionState: pauseState("BACKGROUND"),
        phase: STUDYING,
      },
    );
    await flush();

    expect(player.commands).toEqual([
      { type: "applyMix", mix: { white: 60 } },
      { type: "suspend" },
    ]);
    expect(player.getState()).toBe("suspended");
  });
});

describe("useAmbientSound — 사용 시간", () => {
  it("재생 중에만 누적하고 일시정지·종료에 멈춘다 — 재개는 컨텍스트가 살아난 뒤부터 센다", async () => {
    const { rerender, usage, advance } = setup({ mix: { white: 60 } });
    await flush();

    advance(3_000);
    rerender({ sessionState: pauseState("MANUAL"), phase: STUDYING });
    await flush();
    advance(10_000);
    rerender({ sessionState: FOCUS_STATE, phase: STUDYING });
    await flush();
    advance(2_000);
    rerender({ sessionState: FOCUS_STATE, phase: DONE });
    advance(50_000);

    expect(usage.snapshot()).toEqual({ used: true, sec: 5 });
  });

  it("자동재생이 막히면 blocked 이고 세지 않다가, 사용자 탭으로 살아나면 blocked 가 풀리고 센다", async () => {
    // resume 이 settle 된 뒤에야 상태가 바뀌는 플레이어 — 명령 직후 읽으면 직전 상태가 보인다.
    let state: AmbientPlayerState = "idle";
    let allowed = false;
    const settle = (next: () => AmbientPlayerState) =>
      Promise.resolve().then(() => {
        state = next();
      });
    const attempt = () => (allowed ? "playing" : "blocked") as AmbientPlayerState;
    const player: AmbientPlayer = {
      applyMix: () => settle(attempt).then(() => ({ failed: [] })),
      setDucked: () => {},
      suspend: () => settle(() => "suspended"),
      resume: () => settle(attempt),
      dispose: () => {
        state = "idle";
      },
      getState: () => state,
    };
    setAmbientSoundStore(
      createMemoryAmbientSoundStore({ ...DEFAULT_AMBIENT_SETTINGS, mix: { white: 60 } }),
    );
    let nowMs = 0;
    const usage = createAmbientUsage(() => nowMs);
    const { result } = renderHook(() =>
      useAmbientSound({ ...defaultProps(), usage, player, catalog }),
    );
    await flush();

    expect(result.current.blocked).toBe(true);
    nowMs += 5_000;
    expect(usage.snapshot()).toEqual({ used: false, sec: 0 });

    allowed = true;
    await act(async () => {
      result.current.changeLevel("pink", 60);
    });
    await flush();

    expect(result.current.blocked).toBe(false);
    nowMs += 4_000;
    expect(usage.snapshot()).toEqual({ used: true, sec: 4 });
  });

  it("소리를 켠 적이 없으면 미사용이다", async () => {
    const { rerender, usage, advance } = setup();
    await flush();

    advance(10_000);
    rerender({ sessionState: FOCUS_STATE, phase: DONE });

    expect(usage.snapshot()).toEqual({ used: false, sec: 0 });
  });

  it("음량을 올렸다 0 으로 내리면 그 사이만 센다", async () => {
    const { result, usage, advance } = setup();
    await flush();

    advance(5_000);
    await act(async () => {
      result.current.changeLevel("white", 60);
    });
    advance(4_000);
    await act(async () => {
      result.current.changeLevel("white", 0);
    });
    advance(9_000);

    expect(usage.snapshot()).toEqual({ used: true, sec: 4 });
  });
});

describe("useAmbientSound — 음량 조작", () => {
  it("소리를 켜면 applyMix·저장·시트 이벤트, 레벨만 바꾸면 이벤트 없이 applyMix·저장", async () => {
    const { result, player, store } = setup();
    await flush();

    await act(async () => {
      result.current.changeLevel("rain", 60);
    });
    expect(result.current.mix).toEqual({ rain: 60 });
    expect(mocks.changed).toHaveBeenLastCalledWith({ sounds: ["rain"], source: "dialog" });

    await act(async () => {
      result.current.changeLevel("rain", 30);
    });
    expect(result.current.mix).toEqual({ rain: 30 });
    expect(mocks.changed).toHaveBeenCalledTimes(1);
    expect(player.commands).toEqual([
      { type: "applyMix", mix: { rain: 60 } },
      { type: "applyMix", mix: { rain: 30 } },
    ]);
    await expect(store.load()).resolves.toMatchObject({ mix: { rain: 30 } });
  });

  it("레벨을 0으로 내리면 꺼진 것이라 이벤트를 보낸다", async () => {
    const { result } = setup({ mix: { rain: 60 } });
    await flush();

    await act(async () => {
      result.current.changeLevel("rain", 0);
    });

    expect(result.current.mix).toEqual({});
    expect(mocks.changed).toHaveBeenLastCalledWith({ sounds: [], source: "dialog" });
  });

  it("아이콘으로 끄면 0 이 되고 다시 켜면 직전 음량으로 돌아온다", async () => {
    const { result } = setup({ mix: { rain: 37 } });
    await flush();

    await act(async () => {
      result.current.toggleSound("rain");
    });
    expect(result.current.mix).toEqual({});

    await act(async () => {
      result.current.toggleSound("rain");
    });
    expect(result.current.mix).toEqual({ rain: 37 });
  });

  /**
   * 슬라이더를 끝까지 내리는 것도 끄는 것이다. 그때 음량을 붙잡아 두지 않으면 아이콘으로
   * 다시 켤 때 기본값 60 으로 튄다.
   */
  it("슬라이더로 직접 0 을 만들어도 직전 음량을 기억한다", async () => {
    const { result } = setup({ mix: { rain: 37 } });
    await flush();

    await act(async () => {
      result.current.changeLevel("rain", 0);
    });
    expect(result.current.mix).toEqual({});

    await act(async () => {
      result.current.toggleSound("rain");
    });
    expect(result.current.mix).toEqual({ rain: 37 });
  });

  it("들어 본 적 없는 소리를 아이콘으로 켜면 기본 음량으로 시작한다", async () => {
    const { result } = setup();
    await flush();

    await act(async () => {
      result.current.toggleSound("white");
    });

    expect(result.current.mix).toEqual({ white: 60 });
  });

  /** 겹쳐 켜는 개수에 상한이 없다. 네 번째가 막히면 여기서 잡는다. */
  it("3개가 켜진 상태에서도 네 번째를 켠다", async () => {
    const { result, store } = setup({ mix: { white: 60, pink: 60, rain: 60 } });
    await flush();

    await act(async () => {
      result.current.changeLevel("cafe", 40);
    });

    expect(result.current.mix).toEqual({ white: 60, pink: 60, rain: 60, cafe: 40 });
    expect(mocks.changed).toHaveBeenLastCalledWith({
      sounds: ["white", "pink", "rain", "cafe"],
      source: "dialog",
    });
    await expect(store.load()).resolves.toMatchObject({
      mix: { white: 60, pink: 60, rain: 60, cafe: 40 },
    });
  });

  it("저장 실패는 화면 상태를 막지 않는다", async () => {
    const failing: AmbientSoundStore = {
      load: () => Promise.resolve(DEFAULT_AMBIENT_SETTINGS),
      save: () => Promise.reject(new Error("quota")),
    };
    setAmbientSoundStore(failing);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const player = createMemoryPlayer();
    const usage = createAmbientUsage(() => 0);
    const { result } = renderHook(() =>
      useAmbientSound({ ...defaultProps(), usage, player, catalog }),
    );
    await flush();

    await act(async () => {
      result.current.changeLevel("white", 60);
    });

    expect(result.current.mix).toEqual({ white: 60 });
    expect(player.commands).toEqual([{ type: "applyMix", mix: { white: 60 } }]);
    warn.mockRestore();
  });

  it("플레이어가 불러오지 못한 소리는 믹스에서 뺀다", async () => {
    const player = createMemoryPlayer();
    player.applyMix = (mix) => {
      player.commands.push({ type: "applyMix", mix });
      return Promise.resolve({ failed: ["rain"] });
    };
    setAmbientSoundStore(createMemoryAmbientSoundStore({ ...DEFAULT_AMBIENT_SETTINGS }));
    const usage = createAmbientUsage(() => 0);
    const { result } = renderHook(() =>
      useAmbientSound({ ...defaultProps(), usage, player, catalog }),
    );
    await flush();

    await act(async () => {
      result.current.changeLevel("rain", 60);
    });
    await flush();

    expect(result.current.mix).toEqual({});
  });
});
