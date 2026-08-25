import type { RoomJoinErrorCode } from "@focusmakers/types";

import { ApiError } from "@/lib/api";

/**
 * 초대코드 입장 실패 → 인라인 문구 매핑
 * `INVALID_CODE_FORMAT`은 클라이언트 선차단(`isCompleteInviteCode`)으로 사실상 오지 않지만,
 * 왔을 때 사용자 행동(코드 재확인)이 `INVALID_CODE`와 같아 동일 문구로 방어한다.
 *
 * 문구는 원칙적으로 `code`로만 분기한다(BY-404 명세 규칙). 아래 4xx status 폴백은 그 규칙의
 * **의도적 예외**다 — 서버가 code를 누락하는 상황이 실사용에서 확인돼(2026-08-24, BY-427)
 * 임시로 추가했다. 백엔드가 `INVALID_CODE` code를 실어주면 이 폴백은 제거 가능하다.
 */

export const JOIN_RETRY_MESSAGE = "잠시 후 다시 시도해 주세요";

const CHECK_CODE_MESSAGE = "초대코드를 다시 확인해 주세요";

export function joinErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (
      error.code === ("INVALID_CODE" satisfies RoomJoinErrorCode) ||
      error.code === ("INVALID_CODE_FORMAT" satisfies RoomJoinErrorCode)
    ) {
      return CHECK_CODE_MESSAGE;
    }
    if (error.code === ("ROOM_FULL" satisfies RoomJoinErrorCode)) {
      return "방이 가득 찼어요";
    }
    // code 누락 폴백(상단 주석 참고): 4xx는 요청 쪽 문제라 코드 재확인이 맞는 안내다.
    // 5xx·네트워크 실패는 코드를 고쳐도 소용없으므로 재시도 문구로 흘린다.
    if (error.code === undefined && error.status >= 400 && error.status < 500) {
      return CHECK_CODE_MESSAGE;
    }
  }
  return JOIN_RETRY_MESSAGE;
}
