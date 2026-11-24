import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LoopSound } from "../loopSound";
import type { SpaceScenes } from "../spaceManifest";
import { useSpaceLoopSound } from "../useSpaceLoopSound";

const WITH_SOUND: SpaceScenes = { focus: { loopSound: true }, distract: null };
const SILENT: SpaceScenes = { focus: { loopSound: false }, distract: null };

function fakeSound() {
  return {
    prime: vi.fn(),
    setActive: vi.fn(),
    setVolume: vi.fn(),
    dispose: vi.fn(),
  } satisfies LoopSound;
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  setHidden(false);
});

function setup(
  scenes: Record<string, SpaceScenes>,
  initial: { key: string | null; active: boolean },
) {
  const sounds: { url: string; sound: ReturnType<typeof fakeSound> }[] = [];
  const createSound = vi.fn((url: string) => {
    const sound = fakeSound();
    sounds.push({ url, sound });
    return sound;
  });
  const loadScenes = vi.fn((key: string) => Promise.resolve(scenes[key]));
  const view = renderHook(
    ({ key, active, volume }) =>
      useSpaceLoopSound(key, active, volume, { loadScenes, createSound }),
    { initialProps: { ...initial, volume: 80 } },
  );
  return { ...view, sounds, createSound, loadScenes };
}

describe("useSpaceLoopSound", () => {
  it("소리 있는 공간이고 공부 중이면 그 공간의 반복 소리를 켜고 공간 음량을 따른다", async () => {
    const { result, sounds, rerender } = setup(
      { "rain/1": WITH_SOUND },
      { key: "rain/1", active: true },
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(sounds).toHaveLength(1);
    expect(sounds[0].url).toBe("/spaces/rain/1/sound/loop.m4a");
    expect(sounds[0].sound.setActive).toHaveBeenLastCalledWith(true);
    expect(sounds[0].sound.setVolume).toHaveBeenLastCalledWith(0.8);

    rerender({ key: "rain/1", active: true, volume: 30 });
    expect(sounds[0].sound.setVolume).toHaveBeenLastCalledWith(0.3);
  });

  it("공부를 멈추거나 화면이 숨으면 끄고, 돌아오면 다시 켠다", async () => {
    const { result, sounds, rerender } = setup(
      { "rain/1": WITH_SOUND },
      { key: "rain/1", active: true },
    );
    await waitFor(() => expect(result.current).toBe(true));
    const sound = sounds[0].sound;

    rerender({ key: "rain/1", active: false, volume: 80 });
    expect(sound.setActive).toHaveBeenLastCalledWith(false);

    rerender({ key: "rain/1", active: true, volume: 80 });
    expect(sound.setActive).toHaveBeenLastCalledWith(true);

    act(() => setHidden(true));
    expect(sound.setActive).toHaveBeenLastCalledWith(false);

    act(() => setHidden(false));
    expect(sound.setActive).toHaveBeenLastCalledWith(true);
  });

  it("매니페스트에 소리가 없으면 소리 파일을 받지 않는다", async () => {
    const { result, createSound, loadScenes } = setup(
      { "plain/1": SILENT },
      { key: "plain/1", active: true },
    );

    await waitFor(() => expect(loadScenes).toHaveBeenCalledWith("plain/1"));
    await act(async () => {});

    expect(result.current).toBe(false);
    expect(createSound).not.toHaveBeenCalled();
  });

  it("공간이 바뀌면 앞 공간의 재생기를 정리한다", async () => {
    const { result, sounds, rerender } = setup(
      { "rain/1": WITH_SOUND, "fire/2": WITH_SOUND },
      { key: "rain/1", active: true },
    );
    await waitFor(() => expect(result.current).toBe(true));

    rerender({ key: "fire/2", active: true, volume: 80 });

    await waitFor(() => expect(sounds).toHaveLength(2));
    expect(sounds[0].sound.dispose).toHaveBeenCalledOnce();
    expect(sounds[1].url).toBe("/spaces/fire/2/sound/loop.m4a");
  });

  it("공간을 빠르게 바꿔 앞 공간 응답이 늦게 와도 지금 공간의 소리만 남는다", async () => {
    const pending: Record<string, (scenes: SpaceScenes) => void> = {};
    const sounds: string[] = [];
    const loadScenes = vi.fn(
      (key: string) => new Promise<SpaceScenes>((resolve) => (pending[key] = resolve)),
    );
    const createSound = vi.fn((url: string) => {
      sounds.push(url);
      return fakeSound();
    });
    const { result, rerender } = renderHook(
      ({ key }) => useSpaceLoopSound(key, true, 80, { loadScenes, createSound }),
      { initialProps: { key: "rain/1" } },
    );
    rerender({ key: "fire/2" });

    await act(async () => pending["fire/2"](WITH_SOUND));
    await act(async () => pending["rain/1"](WITH_SOUND));

    expect(result.current).toBe(true);
    expect(sounds).toEqual(["/spaces/fire/2/sound/loop.m4a"]);
  });

  it("새 재생기는 음량을 먼저 받고 켜진다", async () => {
    const order: string[] = [];
    const createSound = vi.fn(() => ({
      prime: vi.fn(),
      setActive: vi.fn(() => order.push("active")),
      setVolume: vi.fn(() => order.push("volume")),
      dispose: vi.fn(),
    }));
    const { result } = renderHook(() =>
      useSpaceLoopSound("rain/1", true, 0, {
        loadScenes: () => Promise.resolve(WITH_SOUND),
        createSound,
      }),
    );

    await waitFor(() => expect(result.current).toBe(true));
    expect(order.slice(0, 2)).toEqual(["volume", "active"]);
  });

  it("공부를 멈춘 동안에도 화면을 누르면 깨워 재개할 때 바로 소리가 나게 한다", async () => {
    const { result, sounds, rerender } = setup(
      { "rain/1": WITH_SOUND },
      { key: "rain/1", active: true },
    );
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ key: "rain/1", active: false, volume: 80 });
    sounds[0].sound.prime.mockClear();

    window.dispatchEvent(new Event("pointerdown"));

    expect(sounds[0].sound.prime).toHaveBeenCalledOnce();
  });

  it("StrictMode로 효과가 한 번 더 돌아도 마지막 재생기는 켜진 채 남는다", async () => {
    const made: ReturnType<typeof fakeSound>[] = [];
    const states = new Map<ReturnType<typeof fakeSound>, { active: boolean; disposed: boolean }>();
    const createSound = vi.fn(() => {
      const sound = fakeSound();
      const state = { active: false, disposed: false };
      sound.setActive.mockImplementation((next: boolean) => {
        state.active = next;
        state.disposed = false;
      });
      sound.dispose.mockImplementation(() => {
        state.active = false;
        state.disposed = true;
      });
      states.set(sound, state);
      made.push(sound);
      return sound;
    });
    const { result } = renderHook(
      () =>
        useSpaceLoopSound("rain/1", true, 80, {
          loadScenes: () => Promise.resolve(WITH_SOUND),
          createSound,
        }),
      {
        wrapper: ({ children }: { children: ReactNode }) =>
          createElement(StrictMode, null, children),
      },
    );

    await waitFor(() => expect(result.current).toBe(true));
    const last = made.at(-1)!;
    expect(states.get(last)).toEqual({ active: true, disposed: false });
  });

  it("공간이 빠지면 재생기를 정리하고 화면을 눌러도 다시 깨우지 않는다", async () => {
    const { result, sounds, rerender } = setup(
      { "rain/1": WITH_SOUND },
      { key: "rain/1", active: true },
    );
    await waitFor(() => expect(result.current).toBe(true));
    const sound = sounds[0].sound;

    rerender({ key: null, active: false, volume: 80 });
    sound.prime.mockClear();
    window.dispatchEvent(new Event("pointerdown"));

    expect(sound.dispose).toHaveBeenCalledOnce();
    expect(sound.prime).not.toHaveBeenCalled();
  });

  it("매니페스트를 받지 못하면 그 세션은 소리 없는 공간으로 본다", async () => {
    const createSound = vi.fn(fakeSound);
    const loadScenes = vi.fn(() => Promise.reject(new Error("offline")));
    const { result } = renderHook(() =>
      useSpaceLoopSound("rain/1", true, 80, { loadScenes, createSound }),
    );

    await waitFor(() => expect(loadScenes).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current).toBe(false);
    expect(createSound).not.toHaveBeenCalled();
  });

  it("반복 공간이 아니면 아무것도 받지 않는다", async () => {
    const { result, loadScenes, createSound } = setup({}, { key: null, active: true });
    await act(async () => {});

    expect(result.current).toBe(false);
    expect(loadScenes).not.toHaveBeenCalled();
    expect(createSound).not.toHaveBeenCalled();
  });
});
