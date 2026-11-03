import { describe, expect, it, vi } from "vitest";

import type { MicOffMode } from "../micLine";
import { createMicLine } from "../micLine";
import type { MicAcquireResult } from "../microphone";

function fakeTrack() {
  return {
    kind: "audio",
    enabled: true,
    readyState: "live",
    stop: vi.fn(function (this: { readyState: string }) {
      this.readyState = "ended";
    }),
  } as unknown as MediaStreamTrack;
}

function setup(mode?: MicOffMode) {
  const sink = { setLocalAudioTrack: vi.fn() };
  const tracks: MediaStreamTrack[] = [];
  const acquire = vi.fn(async () => {
    const track = fakeTrack();
    tracks.push(track);
    return { kind: "ok" as const, track };
  });
  return { line: createMicLine({ sink, acquire, mode }), sink, acquire, tracks };
}

/** 얻기 결과를 테스트가 정하는 시점에 돌려주는 acquire */
function deferredAcquire() {
  const resolvers: ((result: MicAcquireResult) => void)[] = [];
  const acquire = vi.fn(
    () =>
      new Promise<MicAcquireResult>((done) => {
        resolvers.push(done);
      }),
  );
  return {
    acquire,
    resolve: (index: number, result: MicAcquireResult) => resolvers[index]?.(result),
  };
}

describe("createMicLine 끄는 방식", () => {
  it("detach 모드에서 끄면 모든 송신기에서 트랙을 떼고 다시 켜면 같은 트랙을 싣는다", async () => {
    const { line, sink, acquire, tracks } = setup("detach");

    await line.turnOn();
    line.turnOff();

    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
    expect(tracks[0]?.readyState).toBe("live");
    expect(line.isOn).toBe(false);

    await expect(line.turnOn()).resolves.toBe("on");
    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[0]);
    expect(acquire).toHaveBeenCalledOnce();
  });

  it("disable 모드에서 끄면 트랙은 남기고 enabled만 끈다", async () => {
    const { line, sink, acquire, tracks } = setup("disable");

    await line.turnOn();
    line.turnOff();

    expect(tracks[0]?.enabled).toBe(false);
    expect(sink.setLocalAudioTrack).not.toHaveBeenCalledWith(null);

    await line.turnOn();
    expect(tracks[0]?.enabled).toBe(true);
    expect(acquire).toHaveBeenCalledOnce();
  });

  it("stop 모드에서 끄면 트랙을 멈추고 다시 켜면 새로 얻는다", async () => {
    const { line, sink, acquire, tracks } = setup("stop");

    await line.turnOn();
    line.turnOff();

    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(null);

    await line.turnOn();
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[1]);
  });

  it("모드를 주지 않으면 끈 동안 아무것도 보내지 않는다", async () => {
    const { line, sink } = setup();

    await line.turnOn();
    line.turnOff();

    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
  });
});

describe("createMicLine 켜기", () => {
  it("권한을 거절하면 꺼진 채이고 송신기를 건드리지 않는다", async () => {
    const sink = { setLocalAudioTrack: vi.fn() };
    const line = createMicLine({ sink, acquire: async () => ({ kind: "denied" }), mode: "detach" });

    await expect(line.turnOn()).resolves.toBe("denied");
    expect(line.isOn).toBe(false);
    expect(sink.setLocalAudioTrack).not.toHaveBeenCalled();
  });

  it("마이크를 얻지 못하면 unavailable이고, 얻기가 실패를 내도 같다", async () => {
    const sink = { setLocalAudioTrack: vi.fn() };
    const unavailable = createMicLine({ sink, acquire: async () => ({ kind: "unavailable" }) });
    const broken = createMicLine({
      sink,
      acquire: async () => {
        throw new Error("x");
      },
    });

    await expect(unavailable.turnOn()).resolves.toBe("unavailable");
    await expect(broken.turnOn()).resolves.toBe("unavailable");
    expect(broken.isOn).toBe(false);
    expect(sink.setLocalAudioTrack).not.toHaveBeenCalled();
  });

  it("이미 켜져 있으면 마이크를 다시 얻지 않는다", async () => {
    const { line, acquire } = setup("detach");

    await line.turnOn();

    await expect(line.turnOn()).resolves.toBe("on");
    expect(acquire).toHaveBeenCalledOnce();
  });

  it("켜는 중에 다시 눌러도 마이크는 한 번만 얻는다", async () => {
    const { acquire, resolve } = deferredAcquire();
    const sink = { setLocalAudioTrack: vi.fn() };
    const line = createMicLine({ sink, acquire, mode: "detach" });
    const track = fakeTrack();

    const first = line.turnOn();
    const second = line.turnOn();
    resolve(0, { kind: "ok", track });

    await expect(first).resolves.toBe("on");
    await expect(second).resolves.toBe("on");
    expect(acquire).toHaveBeenCalledOnce();
    expect(sink.setLocalAudioTrack).toHaveBeenCalledTimes(1);
  });

  it("끊긴 트랙은 다시 켤 때 새로 얻는다", async () => {
    const { line, sink, acquire, tracks } = setup("detach");

    await line.turnOn();
    line.turnOff();
    (tracks[0] as unknown as { readyState: string }).readyState = "ended";
    await line.turnOn();

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[1]);
  });

  it("보내는 트랙은 켜져 있을 때만 돌려준다", async () => {
    const { line, tracks } = setup("detach");

    expect(line.localTrack()).toBeNull();
    await line.turnOn();
    expect(line.localTrack()).toBe(tracks[0]);
    line.turnOff();
    expect(line.localTrack()).toBeNull();
  });
});

describe("createMicLine 켜는 중에 끄기", () => {
  it("켜는 중에 끄면 늦게 온 트랙을 붙이지 않는다", async () => {
    const { acquire, resolve } = deferredAcquire();
    const sink = { setLocalAudioTrack: vi.fn() };
    const line = createMicLine({ sink, acquire, mode: "detach" });
    const late = fakeTrack();

    const pending = line.turnOn();
    line.turnOff();
    resolve(0, { kind: "ok", track: late });

    await expect(pending).resolves.toBe("cancelled");
    expect(sink.setLocalAudioTrack).not.toHaveBeenCalledWith(late);
    expect(late.stop).toHaveBeenCalled();
    expect(line.isOn).toBe(false);
  });

  it("켜는 중에 닫아도 늦게 온 트랙을 붙이지 않는다", async () => {
    const { acquire, resolve } = deferredAcquire();
    const sink = { setLocalAudioTrack: vi.fn() };
    const line = createMicLine({ sink, acquire, mode: "detach" });
    const late = fakeTrack();

    const pending = line.turnOn();
    line.close();
    resolve(0, { kind: "ok", track: late });

    await expect(pending).resolves.toBe("cancelled");
    expect(sink.setLocalAudioTrack).not.toHaveBeenCalledWith(late);
    expect(late.stop).toHaveBeenCalled();
  });

  it("켜는 중에 끄고 다시 켜면 먼저 온 트랙은 버리고 나중 트랙만 싣는다", async () => {
    const { acquire, resolve } = deferredAcquire();
    const sink = { setLocalAudioTrack: vi.fn() };
    const line = createMicLine({ sink, acquire, mode: "detach" });
    const stale = fakeTrack();
    const fresh = fakeTrack();

    const first = line.turnOn();
    line.turnOff();
    const second = line.turnOn();
    resolve(0, { kind: "ok", track: stale });
    resolve(1, { kind: "ok", track: fresh });

    await expect(first).resolves.toBe("cancelled");
    await expect(second).resolves.toBe("on");
    expect(sink.setLocalAudioTrack.mock.calls).toEqual([[fresh]]);
    expect(stale.stop).toHaveBeenCalled();
    expect(line.localTrack()).toBe(fresh);
  });
});

describe("createMicLine 닫기", () => {
  it("닫으면 송신기에서 떼고 트랙을 멈춘다", async () => {
    const { line, sink, tracks } = setup("detach");

    await line.turnOn();
    line.close();

    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
    expect(tracks[0]?.stop).toHaveBeenCalled();
    expect(line.isOn).toBe(false);
  });

  it("disable 모드에서 꺼 둔 트랙도 닫으면 떼고 멈춘다", async () => {
    const { line, sink, tracks } = setup("disable");

    await line.turnOn();
    line.turnOff();
    line.close();

    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(null);
    expect(tracks[0]?.stop).toHaveBeenCalled();
  });

  it("닫은 뒤에 다시 켜면 새 트랙을 얻는다", async () => {
    const { line, sink, acquire, tracks } = setup("detach");

    await line.turnOn();
    line.close();
    await line.turnOn();

    expect(acquire).toHaveBeenCalledTimes(2);
    expect(sink.setLocalAudioTrack).toHaveBeenLastCalledWith(tracks[1]);
  });
});
