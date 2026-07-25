/**
 * 서버 전송용/API 계약 도메인 타입. 실제 백엔드 Swagger 계약을 기준으로만 정의한다
 * (초기 명세 기반 임시 타입은 2026-07-25 삭제 — git 히스토리 참고).
 */

/**
 * 익명 기기 유저 등록 API 계약 (POST /api/users).
 * 로그인 없는 V1.0에서 기기 UUID로 사용자를 식별한다 — 근거:
 * .ai/notes/2026-07-23-로그인-도입-시점-변경.md
 */
export interface UserRegisterRequest {
  /** 앱이 첫 실행 때 생성해 기기 보안 저장소에 보관하는 UUID. 서버가 소문자로 정규화한다. */
  deviceId: string;
}

export interface UserRegisterResponse {
  /** 발급된 유저 ID — 이후 모든 API 호출에 사용 */
  userId: number;
  /** 신규 생성이면 true(HTTP 201), 기존 기기 재등록이면 false(HTTP 200) */
  isNew: boolean;
}
