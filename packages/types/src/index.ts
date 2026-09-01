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
 * 최종 제출은 앱이 잰 studySec/focusSec을 그대로 저장한다. 진행 중 값은 PUT /active로 따로
 * 보고하고(ActiveSessionSnapshotRequest), 서버가 마지막 스냅샷으로 자동 확정한다.
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

/** 진행중 세션 스냅샷 보고 요청 (PUT /api/study-sessions/active) */
export interface ActiveSessionSnapshotRequest {
  userId: number;
  /** 세션 시작 시각 (UTC ISO-8601) — 최종 제출 startedAt과 같은 값, userId와 함께 draft 멱등 키 */
  startedAt: string;
  /** 이 스냅샷의 기준 시각 (UTC ISO-8601) — 자동 확정 시 endedAt이 된다 */
  reportedAt: string;
  /** 지금까지의 누적 총 공부 시간(초) */
  studySec: number;
  /** 지금까지의 누적 순공 시간(초). 0 ≤ focusSec ≤ studySec */
  focusSec: number;
  /** 지금까지의 비공부 이벤트 전체 — 진행 중인 이벤트는 reportedAt에서 닫아 보낸다 */
  events: StatusEventPayload[];
}

/** 진행중 세션 복구 조회 응답 (GET /api/study-sessions/active) */
/** 세션 복구 판별·확인 응답 (POST /api/study-sessions/recovery) — 서버가 확정한 기록 요약 */
export interface SessionRecoveryResponse {
  /** 통계 귀속 날짜 — 한국 시간 기준 시작 날짜 (yyyy-MM-dd) */
  statDate: string;
  /** 세션 시작 시각 (UTC ISO-8601) */
  startedAt: string;
  /** 세션 종료 시각 (UTC ISO-8601) */
  endedAt: string;
  /** 총 공부 시간(초) */
  studySec: number;
  /** 순공 시간(초) */
  focusSec: number;
}

export interface ActiveSessionSnapshotResponse {
  /** 세션 시작 시각 (UTC ISO-8601) — 이어받을 때 그대로 물려받는다 */
  startedAt: string;
  /** 마지막 스냅샷의 기준 시각 (UTC ISO-8601) — 앱이 죽은 시점의 근사값 */
  reportedAt: string;
  /** reportedAt까지의 누적 총 공부 시간(초) */
  studySec: number;
  /** reportedAt까지의 누적 순공 시간(초) */
  focusSec: number;
  /** reportedAt까지의 비공부 이벤트 전체 — 진행 중이던 이벤트는 reportedAt에서 닫혀 있다 */
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

/**
 * 연속 공부일(스트릭) 조회 API 계약 (GET /api/stats/streak) — Swagger 기준.
 * 서버가 세션 이력에서 매번 계산한다. 기록/유저 없음이면 둘 다 0.
 */
export interface StudySessionStreakResponse {
  /** 현재 연속 공부일 — 오늘 기록이 없어도 어제까지 이어졌으면 유지 중으로 본다 */
  streak: number;
  /** 역대 최장 연속 공부일 */
  maxStreak: number;
  /**
   * from~to 기간 중 스트릭 인정 기준(세션 하나의 순공시간 10분 이상)을 만족한 날짜 목록
   * (YYYY-MM-DD). from/to를 생략하면 빈 배열. (Swagger 2026-07-28 추가)
   */
  studiedDatesInRange: string[];
}

/**
 * 기간 집계 조회 API 계약 (GET /api/stats/period) — Swagger 기준.
 * 총합·증감은 서버가 주지 않는다. 아래 배열을 합산해 계산한다.
 */

/** 하루치 집계 — 순공 1분 미만 세션은 서버 집계에서 빠진다. */
export interface DailyStudyStat {
  date: string;
  studySec: number;
  focusSec: number;
}

export interface StudyPeriodStatsResponse {
  from: string;
  to: string;
  /** compare 미지정 시 키가 빠지는 게 아니라 null이 온다 */
  compareFrom: string | null;
  compareTo: string | null;
  /** from~to 모든 날짜의 일별 집계 — 공부 없는 날도 0으로 채워 오름차순 */
  dailyList: DailyStudyStat[];
  /** compare 구간 일별 집계 — compare 미지정 시 빈 배열 */
  compareDailyList: DailyStudyStat[];
}

/**
 * 초대코드 룸 참여 API 계약 — 출처는 `.ai` 레포 `product/specs/BY-404-룸-참여.md`
 * (BE가 같은 명세로 구현 중). ⚠️ Swagger 등재 전이라 등재 후 대조가 필요한 잠정 계약이다.
 */

/**
 * 공통 에러 응답 본문 `{ code, message }` — 화면 문구는 `code`로만 분기한다
 * (`message` 직출 금지, BY-404 명세 규칙).
 */
export interface ApiErrorBody {
  code?: string;
  message?: string;
}

/** 방 생성: 생성만으로는 입장 상태가 아니다 */
export interface RoomCreateRequest {
  userId: number;
}

export interface RoomCreateResponse {
  roomId: number;
  inviteCode: string;
  /** 빈 방 자동 소멸까지 남은 시간(초) */
  emptyTtlSeconds: number;
}

/** 초대코드 입장 */
export interface RoomJoinRequest {
  userId: number;
  inviteCode: string;
}

/** RTCPeerConnection 설정용 ICE 서버 항목 — DOM `RTCIceServer` 미사용 */
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface RoomJoinResponse {
  roomId: number;
  /** true면 끊김 30초 유예 내 재입장 — 프리뷰 생략, 이전 카메라 상태 복원 */
  graceRejoin: boolean;
  /** graceRejoin=true일 때 이전 카메라 상태, 아니면 null */
  cameraOn: boolean | null;
  iceServers: IceServer[];
  iceTtlSeconds: number;
}

/** WebRTC 연결 통계 보고 (BY-490 백엔드 명세). fire-and-forget. */
export interface RtcStatRequest {
  /** PeerConnection당 프론트가 발급하는 UUID — 연결 단위 중복 제거 키 */
  connectionId: string;
  roomId: number;
  userId: number;
  peerUserId?: number;
  candidateType: "host" | "srflx" | "prflx" | "relay";
  relayProtocol?: "udp" | "tcp" | "tls";
  bytesReceived?: number;
  bytesSent?: number;
  rttMs?: number;
  isFinal: boolean;
  at?: number;
}

/**
 * join 실패 코드 (2026-08-25 BY-436 백엔드 계약).
 *
 * 앞의 셋은 룸 전용 404다 — 종전에는 셋 다 같은 응답이라 화면이 구분할 수 없었다.
 * `ROOM_CLOSED`는 **방이 소멸한 뒤 10분 동안만** 내려오고, 그 뒤로는 같은 코드가
 * `INVITE_CODE_NOT_FOUND`로 바뀐다 — 두 코드가 같은 상황(전원 퇴장으로 사라진 방)을
 * 가리킬 수 있다는 뜻이라, 재입장 화면은 둘을 같은 문구로 다룬다(`joinErrorCopy.ts`).
 *
 * 뒤의 넷은 서버 공통 코드다. `CONFLICT`가 정원 초과(6명)를 뜻하는 것은 join에 한한다.
 */
export type RoomJoinErrorCode =
  | "INVITE_CODE_NOT_FOUND"
  | "ROOM_CLOSED"
  | "USER_NOT_FOUND"
  | "BAD_REQUEST"
  | "VALIDATION_FAILED"
  | "CONFLICT"
  | "INTERNAL_ERROR";

/**
 * 프로필 API 계약
 */

export interface ProfileResponse {
  /** 2~12자, 한글·영문·숫자, 전역 유니크 */
  nickname: string;
  /** 한 줄 목표, 공백 포함 최대 20자 — 미설정이면 null */
  goal: string | null;
  /**
   * 목표 카테고리 enum — 미설정이면 null. 명세에 확정된 값이 `JOB`(취업)뿐이라 공유 계약은
   * string으로 둔다(상상 계약 금지). 잠정 7종 union은 `apps/web`의 categoryChips가 소유하고,
   * 백엔드 Swagger 확정 후 여기로 승격해 좁힌다.
   */
  category: string | null;
  /** 아바타 표시용 닉네임 첫 글자 — 서버 산출, 닉네임 변경 시 갱신 */
  initial: string;
  /** 아바타 자동 색 인덱스 — 서버 산출, 닉네임이 바뀌어도 고정 */
  colorIndex: number;
}

export interface ProfileUpdateRequest {
  nickname?: string;
  goal?: string | null;
  category?: string | null;
}

export type ProfileErrorCode =
  "INVALID_NICKNAME" | "GOAL_TOO_LONG" | "INVALID_CATEGORY" | "NICKNAME_TAKEN";

export type {
  RoomFocusState,
  RoomMember,
  RoomServerMessage,
  RoomSignalKind,
  RoomSignalPublish,
  RoomStateUpdate,
} from "./room";

export type {
  CameraPermissionMessage,
  NavigateHomeMessage,
  ReportScreenMessage,
  NavigateTabMessage,
  SetTabBarMessage,
  SubmitResultMessage,
  SubmitSessionMessage,
  ToNativeMessage,
  ToWebMessage,
} from "./bridge";
