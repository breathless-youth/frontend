import { describe, expect, it, vi } from "vitest";

import { createLoopSound } from "../loopSound";

const URL = "/spaces/rain/1a2b3c4d/sound/loop.m4a";

function fakeContext() {
  const sources: { loop: boolean; buffer: unknown; started: boolean; stopped: boolean }[] = [];
  const gain = { value: 1, setTargetAtTime: vi.fn((v: number) => (gain.value = v)) };
  const context = {
    state: "running",
    currentTime: 0,
    destination: {},
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    decodeAudioData: vi.fn(() => Promise.resolve({ duration: 16 })),
    createGain: () => ({ gain, connect: (node: unknown) => node }),
    createBufferSource() {
      const source = {
        loop: false,
        buffer: null as unknown,
        started: false,
        stopped: false,
        connect: (node: unknown) => node,
        start() {
          source.started = true;
        },
        stop() {
          source.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
  };
  return { context: context as unknown as AudioContext, sources, gain, raw: context };
}

function fakeKeepAlive() {
  const element = {
    paused: true,
    play: vi.fn(() => {
      element.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn(() => {
      element.paused = true;
    }),
  };
  return element;
}

const load = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));

describe("createLoopSound", () => {
  it("깨운 뒤 켜면 공간 폴더의 소리를 끊김 없이 반복 재생한다", async () => {
    const { context, sources } = fakeContext();
    const urls: string[] = [];
    const sound = createLoopSound(
      URL,
      () => context,
      (url) => {
        urls.push(url);
        return load();
      },
      () => null,
    );

    sound.prime();
    sound.setActive(true);

    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(urls).toEqual([URL]);
    expect(sources[0]).toMatchObject({ loop: true, started: true, stopped: false });
  });

  it("음량을 바꾸면 게인이 따라가고, 0이면 무음 루프도 멈춘다", async () => {
    const { context, sources, gain } = fakeContext();
    const keepAlive = fakeKeepAlive();
    const sound = createLoopSound(
      URL,
      () => context,
      load,
      () => keepAlive as never,
    );

    sound.prime();
    sound.setActive(true);
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(keepAlive.paused).toBe(false);

    sound.setVolume(0.5);
    expect(gain.value).toBe(0.5);

    sound.setVolume(0);
    expect(gain.value).toBe(0);
    expect(keepAlive.paused).toBe(true);
  });

  it("끄면 재생이 멈추고, 다시 켜면 새로 반복한다", async () => {
    const { context, sources } = fakeContext();
    const keepAlive = fakeKeepAlive();
    const sound = createLoopSound(
      URL,
      () => context,
      load,
      () => keepAlive as never,
    );

    sound.prime();
    sound.setActive(true);
    await vi.waitFor(() => expect(sources).toHaveLength(1));

    sound.setActive(false);
    expect(sources[0].stopped).toBe(true);
    expect(keepAlive.paused).toBe(true);

    sound.setActive(true);
    expect(sources).toHaveLength(2);
    expect(sources[1]).toMatchObject({ loop: true, started: true });
  });

  it("소리를 받지 못해도 예외 없이 아무 소리도 내지 않는다", async () => {
    const { context, sources } = fakeContext();
    const failing = vi.fn(() => Promise.reject(new Error("403")));
    const sound = createLoopSound(
      URL,
      () => context,
      failing,
      () => null,
    );

    expect(() => {
      sound.prime();
      sound.setActive(true);
    }).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sources).toHaveLength(0);
  });

  it("받는 동안 끄면 다 받아도 재생하지 않고, 여러 번 켜도 하나만 재생한다", async () => {
    const { context, sources } = fakeContext();
    let finish!: (data: ArrayBuffer) => void;
    const slow = vi.fn(() => new Promise<ArrayBuffer>((resolve) => (finish = resolve)));
    const sound = createLoopSound(
      URL,
      () => context,
      slow,
      () => null,
    );

    sound.prime();
    sound.setActive(true);
    sound.setActive(false);
    finish(new ArrayBuffer(8));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sources).toHaveLength(0);

    sound.setActive(true);
    sound.setActive(true);
    expect(sources).toHaveLength(1);
  });

  it("정리한 뒤에 늦게 받은 소리는 재생하지 않는다", async () => {
    const { context, sources } = fakeContext();
    let finish!: (data: ArrayBuffer) => void;
    const slow = vi.fn(() => new Promise<ArrayBuffer>((resolve) => (finish = resolve)));
    const sound = createLoopSound(
      URL,
      () => context,
      slow,
      () => null,
    );

    sound.prime();
    sound.setActive(true);
    sound.dispose();
    finish(new ArrayBuffer(8));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sources).toHaveLength(0);
  });

  it("깨울 때는 꺼져 있거나 음량이 0이어도 무음 루프를 켜서 다음 재생을 허락받는다", () => {
    const { context } = fakeContext();
    const keepAlive = fakeKeepAlive();
    const sound = createLoopSound(
      URL,
      () => context,
      load,
      () => keepAlive as never,
    );

    sound.setVolume(0);
    sound.prime();

    expect(keepAlive.play).toHaveBeenCalledOnce();
  });

  it("처음 만들 때 이미 정한 음량으로 시작하고, 0은 바로 적용한다", async () => {
    const { context, gain } = fakeContext();
    const sound = createLoopSound(
      URL,
      () => context,
      load,
      () => null,
    );

    sound.setVolume(0);
    sound.setActive(true);
    expect(gain.value).toBe(0);
  });

  it("컨텍스트를 처음에 만들지 못해도 다음에 깨울 때 다시 만들어 한 번만 재생한다", async () => {
    const { context, sources } = fakeContext();
    const make = vi
      .fn<() => AudioContext>()
      .mockImplementationOnce(() => {
        throw new Error("not allowed");
      })
      .mockImplementation(() => context);
    const sound = createLoopSound(URL, make, load, () => null);

    sound.prime();
    sound.setActive(true);
    expect(sources).toHaveLength(0);

    sound.prime();
    await vi.waitFor(() => expect(sources).toHaveLength(1));
    expect(make).toHaveBeenCalledTimes(2);
  });

  it("정리한 뒤 다시 켜면 컨텍스트를 새로 만들어 다시 재생한다", async () => {
    const first = fakeContext();
    const second = fakeContext();
    const make = vi
      .fn<() => AudioContext>()
      .mockImplementationOnce(() => first.context)
      .mockImplementation(() => second.context);
    const sound = createLoopSound(URL, make, load, () => null);

    sound.setActive(true);
    await vi.waitFor(() => expect(first.sources).toHaveLength(1));
    sound.dispose();

    sound.setActive(true);
    await vi.waitFor(() => expect(second.sources).toHaveLength(1));
    expect(second.sources[0]).toMatchObject({ loop: true, started: true });
  });

  it("정리하면 재생을 멈추고 컨텍스트를 닫는다", async () => {
    const { context, sources, raw } = fakeContext();
    const sound = createLoopSound(
      URL,
      () => context,
      load,
      () => null,
    );

    sound.prime();
    sound.setActive(true);
    await vi.waitFor(() => expect(sources).toHaveLength(1));

    sound.dispose();

    expect(sources[0].stopped).toBe(true);
    expect(raw.close).toHaveBeenCalledOnce();
  });
});
