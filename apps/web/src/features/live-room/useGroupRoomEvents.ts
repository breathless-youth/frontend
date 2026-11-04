import { useEffect, useEffectEvent } from "react";

import type { RoomChannel } from "./roomChannel";

/**
 * 그룹 공부방에서만 오는 내보내짐과 차단 메시지 구독
 *
 * 두 메시지는 개인 큐로 오고, 초대코드 방에는 오지 않아서 그룹이 없으면 구독하지 않는다.
 * 개인 큐에 다른 그룹의 내보내짐이 섞여도 이 공부방의 그룹일 때만 알린다.
 */
export function useGroupRoomEvents(
  channel: RoomChannel,
  groupId: number | null,
  handlers: { onKicked: () => void; onPeerBlocked: (userId: number) => void },
): void {
  const onKicked = useEffectEvent(handlers.onKicked);
  const onPeerBlocked = useEffectEvent(handlers.onPeerBlocked);

  useEffect(() => {
    if (groupId === null) {
      return;
    }
    return channel.subscribe((message) => {
      if (message.type === "KICKED" && message.groupId === groupId) {
        onKicked();
      } else if (message.type === "PEER_BLOCKED") {
        onPeerBlocked(message.userId);
      }
    });
  }, [channel, groupId]);
}
