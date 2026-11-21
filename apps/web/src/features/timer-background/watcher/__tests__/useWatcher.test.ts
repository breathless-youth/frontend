import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DistractionTrigger } from "@/features/study-session/sessionState";
import { trackSessionSpaceMuted, trackSessionSpaceVolumeChanged } from "@/lib/amplitude";

import { useWatcher } from "../useWatcher";
import { readWatcherVolume, writeWatcherVolume } from "../watcherSound";

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  trackSessionSpaceMuted: vi.fn(),
  trackSessionSpaceVolumeChanged: vi.fn(),
}));

const sound = vi.hoisted(() => ({
  prime: vi.fn(),
  play: vi.fn(),
  fadeApproach: vi.fn(),
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  stopAll: vi.fn(),
  dispose: vi.fn(),
}));
const created = vi.hoisted(() => vi.fn());

vi.mock("../watcherSound", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createWatcherSound: (assetKey: string) => {
    created(assetKey);
    // 공간마다 다른 재생기라 객체는 새로 만들고 함수는 함께 센다.
    return { ...sound };
  },
}));

type Props = { watchKey: string | null; trigger: DistractionTrigger | null; studying: boolean };

function renderWatcher(initial: Props) {
  return renderHook((props: Props) => useWatcher(props.watchKey, props.trigger, props.studying), {
    initialProps: initial,
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useWatcher", () => {
  it("감시 공간이 아니면 소리를 만들지 않는다", () => {
    renderWatcher({ watchKey: null, trigger: null, studying: true });

    expect(created).not.toHaveBeenCalled();
  });

  it("공부 중에만 소리를 깨우고 누를 때마다 다시 깨운다", () => {
    const { rerender } = renderWatcher({ watchKey: "watcher/a", trigger: null, studying: false });
    expect(sound.prime).not.toHaveBeenCalled();

    rerender({ watchKey: "watcher/a", trigger: null, studying: true });
    expect(sound.prime).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("pointerdown"));
    expect(sound.prime).toHaveBeenCalledTimes(2);

    rerender({ watchKey: "watcher/a", trigger: null, studying: false });
    expect(sound.stopAll).toHaveBeenCalled();
    window.dispatchEvent(new Event("pointerdown"));
    expect(sound.prime).toHaveBeenCalledTimes(2);
  });

  it("탭이 숨으면 소리를 멈춘다", () => {
    renderWatcher({ watchKey: "watcher/a", trigger: null, studying: true });
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);

    document.dispatchEvent(new Event("visibilitychange"));

    expect(sound.stopAll).toHaveBeenCalled();
  });

  it("공간이 바뀌면 앞 소리를 정리하고 새로 만든다", () => {
    const { rerender } = renderWatcher({ watchKey: "watcher/a", trigger: null, studying: true });

    rerender({ watchKey: "watcher/b", trigger: null, studying: true });

    expect(sound.dispose).toHaveBeenCalledOnce();
    expect(created.mock.calls).toEqual([["watcher/a"], ["watcher/b"]]);
  });

  it("비집중이 이어지면 다가오는 발소리를 내고 들어온다", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderWatcher({
      watchKey: "watcher/a",
      trigger: null,
      studying: true,
    });

    rerender({ watchKey: "watcher/a", trigger: "AWAY", studying: true });
    act(() => vi.advanceTimersByTime(2_000));
    expect(sound.play).toHaveBeenCalledWith("approach");
    act(() => vi.advanceTimersByTime(7_000));

    expect(result.current.present).toBe(true);
  });

  it("들어오기와 나가기 영상이 재생되면 그 소리를 영상 시간에 맞춰 낸다", () => {
    const { result } = renderWatcher({ watchKey: "watcher/a", trigger: null, studying: true });

    result.current.onClipPlaying("enter", 0.5);
    result.current.onClipPlaying("loop-b", 0);

    expect(sound.play.mock.calls).toEqual([["enter", 0.5]]);
  });

  it("저장한 음량으로 시작하고 바꾸면 소리에 반영하며 손을 뗄 때 저장한다", () => {
    writeWatcherVolume(40);
    const { result } = renderWatcher({ watchKey: "watcher/a", trigger: null, studying: true });
    expect(result.current.level).toBe(40);

    act(() => result.current.setLevel(60));
    expect(sound.setVolume).toHaveBeenLastCalledWith(0.6);
    act(() => result.current.commitLevel(60));

    expect(readWatcherVolume().level).toBe(60);
    expect(trackSessionSpaceVolumeChanged).toHaveBeenCalledWith({ volume: 60 });
  });

  it("음소거를 풀면 마지막 음량으로 돌아간다", () => {
    writeWatcherVolume(30);
    const { result } = renderWatcher({ watchKey: "watcher/a", trigger: null, studying: true });

    act(() => result.current.toggleMute());
    expect(result.current.level).toBe(0);
    expect(readWatcherVolume().level).toBe(0);
    act(() => result.current.toggleMute());

    expect(result.current.level).toBe(30);
    expect(vi.mocked(trackSessionSpaceMuted).mock.calls).toEqual([
      [{ muted: true }],
      [{ muted: false }],
    ]);
  });
});
