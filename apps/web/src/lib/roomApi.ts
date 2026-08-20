import type { RoomCreateResponse, RoomJoinResponse } from "@focusmakers/types";

import { API_BASE_URL, parseApiError } from "./api";

/**
 * 초대코드 룸 생성·입장
 */

export async function createRoom(userId: number): Promise<RoomCreateResponse> {
  const res = await fetch(`${API_BASE_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    throw await parseApiError(res, "방 생성 실패");
  }
  return (await res.json()) as RoomCreateResponse;
}

export async function joinRoom(userId: number, inviteCode: string): Promise<RoomJoinResponse> {
  const res = await fetch(`${API_BASE_URL}/api/rooms/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // inviteCode는 문자열 그대로 보낸다 — 앞자리 0 보존
    body: JSON.stringify({ userId, inviteCode }),
  });
  if (!res.ok) {
    throw await parseApiError(res, "참여 실패");
  }
  return (await res.json()) as RoomJoinResponse;
}
