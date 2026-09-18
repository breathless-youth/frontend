import type {
  RoomCreateRequest,
  RoomCreateResponse,
  RoomJoinRequest,
  RoomJoinResponse,
} from "@focusmakers/types";

import { closeStaleSession } from "@/features/study-session/closeStaleSession";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";
import { legacyQuery, legacyUserId } from "./userId";

/**
 * 초대코드 룸 생성·입장
 */

export async function createRoom(): Promise<RoomCreateResponse> {
  const legacy = legacyUserId();
  // 토큰 없는 문서(구 앱)만 본문에 사용자 번호를 싣는다. 토큰이 있으면 서버가 토큰에서 읽는다.
  const res = await apiFetch(
    `${API_BASE_URL}/api/rooms`,
    legacy === null
      ? { method: "POST" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: legacy } satisfies RoomCreateRequest),
        },
  );
  if (!res.ok) {
    throw await parseApiError(res, "방 생성 실패");
  }
  return (await res.json()) as RoomCreateResponse;
}

async function postJoin(inviteCode: string): Promise<RoomJoinResponse> {
  const legacy = legacyUserId();
  // inviteCode는 문자열 그대로 보낸다 — 앞자리 0 보존
  const request: RoomJoinRequest =
    legacy === null ? { inviteCode } : { userId: legacy, inviteCode };
  const res = await apiFetch(`${API_BASE_URL}/api/rooms/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw await parseApiError(res, "참여 실패");
  }
  return (await res.json()) as RoomJoinResponse;
}

/**
 * 실시간 룸 입장 — 입장 화면들이 쓴다.
 *
 * 서버에 남은 옛 세션을 먼저 치우고 들어간다. 그래야 방 화면의 복구 조회가 "남아 있으면
 * 복원, 없으면 새 세션"이라는 규칙 하나로 돌 수 있다. 새 입장 경로가 생기면 이 함수를
 * 쓰게 되므로 마감이 저절로 따라온다.
 */
export async function enterLiveRoom(userId: number, inviteCode: string): Promise<RoomJoinResponse> {
  await closeStaleSession(userId);
  return await postJoin(inviteCode);
}

/**
 * 이미 들어온 방의 자리 예약 TTL과 iceServers를 새로 잡는다 — 방 화면이 마운트될 때 쓴다.
 *
 * 여기서 마감을 부르면 방금 복원한 세션을 스스로 지운다. 입장과 같은 요청을 보내지만
 * 뜻이 다르므로 이름을 갈라 둔다.
 */
export async function renewLiveRoomSeat(inviteCode: string): Promise<RoomJoinResponse> {
  return await postJoin(inviteCode);
}

/** 명시적 퇴장 — 룸 나가기에서 세션 제출 후 호출한다. */
export async function leaveRoom(roomId: number): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/rooms/${roomId}/leave${legacyQuery(false)}`, {
    method: "POST",
  });
  if (!res.ok) {
    throw await parseApiError(res, "퇴장 실패");
  }
}
