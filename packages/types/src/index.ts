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

/**
 * 공부 세션 제출 API 계약 (POST /api/study-sessions) — Swagger 기준.
 * 서버는 세션을 실시간 추적하지 않고, 앱이 잰 studySec/focusSec을 그대로 저장한다.
 */

/**
 * 비공부 상태 이벤트 종류. PHONE=휴대폰 사용, DEVICE=다른 기기, AWAY=자리 비움,
 * PAUSE=일시정지(총공부 타이머까지 정지 — 나머지 셋은 순공 타이머만 정지).
 */
export type StudyEventStatus = "PHONE" | "DEVICE" | "AWAY" | "PAUSE";

/** 비공부 상태 이벤트 1건. 시각은 UTC ISO-8601, 세션 구간 안·서로 겹침 불가·0초 불가. */
export interface StatusEventPayload {
  status: StudyEventStatus;
  startedAt: string;
  endedAt: string;
}

export interface StudySessionCreateRequest {
  userId: number;
  /** 방 입장 시각 (UTC ISO-8601) */
  startedAt: string;
  /** 방 퇴장 시각 (UTC ISO-8601) — 시작 이후·24시간 이내·미래 불가(시계 오차 5분 허용) */
  endedAt: string;
  /** 총 공부 시간(초). 0 ≤ studySec ≤ (endedAt−startedAt)−PAUSE 시간 합 */
  studySec: number;
  /** 순공 시간(초). 0 ≤ focusSec ≤ studySec */
  focusSec: number;
  /** 비공부 상태 이벤트 목록 — 없으면 빈 배열 */
  events: StatusEventPayload[];
}

/** 저장 결과 세션 1건 — 자정(KST)을 넘는 제출은 날짜별로 분할되어 배열로 내려온다. */
export interface StudySessionResponse {
  id: number;
  userId: number;
  /** 통계 귀속 날짜 (KST 기준, YYYY-MM-DD) */
  statDate: string;
  startedAt: string;
  endedAt: string;
  studySec: number;
  focusSec: number;
  /** 집중률(%) = focusSec ÷ studySec × 100, 소수 1자리 */
  focusRate: number;
  events: StatusEventPayload[];
}

/**
 * 공부 세션 통계 조회 API 계약 (GET /api/stats) — Swagger 기준.
 */

/** 상태별 이벤트 발생 건수 — 없는 상태도 0으로 내려온다(키 누락 없음). */
export type StudySessionEventCounts = Record<StudyEventStatus, number>;

export interface StudySessionSummary {
  id: number;
  statDate: string;
  startedAt: string;
  endedAt: string;
  studySec: number;
  focusSec: number;
  focusRate: number;
  eventCounts: StudySessionEventCounts;
}

export interface StudySessionListResponse {
  sessions: StudySessionSummary[];
  sessionCount: number;
  totalStudySec: number;
  totalFocusSec: number;
  longestFocusSec: number;
  focusRate: number;
  totalEventCounts: StudySessionEventCounts;
  studiedDatesInMonth: string[];
}
