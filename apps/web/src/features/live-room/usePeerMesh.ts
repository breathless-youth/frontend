import { useEffect, useState } from "react";

import type { CreatePeerConnection } from "./peerMesh";
import { createPeerMesh } from "./peerMesh";
import type { RoomChannel } from "./roomChannel";

/**
 * peerMesh의 React 수명 결합 — 메시는 세션 수명 동안 하나다(채널·카메라와 같은
 * 지연 초기화 규칙). 수신 스트림 맵만 상태로 승격해 타일 렌더를 갱신한다.
 */
export function usePeerMesh({
  channel,
  myUserId,
  iceServers,
  cameraStream,
  trackEnabled,
  createPeerConnection,
  onEvent,
}: {
  channel: RoomChannel;
  myUserId: number;
  iceServers: RTCIceServer[];
  cameraStream: MediaStream | null;
  trackEnabled: boolean;
  createPeerConnection?: CreatePeerConnection;
  onEvent?: (line: string) => void;
}): ReadonlyMap<number, MediaStream> {
  const [mesh] = useState(() =>
    createPeerMesh({ myUserId, channel, iceServers, createPeerConnection, onEvent }),
  );
  const [remoteStreams, setRemoteStreams] = useState<ReadonlyMap<number, MediaStream>>(
    () => new Map(),
  );

  useEffect(
    () =>
      mesh.subscribeRemoteStreams((userId, stream) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          if (stream) {
            next.set(userId, stream);
          } else {
            next.delete(userId);
          }
          return next;
        });
      }),
    [mesh],
  );

  useEffect(() => {
    mesh.setLocalStream(cameraStream);
  }, [mesh, cameraStream]);

  useEffect(() => {
    mesh.setTrackEnabled(trackEnabled);
  }, [mesh, trackEnabled]);

  useEffect(() => {
    mesh.start();
    return () => mesh.close();
  }, [mesh]);

  return remoteStreams;
}
