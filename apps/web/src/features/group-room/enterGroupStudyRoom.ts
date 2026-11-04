import type { GroupRoomJoinResponse } from "@focusmakers/types";

import { closeStaleSession } from "@/features/study-session/closeStaleSession";
import { joinGroupRoom } from "@/lib/groupRoomApi";

/**
 * 그룹 공부방 들어가기
 *
 * 서버에 남은 옛 세션을 먼저 마감하고 자리를 잡는다.
 * 그래야 공부방 화면의 복구 조회가 남아 있으면 이어 하고 없으면 새로 시작하는 규칙 하나로 돈다.
 * 초대코드 방의 `enterLiveRoom`과 같은 순서다.
 */
export async function enterGroupStudyRoom(
  userId: number,
  groupId: number,
): Promise<GroupRoomJoinResponse> {
  await closeStaleSession(userId);
  return await joinGroupRoom(groupId);
}
