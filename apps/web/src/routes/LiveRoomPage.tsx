import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";

import { LiveRoomEntry } from "@/features/live-room/LiveRoomEntry";
import type { CreateCamera, CreateChannel } from "@/features/live-room/liveRoomEntryState";
import type { LiveRoomLocationState } from "@/features/live-room/liveRoomEntryState";
import { isLiveRoomState } from "@/features/live-room/liveRoomEntryState";
import { isCompleteInviteCode } from "@/features/social-room/inviteCode";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import { createStompRoomChannel } from "@/features/live-room/stompRoomChannel";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { parseUserId } from "@/lib/userId";

/**
 * 실시간 룸 라우트
 *
 * 방 정보는 router state로 온다(방 조회 API 없음). state가 없어도 `?code`(완전한 초대코드)가
 * 있으면 그걸로 입장한다(BY-436) — 렌더러 프로세스 사망 후 네이티브가 웹뷰를 복원할 때
 * state는 실을 수 없어 `report-screen`이 알려준 코드가 쿼리로 붙는다. 둘 다 없으면 소셜
 * 홈으로 돌려보낸다.
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
  const restoreCode = searchParams.get("code");

  let entryState: LiveRoomLocationState | null = null;
  if (isLiveRoomState(state)) {
    entryState = state;
  } else if (restoreCode !== null && isCompleteInviteCode(restoreCode)) {
    // 복원 입장은 일반 입장과 같다 — 마운트 join이 새로 자리를 예약하고 iceServers를 받는다.
    entryState = { inviteCode: restoreCode };
  }

  if (userId === null || !Number.isInteger(roomId) || entryState === null) {
    return <Navigate to={{ pathname: "/social", search: location.search }} replace />;
  }

  return (
    <LiveRoomEntry
      roomId={roomId}
      userId={userId}
      entryState={entryState}
      createChannel={
        createChannel ??
        (({ roomId: r, userId: u }) => createStompRoomChannel({ roomId: r, userId: u }))
      }
      createCamera={createCamera}
      createPeerConnection={createPeerConnection}
    />
  );
}
