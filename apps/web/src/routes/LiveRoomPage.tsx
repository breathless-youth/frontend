import { Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";

import { LiveRoomEntry } from "@/features/live-room/LiveRoomEntry";
import type { CreateCamera, CreateChannel } from "@/features/live-room/liveRoomEntryState";
import type { LiveRoomLocationState } from "@/features/live-room/liveRoomEntryState";
import { isLiveRoomState } from "@/features/live-room/liveRoomEntryState";
import { isCompleteInviteCode } from "@/features/social-room/inviteCode";
import type { CreatePeerConnection } from "@/features/live-room/peerMesh";
import { createStompRoomChannel } from "@/features/live-room/stompRoomChannel";
import { createMediaStreamCameraAdapter } from "@/features/study-session/adapters/mediaStreamCamera";
import { useIdentityPending, useUserId } from "@/lib/userId";

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

  const userId = useUserId();
  const identityPending = useIdentityPending();
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

  /**
   * 신원이 오기 전에는 아무것도 판정하지 않는다. BY-528이 웹뷰 URL에서 `?userId=N`을 빼면서
   * 신원은 브리지 왕복 뒤에 오는데, 첫 렌더의 `userId === null`을 "못 들어감"으로 읽으면
   * **문서가 새로 뜨는 입장 경로에서 방을 잃는다.** 특히 렌더러 사망 복구(BY-436)는 `/social`을
   * 거치지 않고 `/social/room/:id?code=...`를 직접 열기 때문에, 복구하려던 그 방에서 쫓겨난다.
   * 대기는 `FIRST_TOKEN_TIMEOUT_MS`가 끊어 주므로 여기 머무는 시간은 유한하다.
   */
  if (identityPending) {
    return null;
  }

  if (userId === null || !Number.isInteger(roomId) || entryState === null) {
    return <Navigate to={{ pathname: "/social", search: location.search }} replace />;
  }

  return (
    <LiveRoomEntry
      // 사용자가 바뀌면 통째로 새로 만든다. 입장 결착과 복원값은 마운트 시점에 한 번만 정해져,
      // 같은 인스턴스를 유지하면 새 사용자가 앞 사용자의 세션을 그대로 이어받는다.
      key={userId}
      roomId={roomId}
      userId={userId}
      entryState={entryState}
      createChannel={createChannel ?? ((options) => createStompRoomChannel(options))}
      createCamera={createCamera}
      createPeerConnection={createPeerConnection}
    />
  );
}
