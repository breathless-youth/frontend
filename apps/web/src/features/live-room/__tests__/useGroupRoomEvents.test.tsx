import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMockRoomChannel } from "../mockRoomChannel";
import { useGroupRoomEvents } from "../useGroupRoomEvents";

function setup(groupId: number | null) {
  const channel = createMockRoomChannel({ snapshot: [] });
  const onKicked = vi.fn();
  const onPeerBlocked = vi.fn();
  renderHook(() => useGroupRoomEvents(channel, groupId, { onKicked, onPeerBlocked }));
  return { channel, onKicked, onPeerBlocked };
}

describe("useGroupRoomEvents", () => {
  it("내 그룹의 KICKED만 내보내짐으로 알린다", () => {
    const { channel, onKicked } = setup(10);

    act(() => channel.emitServerMessage({ type: "KICKED", groupId: 99 }));
    expect(onKicked).not.toHaveBeenCalled();

    act(() => channel.emitServerMessage({ type: "KICKED", groupId: 10 }));
    expect(onKicked).toHaveBeenCalledOnce();
  });

  it("PEER_BLOCKED는 그 사람을 알린다", () => {
    const { channel, onPeerBlocked } = setup(10);

    act(() => channel.emitServerMessage({ type: "PEER_BLOCKED", userId: 42 }));

    expect(onPeerBlocked).toHaveBeenCalledWith(42);
  });

  it("그룹이 없는 초대코드 방은 구독하지 않는다", () => {
    const { channel, onKicked, onPeerBlocked } = setup(null);

    act(() => {
      channel.emitServerMessage({ type: "KICKED", groupId: 10 });
      channel.emitServerMessage({ type: "PEER_BLOCKED", userId: 42 });
    });

    expect(onKicked).not.toHaveBeenCalled();
    expect(onPeerBlocked).not.toHaveBeenCalled();
  });
});
