import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RoomServerMessage } from "@focusmakers/types";

import * as roomApi from "@/lib/roomApi";

import type { RoomChannel } from "../roomChannel";
import { useRoomRejoin } from "../useRoomRejoin";

/** 구독자에게 서버 메시지를 주입할 수 있는 테스트용 채널. */
function fakeChannel(): RoomChannel & { emit: (message: RoomServerMessage) => void } {
  const listeners = new Set<(message: RoomServerMessage) => void>();
  return {
    status: "open",
    connect: vi.fn(),
    disconnect: vi.fn(),
    reconnect: vi.fn(),
    requestSnapshot: vi.fn(),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publishState: vi.fn(),
    publishSignal: vi.fn(),
    emit(message) {
      for (const listener of listeners) {
        listener(message);
      }
    },
  };
}

const joinResponse = {
  roomId: 42,
  graceRejoin: false,
  cameraOn: null,
  iceServers: [],
  iceTtlSeconds: 7200,
};

describe("useRoomRejoin", () => {
  it("성공하면 자리를 다시 잡고 채널을 재연결한다", async () => {
    vi.spyOn(roomApi, "renewLiveRoomSeat").mockResolvedValue(joinResponse);
    const channel = fakeChannel();
    const onUnavailable = vi.fn();
    const { result } = renderHook(() =>
      useRoomRejoin({ channel, userId: 7, inviteCode: "0712", onUnavailable }),
    );

    result.current();

    await vi.waitFor(() => expect(channel.reconnect).toHaveBeenCalledTimes(1));
    expect(roomApi.renewLiveRoomSeat).toHaveBeenCalledWith(7, "0712");
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("실패하면 종료 처리를 부르고 재연결하지 않는다", async () => {
    vi.spyOn(roomApi, "renewLiveRoomSeat").mockRejectedValue(new Error("자리 회수"));
    const channel = fakeChannel();
    const onUnavailable = vi.fn();
    const { result } = renderHook(() =>
      useRoomRejoin({ channel, userId: 7, inviteCode: "0712", onUnavailable }),
    );

    result.current();

    await vi.waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(channel.reconnect).not.toHaveBeenCalled();
  });

  it("재연결 후 복구 전에 또 신호가 오면 재호출 대신 종료 처리로 넘긴다", async () => {
    const renew = vi.spyOn(roomApi, "renewLiveRoomSeat").mockResolvedValue(joinResponse);
    const channel = fakeChannel();
    const onUnavailable = vi.fn();
    const { result } = renderHook(() =>
      useRoomRejoin({ channel, userId: 7, inviteCode: "0712", onUnavailable }),
    );

    result.current();
    await vi.waitFor(() => expect(channel.reconnect).toHaveBeenCalledTimes(1));

    result.current();

    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it("첫 재호출이 진행 중이면 재신호를 무시하고 그 시도가 끝나게 둔다", async () => {
    let resolveFirst: (value: typeof joinResponse) => void = () => undefined;
    const renew = vi
      .spyOn(roomApi, "renewLiveRoomSeat")
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
    const channel = fakeChannel();
    const onUnavailable = vi.fn();
    const { result } = renderHook(() =>
      useRoomRejoin({ channel, userId: 7, inviteCode: "0712", onUnavailable }),
    );

    result.current();
    result.current();
    resolveFirst(joinResponse);

    await vi.waitFor(() => expect(channel.reconnect).toHaveBeenCalledTimes(1));
    expect(renew).toHaveBeenCalledTimes(1);
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("renew가 응답하지 않으면 제한 시간 뒤 종료 처리로 넘긴다", async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(roomApi, "renewLiveRoomSeat").mockReturnValue(new Promise(() => undefined));
      const channel = fakeChannel();
      const onUnavailable = vi.fn();
      const { result } = renderHook(() =>
        useRoomRejoin({ channel, userId: 7, inviteCode: "0712", onUnavailable }),
      );

      result.current();
      expect(onUnavailable).not.toHaveBeenCalled();

      vi.advanceTimersByTime(8000);
      expect(onUnavailable).toHaveBeenCalledTimes(1);
      expect(channel.reconnect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("타임아웃으로 종료된 뒤 renew가 늦게 끝나도 reconnect·안내를 더 내지 않는다", async () => {
    vi.useFakeTimers();
    try {
      let resolveLate: (value: typeof joinResponse) => void = () => undefined;
      vi.spyOn(roomApi, "renewLiveRoomSeat").mockReturnValue(
        new Promise((resolve) => (resolveLate = resolve)),
      );
      const channel = fakeChannel();
      const onUnavailable = vi.fn();
      const { result } = renderHook(() =>
        useRoomRejoin({ channel, userId: 7, inviteCode: "0712", onUnavailable }),
      );

      result.current();
      vi.advanceTimersByTime(8000);
      expect(onUnavailable).toHaveBeenCalledTimes(1);

      resolveLate(joinResponse);
      await vi.advanceTimersByTimeAsync(0);

      expect(channel.reconnect).not.toHaveBeenCalled();
      expect(onUnavailable).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("SNAPSHOT으로 복구가 확인되면 다시 재호출할 수 있다", async () => {
    const renew = vi.spyOn(roomApi, "renewLiveRoomSeat").mockResolvedValue(joinResponse);
    const channel = fakeChannel();
    const onUnavailable = vi.fn();
    const { result } = renderHook(() =>
      useRoomRejoin({ channel, userId: 7, inviteCode: "0712", onUnavailable }),
    );

    result.current();
    await vi.waitFor(() => expect(channel.reconnect).toHaveBeenCalledTimes(1));

    channel.emit({ type: "SNAPSHOT", members: [] });
    result.current();

    await vi.waitFor(() => expect(renew).toHaveBeenCalledTimes(2));
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
