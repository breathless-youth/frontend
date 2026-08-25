import type { RoomJoinErrorCode } from "@focusmakers/types";

import { ApiError } from "@/lib/api";

/**
 * 초대코드 입장 실패 → 화면 문구 매핑 (2026-08-25 BY-436으로 코드 체계 교체)
 *
 * 소비 맥락이 둘이고 같은 코드라도 맞는 안내가 다르다.
 * - `joinErrorMessage` — 초대코드 입력·공유 화면. 사용자가 코드를 고칠 수 있는 자리다.
 * - `rejoinFailure` — 룸 재입장(`LiveRoomEntry`). 코드를 입력할 칸이 없는 자리라
 *   "코드를 다시 확인"이 틀린 안내이고, 복구 불가면 화면에 남기지 말고 내보내야 한다.
 *
 * 문구는 원칙적으로 `code`로만 분기한다(BY-404 명세 규칙). 아래 4xx status 폴백은 그 규칙의
 * **의도적 예외**다 — 서버가 code를 누락하는 상황이 실사용에서 확인돼(2026-08-24, BY-427)
 * 남겨 둔다.
 *
 * ⚠️ `rejoinFailure`의 leave/retry 판정만은 `code`가 아니라 **status**로 한다. 알 수 없는
 * 코드나 code 누락에도 재입장 화면이 [다시 시도]만 남긴 채 갇히지 않게 하기 위해서다 —
 * 이 티켓이 고치는 버그가 정확히 그 갇힌 상태였다.
 */

export const JOIN_RETRY_MESSAGE = "잠시 후 다시 시도해 주세요";
export const CHECK_CODE_MESSAGE = "초대코드를 다시 확인해 주세요";
export const ROOM_CLOSED_MESSAGE = "방이 만료되었어요";
export const USER_NOT_FOUND_MESSAGE = "사용자 정보를 확인할 수 없어요";
export const ROOM_FULL_MESSAGE = "방이 가득 찼어요";

/** 코드 재확인이 맞는 행동인 코드 — 입력 화면에서만 의미가 있다. */
const CHECK_CODE_CODES: readonly RoomJoinErrorCode[] = ["INVITE_CODE_NOT_FOUND", "BAD_REQUEST"];

function messageByCode(code: string | undefined): string | null {
  if (code === undefined) {
    return null;
  }
  if (CHECK_CODE_CODES.includes(code as RoomJoinErrorCode)) {
    return CHECK_CODE_MESSAGE;
  }
  if (code === ("ROOM_CLOSED" satisfies RoomJoinErrorCode)) {
    return ROOM_CLOSED_MESSAGE;
  }
  if (code === ("USER_NOT_FOUND" satisfies RoomJoinErrorCode)) {
    return USER_NOT_FOUND_MESSAGE;
  }
  if (code === ("CONFLICT" satisfies RoomJoinErrorCode)) {
    return ROOM_FULL_MESSAGE;
  }
  // VALIDATION_FAILED·INTERNAL_ERROR·미지의 코드: 사용자가 고칠 수 있는 게 없다.
  return null;
}

/**
 * 재입장 화면의 문구 — 입력 화면과 갈리는 두 코드만 덮어쓴다.
 *
 * `INVITE_CODE_NOT_FOUND`는 재입장에서 "발급된 적 없는 코드"를 뜻하지 않는다. 들어와 있던
 * 방의 코드이므로 오타일 수 없고, 방이 사라지고 10분이 지나 코드가 회수된 상황이다 —
 * 사용자에게는 `ROOM_CLOSED`와 같은 일이다. `BAD_REQUEST`도 코드를 고칠 칸이 없어
 * 재확인 안내가 무의미하다.
 */
function rejoinMessageByCode(code: string | undefined): string {
  if (code === ("INVITE_CODE_NOT_FOUND" satisfies RoomJoinErrorCode)) {
    return ROOM_CLOSED_MESSAGE;
  }
  if (code === ("BAD_REQUEST" satisfies RoomJoinErrorCode)) {
    return JOIN_RETRY_MESSAGE;
  }
  return messageByCode(code) ?? JOIN_RETRY_MESSAGE;
}

/** 초대코드 입력·공유 화면의 인라인/토스트 문구. */
export function joinErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const message = messageByCode(error.code);
    if (message !== null) {
      return message;
    }
    // code 누락 폴백(상단 주석 참고): 4xx는 요청 쪽 문제라 코드 재확인이 맞는 안내다.
    // 5xx·네트워크 실패는 코드를 고쳐도 소용없으므로 재시도 문구로 흘린다.
    if (error.code === undefined && error.status >= 400 && error.status < 500) {
      return CHECK_CODE_MESSAGE;
    }
  }
  return JOIN_RETRY_MESSAGE;
}

/**
 * 룸 재입장 실패의 처리 방침.
 * - `leave` — 이 방으로는 복구할 수 없다. 문구를 알리고 소셜 홈으로 내보낸다.
 * - `retry` — 다시 시도가 의미 있다(방이 살아 있을 수 있으니 화면에 남긴다).
 */
export type RejoinFailure = { kind: "leave" | "retry"; message: string };

export function rejoinFailure(error: unknown): RejoinFailure {
  if (!(error instanceof ApiError)) {
    return { kind: "retry", message: JOIN_RETRY_MESSAGE };
  }
  const message = rejoinMessageByCode(error.code);
  // 정원 초과만은 4xx여도 남는다 — 누군가 나가면 같은 코드로 다시 들어갈 수 있다.
  if (error.status === 409) {
    return { kind: "retry", message };
  }
  // 그 밖의 4xx는 재시도해도 같은 응답이다. 화면에 붙잡아 두면 갇힌다.
  if (error.status >= 400 && error.status < 500) {
    return { kind: "leave", message };
  }
  return { kind: "retry", message };
}
