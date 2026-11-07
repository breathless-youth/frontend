import { useMemo } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

import { baseSearch } from "@/features/group-room/groupTabSearch";
import { parseRouteId } from "@/features/group-room/routeId";
import { LiveRoomEntry } from "@/features/live-room/LiveRoomEntry";
import type { CreateCamera, CreateChannel } from "@/features/live-room/liveRoomEntryState";
import { isGroupRoomState } from "@/features/live-room/liveRoomEntryState";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import type { LiveRoomKind } from "@/features/live-room/roomKind";
import { createStompRoomChannel } from "@/features/live-room/stompRoomChannel";
import type { RoomAudioDeps } from "@/features/live-room/useRoomAudio";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { useIdentityPending, useUserId } from "@/lib/userId";

/**
 * 그룹 공부방 라우트
 *
 * 그룹 홈이 자리를 잡고 넘긴 방 번호가 router state로 온다.
 * 렌더러가 죽어 앱이 주소만으로 다시 열면 state가 없어서 그룹 ID로 자리를 다시 잡아 방 번호를 받는다.
 * 신원이 정해지기 전에는 그리지 않아서, 첫 렌더의 빈 신원을 멤버 아님으로 읽고 그룹 탭으로 돌려보내지 않는다.
 */
export function GroupRoomPage({
  createChannel,
  createCamera = createMediaStreamCameraAdapter,
  createPeerConnection,
  audioDeps,
}: {
  createChannel?: CreateChannel;
  createCamera?: CreateCamera;
  createPeerConnection?: CreatePeerConnection;
  audioDeps?: RoomAudioDeps;
}) {
  const groupId = parseRouteId(useParams().groupId);
  const location = useLocation();
  const userId = useUserId();
  const identityPending = useIdentityPending();
  // 입장 화면의 자리 잡기 effect가 이 값을 보므로 렌더마다 새 객체를 만들지 않는다.
  const room = useMemo<Extract<LiveRoomKind, { kind: "group" }> | null>(
    () => (groupId === null ? null : { kind: "group", groupId }),
    [groupId],
  );

  if (identityPending) {
    return null;
  }
  if (userId === null || room === null) {
    return <Navigate to={{ pathname: "/social", search: baseSearch(location.search) }} replace />;
  }

  const state: unknown = location.state;
  const entry = isGroupRoomState(state) ? state : null;
  return (
    <LiveRoomEntry
      // 사용자나 그룹이 바뀌면 입장과 세션을 처음부터 다시 만든다.
      key={`${userId}:${room.groupId}`}
      room={room}
      initialRoomId={entry?.roomId ?? null}
      userId={userId}
      graceRejoin={entry?.graceRejoin === true}
      initialIceServers={entry?.iceServers ?? []}
      initialSubjectId={entry?.initialSubjectId}
      initialSubjectVerified={entry?.initialSubjectVerified}
      createChannel={createChannel ?? ((options) => createStompRoomChannel(options))}
      createCamera={createCamera}
      createPeerConnection={createPeerConnection}
      audioDeps={audioDeps}
    />
  );
}
