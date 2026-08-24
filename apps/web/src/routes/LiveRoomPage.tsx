import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";

import { LiveRoomEntry } from "@/features/live-room/LiveRoomEntry";
import type { CreateCamera, CreateChannel } from "@/features/live-room/liveRoomEntryState";
import { isLiveRoomState } from "@/features/live-room/liveRoomEntryState";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import { createStompRoomChannel } from "@/features/live-room/stompRoomChannel";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { parseUserId } from "@/lib/userId";

/**
 * 실시간 룸 라우트
 *
 * 방 정보는 router state로만 온다(방 조회 API 없음). state 없이 열리면 소셜 홈으로
 * 돌려보낸다.
 */
export function LiveRoomPage({
  createChannel,
  createCamera = createMediaStreamCameraAdapter,
  createPeerConnection,
}: {
  createChannel?: CreateChannel;
  createCamera?: CreateCamera;
  createPeerConnection?: CreatePeerConnection;
}) {
  const { roomId: roomIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const userId = parseUserId(searchParams.get("userId"));
  const roomId = Number(roomIdParam);
  const state: unknown = location.state;

  if (userId === null || !Number.isInteger(roomId) || !isLiveRoomState(state)) {
    return <Navigate to={{ pathname: "/social", search: location.search }} replace />;
  }

  return (
    <LiveRoomEntry
      roomId={roomId}
      userId={userId}
      entryState={state}
      createChannel={
        createChannel ??
        (({ roomId: r, userId: u }) => createStompRoomChannel({ roomId: r, userId: u }))
      }
      createCamera={createCamera}
      createPeerConnection={createPeerConnection}
    />
  );
}
