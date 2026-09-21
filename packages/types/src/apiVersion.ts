/**
 * `API-Version` 요청 헤더의 엔드포인트별 값.
 *
 * **버전은 서버 전체가 아니라 엔드포인트 단위다.** 각 API가 만들어질 때 `1`에서 시작하고 그
 * 엔드포인트의 계약이 바뀔 때마다 오른다. 판별 규칙은 하나다 — 구 앱(v1.2.x)이 부르던 경로만
 * 토큰 도입으로 계약이 바뀌어 `2`이고, 그 뒤 생긴 새 경로는 전부 `1`이다. 앞으로 추가되는 API도 `1`로
 * 시작한다. 원본은 백엔드 Swagger의 각 API `API-Version` 파라미터 기본값이다(백엔드 ADR-0015·0020).
 *
 * **다른 값을 보내면 400이다.** 양방향으로 엄격해서 v2 경로에 `1`을 보내도, v1 경로에 `2`를 보내도
 * 거절된다. 그래서 공통 래퍼에 전역 기본값을 두면 어떤 요청에는 반드시 틀린 값이 나간다 —
 * 값은 여기서만 정하고 호출부는 자기 엔드포인트 키만 넘긴다.
 *
 * **버전을 올릴 때는 이 표만 고치면 되는 게 아니다.** 버전이 올랐다는 건 그 엔드포인트의 응답 모양이나
 * 의미가 바뀌었다는 뜻이라, 아래 `parsedBy`가 가리키는 코드도 같이 바꿔야 한다.
 */

/** 이중 계약 엔드포인트. 구 앱 문서(토큰 출처 없음)는 `legacy`를, 신 앱 문서는 `version`을 보낸다. */
interface DualContractEndpoint {
  readonly version: string;
  /** 구 앱이 쓰던 계약의 버전. 컷오버가 끝나 구 방식 분기를 지울 때 이 필드도 함께 사라진다. */
  readonly legacy: string;
  /** 이 버전의 응답을 읽는 코드 — 버전을 올릴 때 같이 봐야 한다. */
  readonly parsedBy: string;
}

/** 구 앱 대응이 없는 새 경로. 계약이 하나뿐이라 문서 종류와 무관하게 같은 값을 보낸다. */
interface SingleContractEndpoint {
  readonly version: string;
  readonly legacy?: undefined;
  readonly parsedBy: string;
}

export type ApiEndpointSpec = DualContractEndpoint | SingleContractEndpoint;

export const API_ENDPOINTS = {
  /** `POST /api/users` — 등록. v2 응답에는 `userId`가 없고 신원은 access JWT `sub`에 있다. */
  register: { version: "2", parsedBy: "apps/mobile/lib/auth.ts registerUser" },
  /** `POST /api/auth/refresh` — 구 앱에 토큰이 없어 갱신을 부른 적이 없으니 새 경로다. */
  refresh: { version: "1", parsedBy: "apps/mobile/lib/auth.ts refreshOnce" },

  /** `GET`·`PATCH /api/users/me/profile` ↔ 구 계약 `/api/users/{userId}/profile` */
  profile: { version: "2", legacy: "1", parsedBy: "apps/web/src/lib/profileApi.ts" },

  /** `GET /api/stats?date=` */
  stats: { version: "2", legacy: "1", parsedBy: "apps/web/src/lib/statsApi.ts getStats" },
  /** `GET /api/stats/streak` */
  statsStreak: { version: "2", legacy: "1", parsedBy: "apps/web/src/lib/statsApi.ts getStreak" },
  /** `GET /api/stats/period` */
  statsPeriod: {
    version: "2",
    legacy: "1",
    parsedBy: "apps/web/src/lib/statsApi.ts getPeriodStats",
  },
  /** `GET /api/stats/study-days` — 구 앱 계약이 없다. 구 앱 문서가 부르면 실패하고 화면에 `—`가 남는다. */
  studyDays: { version: "1", parsedBy: "apps/web/src/lib/statsApi.ts getStudyDays" },

  /** `POST /api/study-sessions` — 세션 제출 */
  studySessionSubmit: {
    version: "2",
    legacy: "1",
    parsedBy: "apps/web/src/features/study-session/submitStudySession.ts",
  },
  /** `GET /api/study-sessions/{id}` — 세션 상세 */
  studySessionDetail: {
    version: "2",
    legacy: "1",
    parsedBy: "apps/web/src/lib/studySessionApi.ts",
  },
  /** `PUT /api/study-sessions/active` — 활성 세션 보고 */
  activeSessionReport: {
    version: "2",
    legacy: "1",
    parsedBy: "apps/web/src/features/study-session/reportActiveSession.ts",
  },
  /** `GET /api/study-sessions/active` — 활성 세션 조회 */
  activeSessionRestore: {
    version: "2",
    legacy: "1",
    parsedBy: "apps/web/src/features/study-session/restoreActiveSession.ts",
  },
  /** `POST /api/study-sessions/recovery` — 미확정 세션 마감 */
  sessionRecovery: {
    version: "2",
    legacy: "1",
    parsedBy: "apps/web/src/features/study-session/closeStaleSession.ts",
  },

  /** `POST /api/rooms` — 방 생성 */
  roomCreate: { version: "2", legacy: "1", parsedBy: "apps/web/src/lib/roomApi.ts createRoom" },
  /** `POST /api/rooms/join` — 방 참여 */
  roomJoin: { version: "2", legacy: "1", parsedBy: "apps/web/src/lib/roomApi.ts joinRoom" },
  /** `POST /api/rooms/{roomId}/leave` — 방 퇴장 */
  roomLeave: { version: "2", legacy: "1", parsedBy: "apps/web/src/lib/roomApi.ts leaveRoom" },

  /** `POST /api/rtc-stats` — WebRTC 통계 보고 */
  rtcStats: { version: "2", legacy: "1", parsedBy: "apps/web/src/lib/rtcStatsApi.ts" },
} as const satisfies Record<string, ApiEndpointSpec>;

export type ApiEndpoint = keyof typeof API_ENDPOINTS;

/**
 * 이 요청에 실을 `API-Version` 값.
 *
 * `legacy`는 토큰 출처가 없는 문서(구 앱 웹뷰·브라우저 단독)라는 뜻이다. 그런 문서라도 계약이 하나뿐인
 * 엔드포인트에는 그 하나를 보낸다 — 구 계약이 없으니 고를 것도 없다.
 */
export function apiVersionFor(endpoint: ApiEndpoint, legacy: boolean): string {
  const spec: ApiEndpointSpec = API_ENDPOINTS[endpoint];
  return legacy ? (spec.legacy ?? spec.version) : spec.version;
}
