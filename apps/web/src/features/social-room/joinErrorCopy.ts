import { ApiError } from "@/lib/api";

/**
 * 초대코드 입장 실패 → 인라인 문구 매핑
 * `INVALID_CODE_FORMAT`은 클라이언트 선차단(`isCompleteInviteCode`)으로 사실상 오지 않지만,
 * 왔을 때 사용자 행동(코드 재확인)이 `INVALID_CODE`와 같아 동일 문구로 방어한다.
 */

export const JOIN_RETRY_MESSAGE = "잠시 후 다시 시도해 주세요";

export function joinErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_CODE" || error.code === "INVALID_CODE_FORMAT") {
      return "코드를 다시 확인해 주세요";
    }
    if (error.code === "ROOM_FULL") {
      return "방이 가득 찼어요";
    }
  }
  return JOIN_RETRY_MESSAGE;
}
