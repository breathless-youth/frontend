import { useEffect, useState } from "react";

import { reportRtcStats } from "@/lib/rtcStatsApi";

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
  roomId,
  iceServers,
  cameraStream,
  trackEnabled,
  createPeerConnection,
  onEvent,
}: {
  channel: RoomChannel;
  myUserId: number;
  roomId: number;
  iceServers: RTCIceServer[];
  cameraStream: MediaStream | null;
  trackEnabled: boolean;
  createPeerConnection?: CreatePeerConnection;
  onEvent?: (line: string) => void;
}): ReadonlyMap<number, MediaStream> {
  const [mesh] = useState(() =>
    createPeerMesh({
      myUserId,
      roomId,
      channel,
      iceServers,
      createPeerConnection,
      onEvent,
      reportStats: reportRtcStats,
    }),
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

  // 백그라운드 복귀 재구축 — 배경에서는 소켓·TURN 임대·인코더가 제각각 죽는데(2026-08-26
  // 실기기: 복귀 후 소켓 끊김·prflx 경로·검은 화면 혼재) 계층별 소생은 조합이 많아 신뢰할
  // 수 없었다. 일정 시간 이상 가려졌다 돌아오면 P2P 전부와 채널 세션을 통째로 갈아 새
  // 스냅샷 기준으로 전원 재연결한다(사유 상세는 PeerMesh.resetConnections 주석). 짧은
  // 가림(알림 확인 등)은 연결이 멀쩡히 살아남으므로 재구축하지 않는다.
  useEffect(() => {
    const REBUILD_AFTER_HIDDEN_MS = 3000;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = hiddenAt ?? Date.now();
        return;
      }
      const wasHiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (wasHiddenFor >= REBUILD_AFTER_HIDDEN_MS) {
        mesh.resetConnections();
        channel.reconnect();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [mesh, channel]);

  return remoteStreams;
}
