import { useLayoutEffect } from "react";
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import type { MicAcquireResult } from "../audio/microphone";
import type { RemoteAudioPlayer } from "../audio/remoteAudio";
import { createRemoteAudioPlayer } from "../audio/remoteAudio";
import { SPEAKING_ON_LEVEL, SPEAKING_ON_SAMPLES, SPEAKING_SAMPLE_MS } from "../audio/speaking";
import { MIC_MUTE_SETTLE_MS, useRoomAudio } from "../useRoomAudio";

type RemoteAudioListener = (userId: number, track: MediaStreamTrack | null) => void;

const NO_MIC_ON: ReadonlySet<number> = new Set();

// 말하는 중 기준을 실기기에서 다시 맞춰도 고치지 않게 기준값에서 소리 크기와 시간을 만든다.
const VOICE_LEVEL = SPEAKING_ON_LEVEL;
const UNTIL_SPEAKING_MS = SPEAKING_SAMPLE_MS * SPEAKING_ON_SAMPLES;

afterEach(() => {
  vi.useRealTimers();
});

// 트랙이 끝나는 이벤트를 보내야 해서 EventTarget 위에 트랙 필드를 둔다.
function fakeTrack() {
  return Object.assign(new EventTarget(), {
    kind: "audio",
    enabled: true,
    muted: false,
    readyState: "live",
    stop: vi.fn(function (this: { readyState: string }) {
      this.readyState = "ended";
    }),
  }) as unknown as MediaStreamTrack;
}

/** OS가 캡처를 끊은 것처럼 트랙을 끝내고 알린다. */
function endTrack(track: MediaStreamTrack) {
  (track as unknown as { readyState: string }).readyState = "ended";
  track.dispatchEvent(new Event("ended"));
}

/** OS가 캡처를 무음으로 만든 것처럼 트랙을 음소거하고 알린다. */
function muteTrack(track: MediaStreamTrack) {
  (track as unknown as { muted: boolean }).muted = true;
  track.dispatchEvent(new Event("mute"));
}

function unmuteTrack(track: MediaStreamTrack) {
  (track as unknown as { muted: boolean }).muted = false;
  track.dispatchEvent(new Event("unmute"));
}

/** 부를 때마다 새 트랙을 주는 마이크 얻기 */
function freshTracks() {
  const tracks: MediaStreamTrack[] = [];
  const acquire = vi.fn(async (): Promise<MicAcquireResult> => {
    const track = fakeTrack();
    tracks.push(track);
    return { kind: "ok", track };
  });
  return { acquire, tracks };
}

// jsdom에는 MediaStream이 없어서 트랙을 담기만 하는 가짜를 둔다.
class FakeMediaStream {
  readonly tracks: unknown[];
  constructor(tracks: unknown[]) {
    this.tracks = tracks;
  }
}

/** 통화로 멈췄다가 다시 도는 것처럼 상태를 바꿔 알릴 수 있는 가짜 AudioContext */
function fakeAudioContext() {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const ctx = Object.assign(new EventTarget(), {
    state: "running",
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    destination: {},
    createMediaStreamSource: vi.fn(node),
    createAnalyser: vi.fn(() => ({
      ...node(),
      fftSize: 0,
      getFloatTimeDomainData: (data: Float32Array) => data.fill(0),
    })),
    createGain: vi.fn(() => ({ ...node(), gain: { value: 1 } })),
    fire(state: string) {
      ctx.state = state;
      ctx.dispatchEvent(new Event("statechange"));
    },
  });
  return ctx;
}

/** 가짜 컨텍스트 위에서 도는 실제 재생기 */
function playerOn(ctx: ReturnType<typeof fakeAudioContext>) {
  vi.stubGlobal("MediaStream", FakeMediaStream);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return () =>
    createRemoteAudioPlayer({
      audioContextFactory: () => ctx as unknown as AudioContext,
      keepAliveFactory: () => null,
    });
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
    setMicOnUsers: vi.fn(),
    resume: vi.fn(async () => {
      resumed = true;
    }),
    interrupted: vi.fn(() => false),
    onInterruptionEnd: vi.fn((_listener: () => void) => () => undefined),
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
  const hook = renderHook<
    ReturnType<typeof useRoomAudio>,
    { cameraHeld: boolean; micOnUserIds?: ReadonlySet<number> }
  >(
    (props) => {
      renders += 1;
      return useRoomAudio({
        enabled: true,
        mesh,
        cameraHeld: props.cameraHeld,
        micOnUserIds: props.micOnUserIds ?? NO_MIC_ON,
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

  it("카메라가 꺼지는 커밋 안에서 마이크를 떼서 늦게 온 트랙이 끼어들 틈이 없다", async () => {
    const mesh = {
      setLocalAudioTrack: vi.fn(),
      subscribeRemoteAudio: vi.fn((_listener: RemoteAudioListener) => () => undefined),
    };
    const mic = fakeTrack();
    let sentAtLayout: MediaStreamTrack | null | undefined;
    const { result, rerender } = renderHook(
      (props: { cameraHeld: boolean }) => {
        const audio = useRoomAudio({
          enabled: true,
          mesh,
          cameraHeld: props.cameraHeld,
          micOnUserIds: NO_MIC_ON,
          onNotice: vi.fn(),
          acquire: async () => ({ kind: "ok", track: mic }),
          createPlayer: fakePlayer,
        });
        // 같은 커밋의 레이아웃 단계에서 메시가 마지막으로 받은 마이크를 본다.
        useLayoutEffect(() => {
          sentAtLayout = mesh.setLocalAudioTrack.mock.calls.at(-1)?.[0];
        });
        return audio;
      },
      { initialProps: { cameraHeld: false } },
    );
    await act(async () => result.current.toggleMic());
    expect(sentAtLayout).toBe(mic);

    rerender({ cameraHeld: true });

    expect(sentAtLayout).toBeNull();
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
});

describe("useRoomAudio 마이크 되살리기", () => {
  it("OS가 보내던 트랙을 끊으면 새 트랙을 얻어 모든 연결에 싣고 끊긴 트랙은 멈춘다", async () => {
    const { acquire, tracks } = freshTracks();
    const { result, mesh, player } = setup({ acquire });
    await act(async () => result.current.toggleMic());

    await act(async () => endTrack(tracks[0]!));

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[1]);
    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(player.setLocalMeter).toHaveBeenLastCalledWith(tracks[1]);
    expect(result.current.micOn).toBe(true);
  });

  it("보내던 트랙이 무음이 된 채 풀리지 않으면 새 트랙으로 바꾼다", async () => {
    vi.useFakeTimers();
    const { acquire, tracks } = freshTracks();
    const { result, mesh } = setup({ acquire });
    await act(async () => result.current.toggleMic());

    act(() => muteTrack(tracks[0]!));
    expect(acquire).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(MIC_MUTE_SETTLE_MS));

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[1]);
    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(result.current.micOn).toBe(true);
  });

  it("무음이 곧 풀리면 트랙을 바꾸지 않는다", async () => {
    vi.useFakeTimers();
    const { acquire, tracks } = freshTracks();
    const { result, mesh } = setup({ acquire });
    await act(async () => result.current.toggleMic());

    act(() => muteTrack(tracks[0]!));
    act(() => unmuteTrack(tracks[0]!));
    await act(() => vi.advanceTimersByTimeAsync(MIC_MUTE_SETTLE_MS));

    expect(acquire).toHaveBeenCalledOnce();
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[0]);
  });

  it("통화가 끝나 컨텍스트가 다시 돌면 켜 둔 마이크를 새 트랙으로 바꾼다", async () => {
    const ctx = fakeAudioContext();
    const { acquire, tracks } = freshTracks();
    const { result, mesh } = setup({ acquire, createPlayer: playerOn(ctx) });
    await act(async () => result.current.toggleMic());

    act(() => ctx.fire("interrupted"));
    expect(acquire).toHaveBeenCalledOnce();
    await act(async () => ctx.fire("running"));

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[1]);
    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(result.current.micOn).toBe(true);
  });

  it("통화 중에 무음이 되면 바로 얻지 않고 통화가 끝날 때 한 번 얻는다", async () => {
    vi.useFakeTimers();
    const ctx = fakeAudioContext();
    const { acquire, tracks } = freshTracks();
    const { result, mesh } = setup({ acquire, createPlayer: playerOn(ctx) });
    await act(async () => result.current.toggleMic());

    act(() => ctx.fire("interrupted"));
    act(() => muteTrack(tracks[0]!));
    await act(() => vi.advanceTimersByTimeAsync(MIC_MUTE_SETTLE_MS));
    expect(acquire).toHaveBeenCalledOnce();

    await act(async () => ctx.fire("running"));

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[1]);
    expect(tracks[0]?.stop).toHaveBeenCalled();
  });

  it("꺼 둔 동안 통화가 끝나면 다시 켤 때 들고 있던 트랙을 쓰지 않는다", async () => {
    const ctx = fakeAudioContext();
    const { acquire, tracks } = freshTracks();
    const { result, mesh } = setup({ acquire, createPlayer: playerOn(ctx) });
    await act(async () => result.current.toggleMic());
    await act(async () => result.current.toggleMic());

    act(() => ctx.fire("interrupted"));
    await act(async () => ctx.fire("running"));
    expect(acquire).toHaveBeenCalledOnce();
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(null);

    await act(async () => result.current.toggleMic());

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[1]);
    expect(tracks[0]?.stop).toHaveBeenCalled();
  });

  it("새 트랙을 얻지 못하면 마이크를 끈 것으로 보이고 안내한다", async () => {
    const mic = fakeTrack();
    const acquire = vi
      .fn<() => Promise<MicAcquireResult>>()
      .mockResolvedValueOnce({ kind: "ok", track: mic })
      .mockResolvedValueOnce({ kind: "unavailable" });
    const { result, mesh, player, onNotice } = setup({ acquire });
    await act(async () => result.current.toggleMic());

    await act(async () => endTrack(mic));

    expect(result.current.micOn).toBe(false);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
    expect(mic.stop).toHaveBeenCalled();
    expect(player.setLocalMeter).toHaveBeenLastCalledWith(null);
    expect(onNotice).toHaveBeenCalledWith("마이크를 켤 수 없어요");
  });

  it("새로 얻은 트랙도 곧 끊기면 되풀이하지 않고 끈 뒤 안내한다", async () => {
    const { acquire, tracks } = freshTracks();
    const { result, mesh, onNotice } = setup({ acquire });
    await act(async () => result.current.toggleMic());
    await act(async () => endTrack(tracks[0]!));

    await act(async () => endTrack(tracks[1]!));

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(result.current.micOn).toBe(false);
    expect(mesh.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
    expect(onNotice).toHaveBeenCalledWith("마이크를 켤 수 없어요");
  });

  it("바꾸는 중에 마이크를 끄면 늦게 온 트랙을 싣지 않는다", async () => {
    const first = fakeTrack();
    const late = fakeTrack();
    let resolveLate: (result: MicAcquireResult) => void = () => undefined;
    const acquire = vi
      .fn<() => Promise<MicAcquireResult>>()
      .mockResolvedValueOnce({ kind: "ok", track: first })
      .mockImplementationOnce(
        () =>
          new Promise<MicAcquireResult>((done) => {
            resolveLate = done;
          }),
      );
    const { result, mesh, onNotice } = setup({ acquire });
    await act(async () => result.current.toggleMic());
    act(() => endTrack(first));

    await act(async () => result.current.toggleMic());
    await act(async () => resolveLate({ kind: "ok", track: late }));

    expect(result.current.micOn).toBe(false);
    expect(mesh.setLocalAudioTrack).not.toHaveBeenCalledWith(late);
    expect(late.stop).toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
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

  it("나가면 누름 리스너를 모두 뗀다", () => {
    const { player, unmount } = setup();
    fireEvent.pointerDown(document.body);
    expect(player.needsResume).toHaveBeenCalled();

    unmount();
    player.needsResume.mockClear();
    player.resume.mockClear();
    fireEvent.pointerDown(document.body);
    fireEvent.pointerUp(document.body);
    fireEvent.touchEnd(document.body);
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(player.needsResume).not.toHaveBeenCalled();
    expect(player.resume).not.toHaveBeenCalled();
  });

  it("들어온 상대 소리를 붙이고 말하는 사람을 표시한다", async () => {
    vi.useFakeTimers();
    const { result, player, listener } = setup();
    act(() => listener()(2, fakeTrack()));
    expect(player.attach).toHaveBeenCalledWith(2, expect.anything());
    player.level.mockReturnValue(VOICE_LEVEL);
    await act(() => vi.advanceTimersByTimeAsync(UNTIL_SPEAKING_MS));
    expect(result.current.speakingUserIds.has(2)).toBe(true);
  });

  it("상대 소리가 끊기면 재생기에서 떼고 말하는 중에서도 뺀다", async () => {
    vi.useFakeTimers();
    const { result, player, listener } = setup();
    act(() => listener()(2, fakeTrack()));
    player.level.mockReturnValue(VOICE_LEVEL);
    await act(() => vi.advanceTimersByTimeAsync(UNTIL_SPEAKING_MS));

    act(() => listener()(2, null));
    await act(() => vi.advanceTimersByTimeAsync(SPEAKING_SAMPLE_MS));

    expect(player.detach).toHaveBeenCalledWith(2);
    expect(result.current.speakingUserIds.has(2)).toBe(false);
  });

  it("말하는 사람이 그대로면 다시 그리지 않는다", async () => {
    vi.useFakeTimers();
    const { result, player, listener, renders } = setup();
    act(() => listener()(2, fakeTrack()));
    player.level.mockReturnValue(VOICE_LEVEL);
    await act(() => vi.advanceTimersByTimeAsync(UNTIL_SPEAKING_MS));
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
    player.localLevel.mockReturnValue(VOICE_LEVEL);
    await act(() => vi.advanceTimersByTimeAsync(UNTIL_SPEAKING_MS));
    expect(result.current.selfSpeaking).toBe(true);

    await act(async () => result.current.toggleMic());

    expect(result.current.selfSpeaking).toBe(false);
    expect(player.setLocalMeter).toHaveBeenLastCalledWith(null);
  });

  it("멤버들의 마이크 상태를 재생기에 알린다", () => {
    const { rerender, player } = setup();
    const talking = new Set([42]);

    rerender({ cameraHeld: false, micOnUserIds: talking });
    expect(player.setMicOnUsers).toHaveBeenLastCalledWith(talking);

    rerender({ cameraHeld: false, micOnUserIds: NO_MIC_ON });
    expect(player.setMicOnUsers).toHaveBeenLastCalledWith(NO_MIC_ON);
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
