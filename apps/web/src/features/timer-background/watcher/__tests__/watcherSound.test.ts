import { describe, expect, it, vi } from "vitest";

import { createWatcherSound } from "../watcherSound";

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
  it("받는 중에 요청한 소리는 받는 대로 늦은 만큼 건너뛰어 울리고, 다가오던 소리는 줄여 끈다", async () => {
    const { context, starts, stops, ramps } = fakeContext();
    const sound = createWatcherSound(() => context as unknown as AudioContext, load);

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
    const sound = createWatcherSound(() => context as unknown as AudioContext, load);
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
    const sound = createWatcherSound(() => context as unknown as AudioContext, load);
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
    const sound = createWatcherSound(() => context as unknown as AudioContext, load);
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
    const sound = createWatcherSound(() => context as unknown as AudioContext, load);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    try {
      sound.play("enter");
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(starts).toEqual([]);
    } finally {
      hidden.mockRestore();
    }
  });
});
