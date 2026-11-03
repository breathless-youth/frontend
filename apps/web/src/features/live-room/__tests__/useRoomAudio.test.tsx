import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MicAcquireResult } from "../audio/microphone";
import type { RemoteAudioPlayer } from "../audio/remoteAudio";
import { useRoomAudio } from "../useRoomAudio";

type RemoteAudioListener = (userId: number, track: MediaStreamTrack | null) => void;

afterEach(() => {
  vi.useRealTimers();
});

// 트랙이 끝나는 이벤트를 보내야 해서 EventTarget 위에 트랙 필드를 둔다.
function fakeTrack() {
  return Object.assign(new EventTarget(), {
    kind: "audio",
    enabled: true,
    readyState: "live",
    stop: vi.fn(function (this: { readyState: string }) {
      this.readyState = "ended";
    }),
  }) as unknown as MediaStreamTrack;
}

// 한 번 깨우면 소리가 도는 재생기처럼, resume을 부르기 전까지만 다시 걸 재생이 있다고 답한다.
function fakePlayer() {
  let resumed = false;
  return {
    attach: vi.fn(),
    detach: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    setAllMuted: vi.fn(),
    level: vi.fn<(userId: number) => number>().mockReturnValue(0),
    setLocalMeter: vi.fn(),
    localLevel: vi.fn<() => number>().mockReturnValue(0),
    needsResume: vi.fn(() => !resumed),
    resume: vi.fn(async () => {
      resumed = true;
    }),
    close: vi.fn(),
  } satisfies RemoteAudioPlayer;
}

function setup(overrides: Partial<Parameters<typeof useRoomAudio>[0]> = {}) {
  const mesh = {
    setLocalAudioTrack: vi.fn(),
    subscribeRemoteAudio: vi.fn((_listener: RemoteAudioListener) => () => undefined),
  };
  const onNotice = vi.fn();
  const mic = fakeTrack();
  const acquire = vi.fn(async (): Promise<MicAcquireResult> => ({ kind: "ok", track: mic }));
  const player = fakePlayer();
  const createPlayer = vi.fn(() => player);
  let renders = 0;
  const hook = renderHook(
    (props: { cameraHeld: boolean }) => {
      renders += 1;
      return useRoomAudio({
        enabled: true,
        mesh,
        cameraHeld: props.cameraHeld,
        onNotice,
        acquire,
        createPlayer,
        ...overrides,
      });
    },
    { initialProps: { cameraHeld: false } },
  );
  const listener = () => mesh.subscribeRemoteAudio.mock.calls.at(-1)?.[0] as RemoteAudioListener;
  return {
    ...hook,
    mesh,
    onNotice,
    acquire,
    player,
    createPlayer,
    mic,
    listener,
    renders: () => renders,
  };
}

describe("useRoomAudio 마이크", () => {
  it("처음에는 마이크가 꺼져 있다", () => {
    expect(setup().result.current.micOn).toBe(false);
  });

  it("누르면 소리 재생을 먼저 깨우고 마이크를 켜서 모든 연결에 싣는다", async () => {
    const { result, mesh, player, mic } = setup();
    await act(async () => result.current.toggleMic());
    expect(player.resume).toHaveBeenCalled();
    expect(result.current.micOn).toBe(true);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(mic);
  });

  it("카메라가 꺼진 동안 누르면 켜지지 않고 안내만 한다", async () => {
    const { result, rerender, acquire, onNotice } = setup();
    rerender({ cameraHeld: true });
    await act(async () => result.current.toggleMic());
    expect(result.current.micOn).toBe(false);
    expect(acquire).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith("카메라를 켜면 마이크를 쓸 수 있어요");
  });

  it("카메라가 꺼지면 마이크도 끈다", async () => {
    const { result, rerender, mesh, mic } = setup();
    await act(async () => result.current.toggleMic());
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(mic);
    rerender({ cameraHeld: true });
    expect(result.current.micOn).toBe(false);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
  });

  it("카메라를 다시 켜도 마이크는 꺼진 채다", async () => {
    const { result, rerender } = setup();
    await act(async () => result.current.toggleMic());
    rerender({ cameraHeld: true });
    rerender({ cameraHeld: false });
    expect(result.current.micOn).toBe(false);
  });

  it("켜는 중에 카메라를 끄면 마이크는 꺼진 채다", async () => {
    let resolve: (result: MicAcquireResult) => void = () => undefined;
    const acquire = vi.fn(
      () =>
        new Promise<MicAcquireResult>((done) => {
          resolve = done;
        }),
    );
    const { result, rerender, mesh, mic, onNotice } = setup({ acquire });
    act(() => result.current.toggleMic());
    expect(result.current.micPending).toBe(true);

    rerender({ cameraHeld: true });
    await act(async () => resolve({ kind: "ok", track: mic }));

    expect(result.current.micOn).toBe(false);
    expect(result.current.micPending).toBe(false);
    expect(mesh.setLocalAudioTrack).not.toHaveBeenCalledWith(mic);
    expect(mic.stop).toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
  });

  it("켜져 있을 때 누르면 끈다", async () => {
    const { result, mesh } = setup();
    await act(async () => result.current.toggleMic());
    await act(async () => result.current.toggleMic());
    expect(result.current.micOn).toBe(false);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
  });

  it("권한을 거절하면 꺼진 채로 안내한다", async () => {
    const { result, onNotice } = setup({ acquire: async () => ({ kind: "denied" }) });
    await act(async () => result.current.toggleMic());
    expect(result.current.micOn).toBe(false);
    expect(onNotice).toHaveBeenCalledWith("설정에서 마이크 권한을 허용해 주세요");
  });

  it("마이크를 얻지 못하면 꺼진 채로 안내한다", async () => {
    const { result, onNotice } = setup({ acquire: async () => ({ kind: "unavailable" }) });
    await act(async () => result.current.toggleMic());
    expect(result.current.micOn).toBe(false);
    expect(onNotice).toHaveBeenCalledWith("마이크를 켤 수 없어요");
  });

  it("OS가 마이크 트랙을 끊으면 마이크를 끈 것으로 보인다", async () => {
    const { result, mesh, mic } = setup();
    await act(async () => result.current.toggleMic());

    act(() => {
      (mic as unknown as { readyState: string }).readyState = "ended";
      mic.dispatchEvent(new Event("ended"));
    });

    expect(result.current.micOn).toBe(false);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
  });
});

describe("useRoomAudio 상대 소리", () => {
  it("공부방을 처음 누르면 소리 재생을 시작한다", () => {
    const { player } = setup();
    fireEvent.pointerDown(document.body);
    fireEvent.pointerDown(document.body);
    expect(player.resume).toHaveBeenCalledOnce();
  });

  it("소리가 아직 멈춰 있으면 다음 누름에서 다시 깨운다", () => {
    const { player } = setup();
    player.needsResume.mockReturnValue(true);
    fireEvent.pointerDown(document.body);
    fireEvent.pointerDown(document.body);
    expect(player.resume).toHaveBeenCalledTimes(2);
  });

  it("터치를 뗄 때와 키보드로 눌러도 깨운다", () => {
    const { player } = setup();
    player.needsResume.mockReturnValue(true);
    fireEvent.pointerUp(document.body);
    fireEvent.touchEnd(document.body);
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(player.resume).toHaveBeenCalledTimes(4);
  });

  it("들어온 상대 소리를 붙이고 말하는 사람을 표시한다", async () => {
    vi.useFakeTimers();
    const { result, player, listener } = setup();
    act(() => listener()(2, fakeTrack()));
    expect(player.attach).toHaveBeenCalledWith(2, expect.anything());
    player.level.mockReturnValue(0.1);
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(result.current.speakingUserIds.has(2)).toBe(true);
  });

  it("상대 소리가 끊기면 재생기에서 떼고 말하는 중에서도 뺀다", async () => {
    vi.useFakeTimers();
    const { result, player, listener } = setup();
    act(() => listener()(2, fakeTrack()));
    player.level.mockReturnValue(0.1);
    await act(() => vi.advanceTimersByTimeAsync(200));

    act(() => listener()(2, null));
    await act(() => vi.advanceTimersByTimeAsync(100));

    expect(player.detach).toHaveBeenCalledWith(2);
    expect(result.current.speakingUserIds.has(2)).toBe(false);
  });

  it("말하는 사람이 그대로면 다시 그리지 않는다", async () => {
    vi.useFakeTimers();
    const { result, player, listener, renders } = setup();
    act(() => listener()(2, fakeTrack()));
    player.level.mockReturnValue(0.1);
    await act(() => vi.advanceTimersByTimeAsync(200));
    const speaking = result.current.speakingUserIds;
    const before = renders();

    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(result.current.speakingUserIds).toBe(speaking);
    expect(renders()).toBe(before);
  });

  it("마이크를 켜고 말하면 내 타일이 말하는 중이고 끄면 바로 아니다", async () => {
    vi.useFakeTimers();
    const { result, player, mic } = setup();
    await act(async () => result.current.toggleMic());
    expect(player.setLocalMeter).toHaveBeenLastCalledWith(mic);
    player.localLevel.mockReturnValue(0.1);
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(result.current.selfSpeaking).toBe(true);

    await act(async () => result.current.toggleMic());

    expect(result.current.selfSpeaking).toBe(false);
    expect(player.setLocalMeter).toHaveBeenLastCalledWith(null);
  });

  it("다른 사람 소리 끄기는 모두에게 걸고 다시 누르면 푼다", () => {
    const { result, player } = setup();
    act(() => result.current.toggleOthersMuted());
    expect(result.current.othersMuted).toBe(true);
    expect(player.setAllMuted).toHaveBeenLastCalledWith(true);
    act(() => result.current.toggleOthersMuted());
    expect(result.current.othersMuted).toBe(false);
    expect(player.setAllMuted).toHaveBeenLastCalledWith(false);
  });

  it("사람별 소리 끄기는 그 사람에게만 건다", () => {
    const { result, player } = setup();
    act(() => result.current.setMuted(2, true));
    expect(result.current.isMuted(2)).toBe(true);
    expect(result.current.isMuted(3)).toBe(false);
    expect(player.setMuted).toHaveBeenCalledWith(2, true);
  });

  it("사람별 음량은 공부방에 있는 동안만 기억한다", () => {
    const first = setup();
    act(() => first.result.current.setVolume(2, 0.5));
    expect(first.result.current.volumeOf(2)).toBe(0.5);
    expect(first.player.setVolume).toHaveBeenCalledWith(2, 0.5);
    first.unmount();
    expect(setup().result.current.volumeOf(2)).toBe(1);
  });

  it("나가면 마이크 줄과 재생기를 닫는다", async () => {
    const { result, unmount, mesh, player, mic } = setup();
    await act(async () => result.current.toggleMic());
    unmount();
    expect(player.close).toHaveBeenCalled();
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
    expect(mic.stop).toHaveBeenCalled();
  });
});

describe("useRoomAudio 초대코드 방", () => {
  it("마이크와 재생기를 만들지 않고 모든 값이 꺼짐이다", async () => {
    const { result, createPlayer, mesh, acquire } = setup({ enabled: false });
    await act(async () => result.current.toggleMic());
    fireEvent.pointerDown(document.body);

    expect(createPlayer).not.toHaveBeenCalled();
    expect(mesh.subscribeRemoteAudio).not.toHaveBeenCalled();
    expect(acquire).not.toHaveBeenCalled();
    expect(result.current.micOn).toBe(false);
    expect(result.current.speakingUserIds.size).toBe(0);
    expect(result.current.volumeOf(2)).toBe(1);
  });
});
