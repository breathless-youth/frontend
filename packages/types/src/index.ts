/**
 * 클라이언트 시간 계산용 타입/함수는 `@focuson/study-core`가 소유한다.
 * 여기서는 서버 전송용/API 계약 도메인 타입을 정의하고, 편의를 위해 study-core의
 * `StudyStatus`/`StudySessionSummary`를 재노출한다(한 곳에서 import 가능).
 */
export type { StudyStatus, StudySessionSummary } from "@focuson/study-core";

export type StudyMode = "single" | "multi";

/**
 * 세션 전체 생명주기 상태. 순간적인 Vision 판정 상태인
 * `@focuson/study-core`의 `StudyStatus`("STUDYING"|"AWAY"|"PAUSED"|"CAMERA_OFF")와는
 * 다른 축이므로 하나로 합치지 않는다.
 */
export type SessionStatus = "active" | "paused" | "ended";

/**
 * 세션 레코드(서버 저장/조회 대상). 순간 상태(`StudyStatus`)가 아니라 세션 생명주기
 * (`SessionStatus`)를 담는다. 클라이언트 내부 시간 계산은 `@focuson/study-core`의
 * `summarizeSession`/`summarizeTimeline`을 사용한다.
 */
export interface FocusSession {
  id: string;
  userId: string;
  mode: StudyMode;
  roomId: string | null;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  netStudySeconds: number;
}

/**
 * 서버로 전송되는 이벤트 레코드(API 계약, `sessionId` 포함).
 * 클라이언트 내부 시간 계산에는 이 타입 대신 `@focuson/study-core`의
 * `FocusTimelineEvent`(상태 + 시각만)와 계산 함수를 사용할 것.
 */
export interface FocusEvent {
  sessionId: string;
  type: "focus_start" | "focus_lost" | "focus_resumed" | "away";
  timestamp: string;
  confidence: number;
}

export interface StudyRoom {
  id: string;
  name: string;
  hostUserId: string;
  participantIds: string[];
  createdAt: string;
}

export interface Participant {
  userId: string;
  displayName: string;
  joinedAt: string;
  isFocused: boolean;
}

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
