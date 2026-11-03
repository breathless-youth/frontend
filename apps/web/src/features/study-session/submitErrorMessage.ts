import { ApiError } from "@/lib/api";
import i18n from "@/lib/i18n";

/**
 * 제출 실패 문구 키. 서버 `message`는 언어가 고정이고 언제든 바뀌므로 `ApiError.code`로만 고른다.
 * 코드 목록은 백엔드 `POST /api/study-sessions` 경로의 `GlobalExceptionHandler`가 내는 값이다.
 * 모르는 코드, 코드 없는 응답, 네트워크 오류는 공용 문구로 떨어진다.
 *
 * 제출 모듈(`submitStudySession.ts`)을 통째로 mock하는 화면 테스트가 많아 따로 둔다.
 */
const SUBMIT_ERROR_KEY_BY_CODE = {
  VALIDATION_FAILED: "study-session:submitError.invalid",
  BAD_REQUEST: "study-session:submitError.invalid",
  NOT_FOUND: "study-session:submitError.userNotFound",
  USER_NOT_FOUND: "study-session:submitError.userNotFound",
  CONFLICT: "study-session:submitError.conflict",
  INTERNAL_ERROR: "study-session:submitError.server",
} as const;

export function submitErrorMessage(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  const key =
    code !== undefined && Object.hasOwn(SUBMIT_ERROR_KEY_BY_CODE, code)
      ? SUBMIT_ERROR_KEY_BY_CODE[code as keyof typeof SUBMIT_ERROR_KEY_BY_CODE]
      : "study-session:submitError.generic";
  return i18n.t(key);
}
