import { add, Identify, identify, init, setUserId, track } from "@amplitude/analytics-browser";
import type { Types } from "@amplitude/analytics-browser";
import { plugin as engagementPlugin } from "@amplitude/engagement-browser";
import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";

import type { TrackEventMessage } from "@focusmakers/types";

import { sanitizePagePath, sanitizeUrl } from "./sanitizePath";
import { parseUserId } from "./userId";

let initialized = false;

/**
 * 마지막으로 Amplitude에 보낸 user_id. 라우트가 바뀔 때마다 `setAmplitudeUserId`가 호출되므로
 * 값이 그대로면 SDK를 건드리지 않는다 — `setUserId`는 호출할 때마다 identity 변경으로 취급되어
 * 리플레이·플러그인의 `onIdentityChanged`가 매번 돈다.
 */
let currentUserId: string | null = null;

/**
 * **값이 URL인 이벤트 속성**. 여기 적힌 키만 `sanitizeUrl`을 태운다.
 *
 * 키 이름 규칙(`~URL`·`~Path`)으로 자동 판별하지 않는 이유: autocapture의
 * `[Amplitude] Element Path`는 URL이 아니라 DOM 경로(`div > button.foo`)라서 정제하면 망가진다.
 * 새 URL 속성이 생기면 여기에 명시적으로 추가한다.
 *
 * - `Page Location`·`Previous Page Location` — `location.href` 원본. **쿼리가 그대로 붙는다.**
 * - `Page URL` — SDK가 `split("?")[0]`로 쿼리는 이미 뗐지만 `/room/42` 같은 숫자 id가 남는다.
 * - `Page Path` — pathname. 위와 같은 이유로 `:id` 템플릿화가 필요하다.
 * - `Element Href` — 클릭한 앵커의 href.
 * - `referrer`·`initial_referrer` — attribution이 담는 `document.referrer`. 웹뷰가 우리 페이지
 *   사이를 전체 네비게이션으로 이동하면 `?userId=N`이 그대로 들어온다.
 */
const URL_EVENT_PROPERTIES = [
  "[Amplitude] Page Location",
  "[Amplitude] Previous Page Location",
  "[Amplitude] Page URL",
  "[Amplitude] Page Path",
  "[Amplitude] Element Href",
  "referrer",
  "initial_referrer",
];

/** user property로 나가는 URL 값. `$set`/`$setOnce` 안에도 같은 키로 들어온다. */
const URL_USER_PROPERTIES = ["referrer", "initial_referrer"];

function sanitizeBag(bag: unknown, keys: readonly string[]) {
  if (typeof bag !== "object" || bag === null) return;
  const record = bag as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value !== "") {
      record[key] = sanitizeUrl(value);
    }
  }
}

/**
 * 모든 전송 이벤트의 URL 속성을 `sanitizeUrl`로 정제하는 enrichment 플러그인.
 *
 * **autocapture가 담는 URL은 우리 코드를 거치지 않는다** — 클릭 이벤트의 `Page URL`·`Element Href`
 * 등이 그렇다. 이들은 이벤트가 만들어지는 시점에 이미 붙어 있으므로 이 플러그인이 정제할 수 있다.
 *
 * ⚠️ **이 플러그인은 enrichment 중 가장 먼저 실행된다** — `add()`를 `init()`보다 먼저 부르면
 * 대기열(`q`)이 `init` 초반에 비워지면서 `timeline.plugins`의 맨 앞에 들어가고, SDK 내부
 * 플러그인은 그 뒤에 등록되기 때문이다. 즉 **우리 뒤에 실행되는 플러그인이 덧붙이는 값은 정제할 수
 * 없다.** 그래서 뒤에서 URL을 주입하는 두 경로를 `init` 설정에서 아예 꺼 둔다
 * (`pageUrlEnrichment: false`, attribution의 `eventProperty` 모드 제외 — 아래 `initAmplitude` 참고).
 * **그 두 설정과 이 플러그인은 한 세트다. 하나만 되돌리지 말 것** —
 * `amplitudePipeline.test.ts`가 실제 SDK의 전송 payload로 이 조합을 검증한다.
 */
function sanitizeUrlPlugin(): Types.EnrichmentPlugin {
  return {
    name: "focusmakers-sanitize-url",
    type: "enrichment",
    // 동기 처리지만 플러그인 계약이 Promise 반환을 요구한다.
    execute: async (event) => {
      // SDK 타입은 매출 이벤트까지 포함한 유니온이라 문자열 키로 못 읽는다. 우리가 만지는 것은
      // 위 목록의 키뿐이고 값 타입도 확인하므로 레코드로 좁혀서 다룬다.
      sanitizeBag(event.event_properties, URL_EVENT_PROPERTIES);
      const user = event.user_properties as Record<string, unknown> | undefined;
      if (user) {
        sanitizeBag(user, URL_USER_PROPERTIES);
        // Identify 이벤트는 값이 연산자 아래에 한 겹 더 들어간다.
        sanitizeBag(user.$set, URL_USER_PROPERTIES);
        sanitizeBag(user.$setOnce, URL_USER_PROPERTIES);
      }
      return event;
    },
  };
}

/**
 * Amplitude 초기화. `VITE_AMPLITUDE_API_KEY`가 없으면 아무것도 하지 않는다 —
 * 로컬 개발·테스트는 키 없이 그대로 돌아간다.
 *
 * autocapture는 `pageViews`만 끈다 — 페이지뷰는 `AnalyticsRouteTracker`가 정제된 경로로
 * 직접 보내므로 켜면 이중 집계가 된다. 나머지(세션·유입·클릭·폼·다운로드)는 켜고, 이들이
 * 담는 원본 URL은 `sanitizeUrlPlugin`이 전송 직전에 정제한다.
 *
 * Session Replay는 카메라 영상 요소만 차단하고 수집한다(2026-08-07 결정, CLAUDE.md) —
 * `video` 전체를 blockSelector로 막아 현재 프리뷰뿐 아니라 이후 멀티룸(LiveKit) 참가자
 * 영상도 자동으로 차단된다. 블록된 요소는 기록 시점에 직렬화 자체가 안 되므로 단말
 * 밖으로 나가지 않는다.
 */
export function initAmplitude() {
  const apiKey = import.meta.env.VITE_AMPLITUDE_API_KEY;
  if (!apiKey || initialized) return;
  initialized = true;

  // init보다 먼저 등록해야 세션 시작 이벤트부터 정제·리플레이가 붙는다.
  add(sanitizeUrlPlugin());
  add(
    sessionReplayPlugin({
      // 실제 수집률은 콘솔(Settings → Session Replay)의 sample_rate가 결정한다 — 리플레이
      // SDK는 아래 analytics의 fetchRemoteConfig: false와 무관하게 자체 원격 설정을 가져와
      // 이 값을 덮어쓴다. 여기 1은 콘솔에 설정이 없을 때의 폴백일 뿐이다(2026-08-07 진단:
      // 콘솔 기본 1%가 로컬 100%를 덮어써 수집이 안 됐다).
      sampleRate: 1,
      privacyConfig: { blockSelector: ["video", ".amp-block"] },
    }),
  );
  /**
   * Guides & Surveys(설문) 렌더러. **설문 내용·대상 cohort·노출 빈도·페이지 타겟팅은 전부
   * Amplitude 콘솔이 소유한다** — 코드는 이 한 줄로 끝이고, 설문 변경에 배포가 필요 없다.
   *
   * - 플러그인 방식이라 `init`/`boot`를 따로 부르지 않는다 — analytics의 API 키와
   *   user_id(`setAmplitudeUserId`가 붙인 서버 번호)를 그대로 물려받으므로, 콘솔 cohort
   *   타겟팅이 백엔드 집계와 같은 키로 동작한다.
   * - npm 패키지는 로더다 — 실제 번들·설문 설정은 `cdn.amplitude.com`/`gs.amplitude.com`에서
   *   런타임에 가져온다. 광고 차단기 등으로 막히면 설문만 안 뜰 뿐 나머지 수집은 무관하다
   *   (리플레이의 자체 원격 설정과 같은 성격의 fail-closed).
   * - 설문 노출·응답 이벤트는 이 analytics 인스턴스로 포워딩되어 `sanitizeUrlPlugin`(타임라인
   *   맨 앞)을 거친다. ⚠️ 다만 정제는 `URL_EVENT_PROPERTIES` **명시 목록**만 타므로, G&S가
   *   새 URL 속성 키를 담는지 첫 배포 후 실제 payload로 확인하고 목록에 추가할 것 —
   *   번들이 원격이라 정적으로는 확인할 수 없다.
   * - ⚠️ **세션 화면(`/room/*`)의 설문 차단도 콘솔 페이지 타겟팅이 단독 소유한다** — 라우트
   *   기반 `disable()` 코드 가드(`updateSurveyGate`)를 이중 방어로 뒀었지만 2026-08-21 제거했다.
   *   `disable()`은 shutdown이라 **트리거 평가·큐잉까지 죽이는데**, 설문 트리거인
   *   `study_session_submitted`는 `/room/:id`(useStudyRoomSession)에서만 발생한다 — 가드가
   *   있는 한 트리거가 항상 disabled 상태에서 소멸해 설문이 어디에서도 뜰 수 없었다(재활성화
   *   후 과거 이벤트는 재생되지 않는다). 가드를 되살리려면 트리거 이벤트를 비차단 경로에서
   *   발생시키는 설계와 한 세트로만 할 것.
   */
  add(engagementPlugin());
  init(apiKey, {
    // ⚠️ 서버 user_id는 1부터 시작하는 DB 순번이라 1~4자리가 대부분인데, Amplitude 인제스트는
    // 기본적으로 5자 미만 id를 **이벤트에서 제거**하고 device_id로만 저장한다 — 이 옵션 없이는
    // setUserId를 아무리 불러도 전원이 익명으로 남는다(2026-08-14 진단). 값을 바꾸거나 지우지
    // 말 것 — 전송 payload의 `options.min_id_length`를 `amplitudePipeline.test.ts`가 검증한다.
    minIdLength: 1,
    autocapture: {
      sessions: true,
      // 정제된 경로로 AnalyticsRouteTracker가 직접 보낸다 — 켜면 이중 집계.
      pageViews: false,
      // ⚠️ `true`(기본)로 되돌리지 말 것. 기본 `trackingMethod`는 `["userProperty","eventProperty"]`인데
      // `eventProperty` 모드는 **모든 이벤트에 `referrer`를 덧붙이는 enrichment**이고, 그 실행이
      // `sanitizeUrlPlugin`보다 뒤라 정제를 통과한다(웹뷰 전체 네비게이션이면 `?userId=N`이 실린다).
      // `userProperty` 모드는 Identify 이벤트를 만들어 보내므로 우리 플러그인이 정제할 수 있다.
      // UTM·referrer는 user property로 그대로 남아 유입 분석에는 차이가 없다.
      // `excludeInternalReferrers`는 userProperty 모드에만 적용된다 — 같은 도메인 referrer는
      // 유입 분석에 의미도 없으니 아예 뺀다.
      attribution: { trackingMethod: "userProperty", excludeInternalReferrers: true },
      formInteractions: true,
      fileDownloads: true,
      elementInteractions: true,
      // ⚠️ **명시적으로 꺼야 한다** — 생략하면 기본값이 `true`다. 이 플러그인은 속성이 비어 있는
      // 이벤트(`session_start` 등)에 `location.href`를 **원본 그대로** 채워 넣는데, 실행 순서가
      // `sanitizeUrlPlugin`보다 뒤라 정제를 통과한다. 끄면 자동 페이지 컨텍스트를 잃지만,
      // 분석에 쓰는 페이지 정보는 `trackAmplitudePageView`가 정제된 값으로 보내고 클릭 이벤트는
      // autocapture가 생성 시점에 자체적으로 담는다(그건 정제된다).
      pageUrlEnrichment: false,
    },
    // 지역·국가 지표를 위해 IP를 수집한다(2026-08-08 결정). IP는 Amplitude가 지역 판별에
    // 쓰고 보관하므로, 개인정보처리방침의 위탁·국외이전 항목이 이 설정과 맞아야 한다.
    trackingOptions: { ipAddress: true },
    // 기본값 true면 Amplitude 콘솔의 Autocapture 설정이 위 로컬 설정을 원격으로
    // 덮어쓴다 — 수집 범위 변경은 코드 리뷰를 거치도록 계속 막아 둔다.
    remoteConfig: { fetchRemoteConfig: false },
  });

  // 셸이 **최초 URL부터** `?userId=N`을 붙여 주므로 여기서 이미 신원을 붙일 수 있다.
  // 첫 라우트 이펙트(`AnalyticsRouteTracker`)까지 기다리면 그 사이에 나가는 이벤트가
  // 익명 device_id로 남는다.
  setAmplitudeUserId(parseUserId(new URLSearchParams(window.location.search).get("userId")));
}

/**
 * 서버 user_id를 Amplitude user_id로 연결한다(2026-08-08 결정). 값은 네이티브 셸이
 * 모든 탭에 붙여 주는 `?userId=N`이며, DB 값과 **그대로** 맞춰야 백엔드 집계와 조인된다 —
 * 해시하거나 접두어를 붙이지 말 것.
 *
 * ℹ️ **이 값은 계정 식별자가 아니라 익명 기기 식별자의 서버 핸들이다.** 네이티브가
 * `Crypto.randomUUID()`로 만든 기기 UUID(`apps/mobile/lib/deviceId.ts`)를 등록하면 서버가
 * 1:1로 돌려주는 번호이고, 실명·이메일·전화번호와 연결되지 않는다. Amplitude가 자체 생성하는
 * device_id 대신 이걸 쓰는 이유는 **백엔드 집계와 같은 키로 묶기 위해서**다.
 *
 * `null`(브라우저 직접 접근처럼 셸 계약 밖)이면 익명 device_id 상태로 남긴다 — 이미 붙은
 * user_id를 지우지는 않는다. 같은 기기에서 사용자가 바뀌는 경로가 아직 없어서,
 * 여기서 `setUserId(undefined)`를 부르면 정상 사용 중 신원만 끊길 위험이 더 크다.
 */
export function setAmplitudeUserId(userId: number | null) {
  if (!initialized || userId === null) return;
  const next = String(userId);
  if (next === currentUserId) return;
  currentUserId = next;
  setUserId(next);
}

/** 현재 라우트의 페이지뷰를 전송한다. 경로는 정제를 거치며, 미초기화면 no-op. */
export function trackAmplitudePageView(pathname: string, search: string) {
  if (!initialized) return;
  const path = sanitizePagePath(pathname, search);
  track("[Amplitude] Page Viewed", {
    "[Amplitude] Page Path": path,
    // 원본 location.href에는 userId 쿼리가 그대로 있어 쓰지 않는다.
    "[Amplitude] Page Location": window.location.origin + path,
    "[Amplitude] Page Title": document.title,
  });
}

/**
 * 유입 채널(`preregister`·`ads` 등)을 user property로 저장한다. 이후 모든 차트를
 * 이 속성으로 세그먼트해 타겟/논타겟 활성도를 비교한다. 호출처는 온보딩 채널
 * 문항(예정). 미초기화면 no-op.
 *
 * autocapture `attribution`이 UTM·referrer를 자동으로 담지만 이 함수를 대체하지는 않는다 —
 * 사전신청·인터뷰 참여자는 UTM 없이 들어오는 경우가 많아 자기 신고 값이 따로 필요하다.
 */
export function setAcquisitionChannel(channel: string) {
  if (!initialized) return;
  const id = new Identify();
  id.set("acquisition_channel", channel);
  identify(id);
}

/**
 * 세션이 열린 룸의 종류 — 개인(single) / 그룹 스터디 소셜룸(social).
 *
 * 소셜룸(`LiveRoomSession`)이 개인 세션과 같은 `useStudyRoomSession`을 재사용하므로,
 * 이 속성 없이는 `study_session_*` 이벤트가 구분 없이 섞여 F1(핵심 활성화 퍼널)이
 * 오염된다(BY-472). 세션 이벤트 3종 전부에 실린다.
 */
export type StudyRoomType = "single" | "social";

/** 세션 종료 사유 — `features/study-session`의 `SessionEndReason`을 평평하게 편 값. */
export interface StudySessionEndedInput {
  readonly roomType: StudyRoomType;
  readonly studySec: number;
  readonly focusSec: number;
  readonly pauseSec: number;
  readonly distractionSec: number;
  /** 수동 종료(S3-7)인지 일시정지 자동 종료(S3-8)인지. */
  readonly endReason: "MANUAL" | "AUTO";
  /** 자동 종료를 유발한 일시정지 트리거. 수동 종료면 `null`. */
  readonly pauseTrigger: "MANUAL" | "BACKGROUND" | null;
  /** 서버 제출을 시도하는가 — `userId`가 없으면 미제출(`unsaved`)로 끝난다. */
  readonly willSubmit: boolean;
}

/**
 * 스터디룸 진입 = 세션 시작. 세션 완주율(시작 대비 종료)의 분모다.
 *
 * `restored`는 서버의 진행중 세션을 이어받은 진입(웹뷰 재로드·앱 재실행 뒤 복원)이다 — 같은 세션이
 * 두 번 "시작"으로 찍히므로 완주율 분모에서는 `restored = false`만 센다(2026-09-05 최종 검토).
 */
export function trackStudySessionStarted(roomType: StudyRoomType, restored = false) {
  if (!initialized) return;
  track("study_session_started", { room_type: roomType, restored });
}

/**
 * 세션 종료 집계. **세션당 정확히 한 번** 보낸다(제출 재시도로 다시 보내지 않는다) —
 * 호출 측(`useStudyRoomSession`)이 최초 종료 시점에 한 번만 부르도록 막고 있다.
 *
 * 집중률은 여기서 계산한다(`focusSec / studySec`). 0초 세션의 0 나눗셈은 0으로 떨어뜨린다 —
 * `sessionResult.ts`가 서버 값에 대해 쓰는 규칙과 같다.
 */
export function trackStudySessionEnded(input: StudySessionEndedInput) {
  if (!initialized) return;
  track("study_session_ended", {
    room_type: input.roomType,
    study_sec: Number(input.studySec),
    focus_sec: Number(input.focusSec),
    pause_sec: Number(input.pauseSec),
    distraction_sec: Number(input.distractionSec),
    focus_rate_percent:
      input.studySec > 0 ? Math.round((input.focusSec / input.studySec) * 100) : 0,
    end_reason: input.endReason,
    pause_trigger: input.pauseTrigger,
    will_submit: input.willSubmit,
  });
}

/**
 * 세션 제출 결과. 종료 이벤트와 달리 **시도마다** 보낸다 — 재시도 횟수와 실패율이
 * 여기서 나온다(웹뷰 브리지 유실은 실기기에서 실제로 겪은 문제다, `lib/bridge.ts`).
 */
export function trackStudySessionSubmitted(ok: boolean, attempt: number, roomType: StudyRoomType) {
  if (!initialized) return;
  track("study_session_submitted", { ok, attempt, room_type: roomType });
}

/* ── 그룹 스터디(소셜룸) 이벤트 (BY-472) ─────────────────────────────────────
 *
 * ⚠️ 초대코드 값은 어떤 이벤트 속성으로도 보내지 않는다 — 코드는 입장 권한 토큰
 * 성격이라 분석 도구로 나가면 안 된다(URL 정제가 `?userId`를 지키는 것과 같은 원칙).
 * 코드 관련 계측은 존재 여부(`has_code`)·결과(`reason`)까지만 싣는다.
 */

/** 방 생성 성공 — 페이지뷰 근사(`/social/code` 진입)를 명시 이벤트로 대체한다. */
export function trackSocialRoomCreated() {
  if (!initialized) return;
  track("social_room_created");
}

/** 방 생성 실패(2026-09-05) — `reason`은 입장 실패와 같은 규칙(서버 코드 / `HTTP_n` / `NETWORK_OR_UNKNOWN`). */
export function trackSocialRoomCreateFailed(reason: string) {
  if (!initialized) return;
  track("social_room_create_failed", { reason });
}

/**
 * 초대코드 입장 실패. `reason`은 서버 에러 코드(`RoomJoinErrorCode`) 또는
 * `HTTP_{status}` / `NETWORK_OR_UNKNOWN` 폴백 — `joinErrorCopy.joinErrorReason`이 만든다.
 * 실패 사유는 페이지뷰 퍼널로는 절대 보이지 않는, 초대 전환율 개선의 핵심 데이터다.
 */
export function trackSocialRoomJoinFailed(reason: string) {
  if (!initialized) return;
  track("social_room_join_failed", { reason });
}

/** 룸 입장(세션 마운트 직전). `grace_rejoin`은 유예 30초 내 재입장 여부다. */
export function trackSocialRoomEntered(graceRejoin: boolean) {
  if (!initialized) return;
  track("social_room_entered", { grace_rejoin: graceRejoin });
}

export interface SocialRoomExitedInput {
  /** 퇴장 시점의 룸 인원(나 포함). */
  readonly memberCount: number;
  /**
   * `session_end`: 세션 종료 후 퇴장(수동/자동 구분은 `study_session_ended.end_reason`이
   * 이미 갖는다 — 여기 중복하지 않는다). `grace_expired`: 백그라운드 유예 초과 종료.
   */
  readonly exitReason: "session_end" | "grace_expired";
  /** 입장부터 퇴장까지 체류 시간 — 공부시간(`study_sec`)과 다른 축이다. */
  readonly durationSec: number;
}

export function trackSocialRoomExited(input: SocialRoomExitedInput) {
  if (!initialized) return;
  track("social_room_exited", {
    member_count: input.memberCount,
    exit_reason: input.exitReason,
    duration_sec: input.durationSec,
  });
}

/**
 * 룸 재입장(자리 재예약) 실패 — `kind`는 `joinErrorCopy.rejoinFailure`의 leave/retry 판정
 * 그대로다. 재입장 버그 계열(BY-437/443)의 실사용 영향을 여기서 잰다.
 */
export function trackSocialRoomRejoinFailed(kind: "leave" | "retry", reason: string) {
  if (!initialized) return;
  track("social_room_rejoin_failed", { kind, reason });
}

/** 백그라운드 유예(30초) 초과로 세션이 자동 종료된 복귀 — BY-467 안내 개선의 분모다. */
export function trackSocialRoomGraceExceeded() {
  if (!initialized) return;
  track("social_room_grace_exceeded");
}

/* ── 초대 루프 이벤트 (BY-472) ── */

/**
 * 초대 공유 행동의 결과 — `shared`: OS 공유 시트(웹/브리지), `copied`: 클립보드
 * (share 미지원 폴백과 코드 복사 버튼 둘 다), `failed`: 둘 다 실패.
 */
export function trackInviteShared(method: "shared" | "copied" | "failed") {
  if (!initialized) return;
  track("invite_shared", { method });
}

/** 초대코드 입력 화면 진입 — `has_code`면 초대 링크(`?code`) 경유. 공유→입장 전환율의 분모. */
export function trackInviteLinkOpened(hasCode: boolean) {
  if (!initialized) return;
  track("invite_link_opened", { has_code: hasCode });
}

/**
 * 앱 미설치 브라우저에서 스토어 링크로 이동 — 초대발 신규 설치의 근사치다.
 * ⚠️ 스토어 이동으로 페이지가 내려가면 전송이 유실될 수 있는 베스트 에포트 이벤트다 —
 * 모바일 브라우저는 스토어가 별도 앱으로 열려 페이지가 살아남는 경우가 대부분이라 감수한다.
 */
export function trackStoreLinkRedirected(platform: "android" | "ios") {
  if (!initialized) return;
  track("store_link_redirected", { platform });
}

/* ── WebRTC 연결 품질 (BY-472) ── */

/**
 * 피어 연결 최초 수립 — 룸 세션당 상대별 1회(재연결은 세지 않는다 — `peerMesh`가 막는다).
 * `path`는 선택된 ICE 후보 종류(host/srflx/prflx/relay, 통계 미지원이면 unknown) —
 * `relay`면 TURN 경유다.
 */
export function trackPeerConnectionEstablished(input: { peerCount: number; path: string }) {
  if (!initialized) return;
  track("peer_connection_established", { peer_count: input.peerCount, path: input.path });
}

/**
 * 피어 연결 종국 실패(ICE 재시작 시도까지 소진) — 상대별 1회. 소셜룸의 핵심 가치가
 * 화면 공유라 이 실패율은 곧 기능 실패율이다.
 */
export function trackPeerConnectionFailed(peerCount: number) {
  if (!initialized) return;
  track("peer_connection_failed", { peer_count: peerCount });
}

/* ── 브리지 기반 앱 이벤트 (BY-472) ─────────────────────────────────────────
 *
 * 네이티브 Amplitude SDK 없이, 네이티브→웹 브리지(`lib/bridge.ts`) 메시지를 웹 SDK로
 * 옮겨 담는다. 구독·배선은 `lib/appLifecycleAnalytics.ts` 한 곳이 소유한다.
 */

/** 네이티브 앱 실행(브리지 `app-launched`) — 페이지뷰보다 정확한 앱 실행 근사. */
export function trackAppLaunched() {
  if (!initialized) return;
  track("app_launched");
}

/**
 * OS 카메라 권한 상태 — 설정(S6)이 네이티브에 물어본 `camera-permission` 응답을 user property로
 * 남긴다. 이벤트가 아니라 **상태**라 property가 맞다: "권한 거부 사용자" 코호트를 바로 만들 수 있고,
 * 설정 탭을 여는 횟수만큼 이벤트가 찍히는 잡음이 없다. 권한 **게이트의 분기 결과**(허용/거부/
 * 기거부/조회 실패)는 네이티브가 `camera_permission_gate_resolved`로 따로 보낸다(BY-616).
 */
export function setCameraPermissionUserProperty(granted: boolean) {
  if (!initialized) return;
  const id = new Identify();
  id.set("camera_permission_granted", granted);
  identify(id);
}

/**
 * 앱 환경 user property 일괄 설정 — `is_webview`(브리지 존재), `app_version`(셸이 URL에
 * 실어 주는 `?appVersion`, `remoteQueryParams.ts` 계약 — 브라우저 단독이면 없어서 생략),
 * `theme`. 호출처는 `initAppLifecycleAnalytics` 한 곳뿐이다.
 */
export function setAppEnvironmentUserProperties(input: {
  isWebview: boolean;
  appVersion: string | null;
  theme: "light" | "dark";
}) {
  if (!initialized) return;
  const id = new Identify();
  id.set("is_webview", input.isWebview);
  if (input.appVersion !== null) {
    id.set("app_version", input.appVersion);
  }
  id.set("theme", input.theme);
  identify(id);
}

/** 실행 중 테마 변경(브리지 `theme` 메시지)을 user property에 반영한다. */
export function setThemeUserProperty(scheme: "light" | "dark") {
  if (!initialized) return;
  const id = new Identify();
  id.set("theme", scheme);
  identify(id);
}

/**
 * 네이티브 셸이 브리지 `track-event`로 넘긴 사용자 이벤트(`lib/nativeAnalytics.ts`) — 하단 탭 터치,
 * 카메라 권한 게이트 결과, 권한 거부 안내(S2-3) 행동, 업데이트 권장 알림창 응답, 알림 탭 등.
 * **이벤트 카탈로그는 발신자인 `apps/mobile/lib/nativeAnalytics.ts`가 소유한다** — 여기서는 이름을
 * 해석하지 않는다.
 *
 * - `source: "native"`를 붙여 웹 발신 이벤트와 출처를 가른다.
 * - `time`은 네이티브가 기록한 **발생 시각**이다. 이벤트는 포커스된 웹뷰가 준비될 때까지 네이티브
 *   큐에 머물다 늦게 도착할 수 있어(권한 거부 화면이 탭을 덮은 동안 등) 전송 시각을 쓰면 타임라인
 *   순서가 뒤집힌다. 세션 귀속은 SDK가 전송 시각으로 판단하므로 이 값에 영향받지 않는다.
 */
export function trackNativeShellEvent(event: TrackEventMessage) {
  if (!initialized) return;
  track(event.name, { ...event.properties, source: "native" }, { time: event.atMs });
}

/* ── 세션 내부·홈·설정·복구 이벤트 (BY-616 확장) ───────────────────────────
 *
 * 룸 안에서 일어나는 사용자 행동은 전부 웹이 안다 — 여기서 직접 찍는다. `room_type`은 소셜룸이
 * 같은 훅(`useStudyRoomSession`)을 재사용해 개인/그룹이 섞이는 것을 막는 BY-472의 축과 같은 값.
 *
 * **원칙(2026-09-05 최종 검토): 사용자 사건은 전부 명시 이벤트로 남긴다.** autocapture의
 * `[Amplitude] Element Clicked`는 SDK 소유의 안전망일 뿐 우리 이벤트가 아니다 — 요소 텍스트만 알고
 * 의미(어느 룸 종류인지·몇 번째 스텝인지·결과가 어땠는지)는 모르고, 스와이프·회전·서버 응답은 아예
 * 못 본다. 같은 순간에 다른 질문의 이벤트가 겹치는 것은 중복이 아니다(종료 요청 ↔ 종료 확정, 비집중
 * 건별 ↔ 종료 집계). 중복은 **같은 사건을 같은 뜻으로 두 번** 찍는 것뿐이라, 한 사건은 한 발신부에서만
 * 찍는다(상태 전이는 `applyState`·`pause`·`resume`이 실제 전이일 때만).
 */

/** 일시정지 시작. `trigger`는 수동(버튼) / 백그라운드(화면 꺼짐·앱 전환). 이미 정지 중이면 찍히지 않는다. */
export function trackStudySessionPaused(trigger: "MANUAL" | "BACKGROUND", roomType: StudyRoomType) {
  if (!initialized) return;
  track("study_session_paused", { trigger, room_type: roomType });
}

/**
 * 재개 — 항상 사용자의 재개 버튼이다(자동 재개 없음, 2026-07-26 확정). `pause_sec`는 이번 정지가
 * 이어진 시간, `trigger`는 그 정지를 시작한 쪽. 20분을 넘기면 자동 종료라 재개 이벤트 없이
 * `study_session_ended {end_reason: AUTO}`로 끝난다.
 */
export function trackStudySessionResumed(input: {
  readonly pauseSec: number;
  readonly trigger: "MANUAL" | "BACKGROUND";
  readonly roomType: StudyRoomType;
}) {
  if (!initialized) return;
  track("study_session_resumed", {
    pause_sec: Number(input.pauseSec),
    trigger: input.trigger,
    room_type: input.roomType,
  });
}

/**
 * 비집중 구간 하나가 **끝났을 때** — 자리 이탈(AWAY)·휴대폰(PHONE)·기기 조작(DEVICE)이 얼마나
 * 이어졌는지. 세션당 수십 건까지 날 수 있어 시작·끝을 따로 찍지 않고 끝에서 한 건으로 접는다.
 * 세션 종료로 닫히는 마지막 구간은 찍지 않는다 — 그 몫은 `study_session_ended.distraction_sec`.
 * 종료 이벤트의 `away_count/phone_count/device_count/pause_count`는 같은 집계의 세션 단위 요약이다
 * (퍼널 필터용) — 건별 길이 분포는 여기서만 나온다.
 * 원본 프레임·얼굴 데이터는 없다. 상태 enum과 초 단위 길이뿐이다.
 */
export function trackStudySessionDistracted(input: {
  readonly status: "AWAY" | "PHONE" | "DEVICE";
  readonly durationSec: number;
  readonly roomType: StudyRoomType;
}) {
  if (!initialized) return;
  track("study_session_distracted", {
    status: input.status,
    duration_sec: Number(input.durationSec),
    room_type: input.roomType,
  });
}

/** 카메라 전환 결과 — 실패 사유(`camera-off` / `no-alternative`)는 "전환할 카메라가 없어요" 토스트의 분모. */
export function trackCameraFlipped(
  result:
    | { readonly ok: true; readonly facing: string }
    | { readonly ok: false; readonly reason: string },
  roomType: StudyRoomType,
) {
  if (!initialized) return;
  track("camera_flipped", {
    ok: result.ok,
    facing: result.ok ? result.facing : null,
    reason: result.ok ? null : result.reason,
    room_type: roomType,
  });
}

/** 컨트롤 바 종료 버튼 → S3-7 확인 다이얼로그 노출. 실제 종료는 `study_session_ended`가 갖는다. */
export function trackStudySessionExitRequested(roomType: StudyRoomType) {
  if (!initialized) return;
  track("study_session_exit_requested", { room_type: roomType });
}

/** S3-7에서 "계속하기" — 종료 의사를 접은 횟수. 요청 대비 취소율이 종료 문구·위치의 근거가 된다. */
export function trackStudySessionExitCancelled(roomType: StudyRoomType) {
  if (!initialized) return;
  track("study_session_exit_cancelled", { room_type: roomType });
}

/**
 * 소셜룸 카메라 토글 — 끄기는 즉시(=일시정지), 켜기는 확인 다이얼로그를 거친 뒤에만 찍힌다.
 * 룸에서 카메라 끔은 측정 일시정지와 동치라 `study_session_paused/resumed`도 같이 난다 — 이쪽은
 * "카메라"라는 사용자 의도의 축이고, 저쪽은 측정 상태의 축이다.
 */
export function trackSocialRoomCameraToggled(on: boolean) {
  if (!initialized) return;
  track("social_room_camera_toggled", { on });
}

/** 소셜룸 카메라 켜기 확인 다이얼로그에서 취소 — 켜기 의사를 접은 횟수. */
export function trackSocialRoomCameraOnDismissed() {
  if (!initialized) return;
  track("social_room_camera_on_dismissed");
}

/**
 * 소셜룸에서 백그라운드·화면 꺼짐 뒤 돌아옴. `expired`면 30초 유예를 넘겨 종료 처리된 복귀다
 * (`social_room_grace_exceeded`와 같은 순간). 유예 이내 복귀의 분포가 유예 값(30초)의 근거가 된다.
 */
export function trackSocialRoomBackgroundReturned(input: {
  readonly hiddenSec: number;
  readonly expired: boolean;
}) {
  if (!initialized) return;
  track("social_room_background_returned", {
    hidden_sec: Number(input.hiddenSec),
    expired: input.expired,
  });
}

/**
 * 홈 "집중 시작" 탭 — 가이드로 갈지 세션으로 갈지는 온보딩 완료 여부가 정한다. autocapture
 * 클릭은 분기를 모른다. F1 퍼널의 첫 행동이자 `camera_permission_gate_resolved`의 분모.
 */
export function trackFocusStartTapped(destination: "guide" | "session") {
  if (!initialized) return;
  track("focus_start_tapped", { destination });
}

/** 설정 탭 카메라 권한 행 → OS 설정 열기 요청. 권한 거부 안내(S2-3)의 같은 행동은 네이티브가 `permission_denied_settings_opened`로 찍는다. */
export function trackOsSettingsOpened(source: "settings_tab") {
  if (!initialized) return;
  track("os_settings_opened", { source });
}

/** 앱 실행 시 미확정 세션을 기록으로 확정했다는 안내 노출. `focus_sec`는 확정된 순공 시간. */
export function trackSessionRecoveryPrompted(focusSec: number) {
  if (!initialized) return;
  track("session_recovery_prompted", { focus_sec: Number(focusSec) });
}

/** 위 안내의 확인 버튼. */
export function trackSessionRecoveryConfirmed() {
  if (!initialized) return;
  track("session_recovery_confirmed");
}

/**
 * 세션 화면의 회전(2026-09-05) — 가로 거치 모드(S3-5·S3-6, 소셜룸 가로 그리드)를 실제로 쓰는지는
 * 클릭이 아니라 기기 회전이라 autocapture에 전혀 없다. 마운트 시점의 방향은 찍지 않고 **바뀔 때만**
 * 남긴다(`features/study-session/useSessionOrientationAnalytics.ts`).
 */
export function trackSessionOrientationChanged(input: {
  readonly orientation: "portrait" | "landscape";
  readonly roomType: StudyRoomType;
}) {
  if (!initialized) return;
  track("session_orientation_changed", {
    orientation: input.orientation,
    room_type: input.roomType,
  });
}

/** 싱글룸 심플 모드(S3-4) 토글(2026-09-05) — 화면 탭 한 번으로 켜고 끈다. `on`은 전환 후 상태. */
export function trackSessionSimpleModeToggled(on: boolean) {
  if (!initialized) return;
  track("session_simple_mode_toggled", { on });
}

/* ── 화면별 잔여 상호작용 (BY-616 확장 2차) ──────────────────────────────────
 *
 * 실기기 검증 중 "붙일 수 있는 요소는 전부 붙인다"로 범위를 넓혔다(2026-09-05). 운영에서는
 * autocapture가 모든 클릭을 `[Amplitude] Element Clicked`로 잡지만 어느 버튼인지(요소 텍스트)만
 * 알고 **의미**(몇 번째 스텝인지, 오늘 날짜인지, 어느 룸 종류인지)는 모른다 — 그 의미를 가진
 * 컴포넌트에서 명시 이벤트로 남긴다. 속성은 enum·boolean·수만 — 닉네임·목표 문구·초대코드 금지.
 */

/**
 * 온보딩 가이드 진입(2026-09-05) — 어느 경로로 들어왔는지(`entry`: 홈 "집중 시작" 첫 실행 /
 * 홈 가이드 카드 / 설정 "측정 기준 안내"). 진입 → 완료 퍼널의 첫 단계다. 스텝 1 첫 노출과 같은
 * 순간이지만 따로 둔다 — 스텝 이벤트는 진행을, 이 이벤트는 유입을 묻는다(같은 `entry`가 가이드
 * 이벤트 전부에 실려 어느 쪽으로도 세그먼트할 수 있다).
 */
export function trackGuideEntered(entry: "focus-start" | "home-card" | "settings") {
  if (!initialized) return;
  track("guide_entered", { entry });
}

/**
 * 온보딩 가이드 스텝 노출 — 라우트 하나(`/onboarding-guide`)라 페이지뷰로는 스텝별 이탈이 절대
 * 안 잡힌다. `method`는 그 스텝에 온 수단: 첫 진입 `initial`, CTA 버튼 `cta`, 탭·스와이프 `gesture`,
 * 이전 `prev`. 뒤로 갔다 다시 오면 같은 스텝이 다시 찍힌다(중복 제거는 차트에서 "첫 발생" 기준).
 */
export function trackGuideStepViewed(input: {
  readonly step: number;
  readonly entry: "focus-start" | "home-card" | "settings";
  readonly method: "initial" | "cta" | "gesture" | "prev";
}) {
  if (!initialized) return;
  track("guide_step_viewed", {
    step: Number(input.step),
    entry: input.entry,
    method: input.method,
  });
}

/** 가이드 종료 — 완료(G5 CTA) 또는 건너뛰기. `step`은 그때 보고 있던 스텝(건너뛴 위치). */
export function trackGuideFinished(input: {
  readonly reason: "completed" | "skipped";
  readonly step: number;
  readonly entry: "focus-start" | "home-card" | "settings";
}) {
  if (!initialized) return;
  track("guide_finished", { reason: input.reason, step: Number(input.step), entry: input.entry });
}

/** 기록 달력 날짜 선택. 절대 날짜는 싣지 않고 오늘 여부·기록 유무만 — 과거 탐색 깊이의 근사. */
export function trackRecordsDateSelected(input: {
  readonly isToday: boolean;
  readonly hasRecords: boolean;
}) {
  if (!initialized) return;
  track("records_date_selected", { is_today: input.isToday, has_records: input.hasRecords });
}

/** 기록 달력 월 이동. `delta`는 -1(이전)/1(다음), `method`는 화살표 버튼/스와이프. */
export function trackRecordsMonthChanged(input: {
  readonly delta: -1 | 1;
  readonly method: "button" | "swipe";
}) {
  if (!initialized) return;
  track("records_month_changed", { delta: input.delta, method: input.method });
}

/** 설정 탭의 행 터치. 카메라 권한 행은 `os_settings_opened`가 따로 갖는다. */
export function trackSettingsRowPressed(
  row: "profile" | "guide" | "contact" | "terms" | "privacy" | "licenses",
) {
  if (!initialized) return;
  track("settings_row_pressed", { row });
}

/** 프로필 저장 제출(검증 통과 후). 어떤 필드를 바꿨는지만 — 값은 싣지 않는다. */
export function trackProfileSaveSubmitted(input: {
  readonly nickname: boolean;
  readonly goal: boolean;
  readonly category: boolean;
}) {
  if (!initialized) return;
  track("profile_save_submitted", {
    changed_nickname: input.nickname,
    changed_goal: input.goal,
    changed_category: input.category,
  });
}

/** 프로필 저장 결과. 실패 `reason`은 서버 코드(`NICKNAME_TAKEN` 등)나 `NETWORK_OR_UNKNOWN`. */
export function trackProfileSaveResult(result: { ok: true } | { ok: false; reason: string }) {
  if (!initialized) return;
  if (result.ok) {
    track("profile_save_succeeded");
    return;
  }
  track("profile_save_failed", { reason: result.reason });
}

/** S4 결과 화면을 닫음 — 하단 CTA(`cta`) 또는 우상단 X(`close`). 둘 다 홈(소셜)으로 간다. */
export function trackStudyResultConfirmed(input: {
  readonly roomType: StudyRoomType;
  readonly via: "cta" | "close";
}) {
  if (!initialized) return;
  track("study_result_confirmed", { room_type: input.roomType, via: input.via });
}

/** S4 비집중 통계 카드의 항목 펼치기/접기 — 결과를 얼마나 들여다보는지. */
export function trackStudyResultDistractionToggled(input: {
  readonly status: "AWAY" | "PHONE" | "DEVICE" | "PAUSE";
  readonly expanded: boolean;
}) {
  if (!initialized) return;
  track("study_result_distraction_toggled", { status: input.status, expanded: input.expanded });
}

/** 세션 종료 안내 확인 — 자동 종료(S3-8) "결과 보기" / 순공 1분 미만 안내 "홈으로". */
export function trackSessionNoticeConfirmed(input: {
  readonly notice: "auto_end" | "sub_minute";
  readonly roomType: StudyRoomType;
}) {
  if (!initialized) return;
  track("session_notice_confirmed", { notice: input.notice, room_type: input.roomType });
}

/** 오류 상태의 "다시 시도" — 어느 화면의 어떤 로드가 실패했는지. */
export function trackErrorRetryPressed(
  screen: "home" | "records" | "profile" | "live_room_entry" | "contact",
) {
  if (!initialized) return;
  track("error_retry_pressed", { screen });
}

/** 렌더 크래시 폴백의 "새로고침" — 에러 자체는 Sentry가 갖고, 사용자가 복구를 시도한 횟수만 센다. */
export function trackErrorFallbackReloaded() {
  if (!initialized) return;
  track("error_fallback_reloaded");
}

/** 전체 화면 라우트의 뒤로가기 헤더. `path`는 정제된 현재 경로(`/profile`·`/social/code` 등). */
export function trackScreenBackPressed(path: string) {
  if (!initialized) return;
  track("screen_back_pressed", { path });
}

/** 웹 강제 업데이트 모달의 스토어 이동 — 네이티브 게이트가 없는 구버전 바이너리 전용 경로. */
export function trackForceUpdateStoreOpened() {
  if (!initialized) return;
  track("force_update_store_opened", { source: "web" });
}

/**
 * 웹 강제 업데이트 모달 노출(2026-09-05) — 라우트 트리 대신 뜨는 모달이라 페이지뷰가 노출을 대변하지
 * 못한다(그 순간의 페이지뷰는 모달 뒤의 경로로 찍힌다). 네이티브 `recommended_update_prompted`와 같은
 * 결의 노출 이벤트다. `app_version`·`min_version`은 버전 문자열이지 식별자가 아니다. BY-586 이후
 * 바이너리의 **네이티브** 강제 업데이트 알림창은 웹뷰가 없어 어느 통로로도 못 잡는다.
 */
export function trackForceUpdatePrompted(input: {
  readonly appVersion: string;
  readonly minVersion: string;
}) {
  if (!initialized) return;
  track("force_update_prompted", {
    source: "web",
    app_version: input.appVersion,
    min_version: input.minVersion,
  });
}
