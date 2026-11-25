import { describe, expect, it, vi } from "vitest";

import { createCueSound, createWatcherSound } from "../watcherSound";

function fakeContext() {
  const starts: { cue: number; offset: number }[] = [];
  const stops: number[] = [];
  const ramps: number[] = [];
  const context = {
    state: "running",
    currentTime: 10,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    decodeAudioData: vi.fn((data: ArrayBuffer) =>
      Promise.resolve({ duration: 5, id: new Uint8Array(data)[0] }),
    ),
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: (_: number, at: number) => ramps.push(at),
      },
      connect: (node: unknown) => node,
    }),
    createBufferSource() {
      const source = {
        buffer: null as { id: number } | null,
        onended: null,
        connect: (node: unknown) => node,
        start: (_: number, offset: number) => starts.push({ cue: source.buffer!.id, offset }),
        stop: (at: number) => stops.push(at),
      };
      return source;
    },
  };
  return { context, starts, stops, ramps };
}

const ids: Record<string, number> = { approach: 1, enter: 2, exit: 3 };
const load = (url: string) =>
  Promise.resolve(new Uint8Array([ids[/(\w+)\.m4a$/.exec(url)![1]]]).buffer);

describe("createWatcherSound", () => {
  it("소리는 그 공간 폴더에서 받는다", async () => {
    const { context } = fakeContext();
    const urls: string[] = [];
    const sound = createWatcherSound(
      "watcher/abc",
      () => context as unknown as AudioContext,
      (url) => {
        urls.push(url);
        return load(url);
      },
    );

    sound.prime();

    await vi.waitFor(() => expect(urls).toHaveLength(3));
    expect(urls).toEqual(
      expect.arrayContaining([
        "/spaces/watcher/abc/sound/approach.m4a",
        "/spaces/watcher/abc/sound/enter.m4a",
        "/spaces/watcher/abc/sound/exit.m4a",
      ]),
    );
  });

  it("받는 중에 요청한 소리는 받는 대로 늦은 만큼 건너뛰어 울리고, 다가오던 소리는 줄여 끈다", async () => {
    const { context, starts, stops, ramps } = fakeContext();
    const sound = createWatcherSound("watcher/abc", () => context as unknown as AudioContext, load);

    sound.play("enter", 0.1);
    expect(starts).toEqual([]);
    await vi.waitFor(() => expect(starts).toHaveLength(1));
    expect(starts[0].cue).toBe(2);
    expect(starts[0].offset).toBeGreaterThanOrEqual(0.1);
    await new Promise((resolve) => setTimeout(resolve, 0));

    sound.play("approach");
    expect(starts[1].cue).toBe(1);
    expect(starts[1].offset).toBeLessThan(0.01);

    sound.fadeApproach();
    expect(ramps).toEqual([10.6]);
    expect(stops.at(-1)).toBe(10.6);
  });

  it("멈춘 컨텍스트에서 요청한 소리는 깨어난 뒤에 울리고, 그 전에 줄여 끄면 울리지 않는다", async () => {
    const { context, starts } = fakeContext();
    const sound = createWatcherSound("watcher/abc", () => context as unknown as AudioContext, load);
    sound.prime();
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 0));

    context.state = "suspended";
    let wake = () => {};
    context.resume.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          wake = () => {
            context.state = "running";
            resolve();
          };
        }),
    );
    sound.play("approach");
    sound.play("exit");
    sound.fadeApproach();
    expect(starts).toEqual([]);

    wake();
    await vi.waitFor(() => expect(starts).toHaveLength(1));
    expect(starts[0].cue).toBe(3);
  });

  it("소리를 끄면 나던 소리를 줄여 끄고, 켜기 전까지 새 소리를 내지 않는다", async () => {
    const { context, starts, stops } = fakeContext();
    const sound = createWatcherSound("watcher/abc", () => context as unknown as AudioContext, load);
    sound.prime();
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    sound.play("approach");

    sound.setMuted(true);
    expect(stops).toEqual([10.2]);
    sound.play("enter");
    expect(starts).toHaveLength(1);

    sound.setMuted(false);
    sound.play("enter");
    expect(starts.at(-1)?.cue).toBe(2);
  });

  it("음량은 새로 나는 소리와 나던 소리에 함께 걸리고, 0이면 새 소리를 내지 않는다", async () => {
    const gains: { value: number; setValueAtTime: ReturnType<typeof vi.fn> }[] = [];
    const { context, starts } = fakeContext();
    const createGain = context.createGain;
    context.createGain = () => {
      const node = createGain();
      gains.push(node.gain);
      return node;
    };
    const sound = createWatcherSound("watcher/abc", () => context as unknown as AudioContext, load);
    sound.setVolume(0.4);

    sound.play("enter");
    await vi.waitFor(() => expect(starts).toHaveLength(1));
    expect(gains[0].value).toBe(0.4);

    sound.setVolume(0.8);
    expect(gains[0].setValueAtTime).toHaveBeenCalledWith(0.8, 10);

    sound.setVolume(0);
    sound.play("exit");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(starts).toHaveLength(1);
  });

  it("화면이 숨겨진 동안에는 새 소리를 내지 않는다", async () => {
    const { context, starts } = fakeContext();
    const sound = createWatcherSound("watcher/abc", () => context as unknown as AudioContext, load);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      sound.play("enter");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(starts).toEqual([]);
    } finally {
      hidden.mockRestore();
    }
  });

  it("소리를 받지 못하면 1초 뒤 다시 받아, 늦은 만큼 건너뛰어 울린다", async () => {
    const { context, starts } = fakeContext();
    let failures = 1;
    const flaky = (url: string) =>
      url.endsWith("exit.m4a") && failures-- > 0 ? Promise.reject(new Error("offline")) : load(url);
    const sound = createWatcherSound(
      "watcher/abc",
      () => context as unknown as AudioContext,
      flaky,
    );

    sound.play("exit");
    await vi.waitFor(() => expect(starts).toHaveLength(1), { timeout: 3_000 });
    expect(starts[0].cue).toBe(3);
    expect(starts[0].offset).toBeGreaterThanOrEqual(0.9);
  });
});

describe("createWatcherSound 무음 스위치", () => {
  function fakeKeepAlive(play: () => unknown = () => Promise.resolve()) {
    const element = {
      paused: true,
      play: vi.fn(() => {
        const result = play();
        element.paused = false;
        return result;
      }),
      pause: vi.fn(() => {
        element.paused = true;
      }),
    };
    return element;
  }

  function setup(keepAlive: ReturnType<typeof fakeKeepAlive> | null = fakeKeepAlive()) {
    const { context, starts } = fakeContext();
    const sound = createWatcherSound(
      "watcher/abc",
      () => context as unknown as AudioContext,
      load,
      () => keepAlive as unknown as HTMLAudioElement | null,
    );
    return { sound, keepAlive, starts };
  }

  it("깨우면 무음 루프를 틀어 iOS 무음 모드에서도 발소리가 나게 한다", () => {
    const { sound, keepAlive } = setup();
    sound.prime();
    expect(keepAlive!.play).toHaveBeenCalledTimes(1);
    sound.prime();
    expect(keepAlive!.play).toHaveBeenCalledTimes(1);
  });

  it("음량이 0이거나 멈추면 무음 루프도 멈춘다", () => {
    const { sound, keepAlive } = setup();
    const stops: [string, () => void][] = [
      ["음량 0", () => sound.setVolume(0)],
      ["stopAll", () => sound.stopAll()],
      ["dispose", () => sound.dispose()],
    ];
    for (const [name, stop] of stops) {
      sound.setVolume(0.8);
      sound.prime();
      expect(keepAlive!.paused, `${name} 전`).toBe(false);
      stop();
      expect(keepAlive!.paused, `${name} 뒤`).toBe(true);
    }
  });

  it("심플 모드처럼 잠시 소리를 끈 동안에는 무음 루프를 그대로 둬서 돌아올 때 화면을 누르지 않아도 된다", () => {
    const { sound, keepAlive } = setup();
    sound.prime();
    sound.setMuted(true);
    expect(keepAlive!.paused).toBe(false);
    sound.setMuted(false);
    expect(keepAlive!.play).toHaveBeenCalledTimes(1);
  });

  it("음량이 0인 동안 깨워도 무음 루프를 틀지 않고, 음량을 올린 뒤 깨우면 다시 튼다", () => {
    const { sound, keepAlive } = setup();
    sound.setVolume(0);
    sound.prime();
    expect(keepAlive!.play).not.toHaveBeenCalled();

    sound.setVolume(0.8);
    sound.prime();
    expect(keepAlive!.play).toHaveBeenCalledTimes(1);
  });

  it("화면이 숨겨져 멈춘 뒤 다시 누르면 무음 루프를 다시 튼다", () => {
    const { sound, keepAlive } = setup();
    sound.prime();
    sound.stopAll();
    expect(keepAlive!.paused).toBe(true);

    sound.prime();
    expect(keepAlive!.paused).toBe(false);
    expect(keepAlive!.play).toHaveBeenCalledTimes(2);
  });

  it("멈춘 뒤에는 음량을 바꿔도 무음 루프를 틀지 않는다", () => {
    const { sound, keepAlive } = setup();
    sound.prime();
    expect(keepAlive!.paused).toBe(false);
    sound.stopAll();
    sound.setVolume(0.5);
    expect(keepAlive!.paused).toBe(true);
    expect(keepAlive!.play).toHaveBeenCalledTimes(1);
  });

  it("무음 루프가 없는 엔진이나 재생이 거부돼도 발소리는 그대로 난다", async () => {
    for (const keepAlive of [null, fakeKeepAlive(() => Promise.reject(new Error("NotAllowed")))]) {
      const { sound, starts } = setup(keepAlive);
      expect(() => sound.prime()).not.toThrow();
      sound.play("enter");
      await vi.waitFor(() => expect(starts).toHaveLength(1));
    }
  });
});

describe("createCueSound", () => {
  const DISTRACT_URLS = {
    approach: "/spaces/rain/1/distract/sound/approach.m4a",
    cue: "/spaces/rain/1/distract/sound/cue.m4a",
  };
  const loadDistract = (url: string) =>
    Promise.resolve(new Uint8Array([url.endsWith("cue.m4a") ? 4 : 1]).buffer);

  it("넘긴 소리만 받고, 넘기지 않은 소리는 내지 않는다", async () => {
    const { context, starts } = fakeContext();
    const urls: string[] = [];
    const sound = createCueSound(
      DISTRACT_URLS,
      () => context as unknown as AudioContext,
      (url) => {
        urls.push(url);
        return loadDistract(url);
      },
    );

    sound.prime();
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    sound.play("enter");
    sound.play("cue");

    expect(urls).toEqual(expect.arrayContaining(Object.values(DISTRACT_URLS)));
    expect(starts).toEqual([{ cue: 4, offset: expect.any(Number) }]);
  });

  it("받은 소리의 길이를 알려 주고, 넘기지 않은 소리는 null이다", async () => {
    const { context } = fakeContext();
    const sound = createCueSound(
      { approach: DISTRACT_URLS.approach },
      () => context as unknown as AudioContext,
      loadDistract,
    );

    await expect(sound.durationSec("approach")).resolves.toBe(5);
    await expect(sound.durationSec("cue")).resolves.toBeNull();
  });

  it("정리한 뒤에는 깨우거나 틀거나 길이를 물어도 컨텍스트와 무음 루프를 다시 만들지 않는다", async () => {
    const { context, starts } = fakeContext();
    const createContext = vi.fn(() => context as unknown as AudioContext);
    const keepAlive = { paused: true, play: vi.fn(), pause: vi.fn() };
    const keepAliveFactory = vi.fn(() => keepAlive as unknown as HTMLAudioElement);
    const sound = createCueSound(DISTRACT_URLS, createContext, loadDistract, keepAliveFactory);

    sound.dispose();
    sound.prime();
    sound.play("cue");
    sound.setVolume(0.5);

    await expect(sound.durationSec("approach")).resolves.toBeNull();
    expect(createContext).not.toHaveBeenCalled();
    expect(keepAliveFactory).not.toHaveBeenCalled();
    expect(keepAlive.play).not.toHaveBeenCalled();
    expect(starts).toEqual([]);
  });

  it("컨텍스트를 만들 수 없으면 길이는 null이다", async () => {
    const sound = createCueSound(
      { approach: DISTRACT_URLS.approach },
      () => {
        throw new Error("AudioContext unsupported");
      },
      loadDistract,
    );

    await expect(sound.durationSec("approach")).resolves.toBeNull();
  });
});
