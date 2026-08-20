import { add, Identify, identify, init, setUserId, track } from "@amplitude/analytics-browser";
import type { Types } from "@amplitude/analytics-browser";
import { plugin as engagementPlugin } from "@amplitude/engagement-browser";
import { sessionReplayPlugin } from "@amplitude/plugin-session-replay-browser";

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
   * - 세션 화면(`/room/*`) 차단은 **코드 가드(`updateSurveyGate`)와 콘솔 페이지 타겟팅의
   *   이중 방어**다 — Session Replay의 카메라 차단이 전역 `blockSelector`와 요소 단위
   *   `amp-block` 태깅을 겹쳐 두는 것과 같은 패턴. 콘솔 설정 실수(오타·범위 누락)가
   *   프로덕션 세션 화면의 설문 오버레이로 직행하지 않게 한다.
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
  // 세션 웹뷰는 라우터 이펙트 전에 `/room/:id`로 **직접** 열린다 — 첫 라우트 변경까지
  // 기다리면 그 사이에 설문이 뜰 수 있으므로 최초 URL 기준으로 즉시 게이트를 적용한다.
  updateSurveyGate(window.location.pathname);
}

/**
 * 설문(Guides & Surveys)이 뜨면 안 되는 경로. `/room/*` 전체다 — 카메라 측정 중인 세션
 * 화면(S3)이 핵심이고, 결과(S4 `/room/:id/result`)까지 보수적으로 함께 막는다. 설문의
 * 표시 지점은 기록 탭(`/records`)이라는 결정(BY-411)이므로 세션 플로우에서 열어줄 이유가
 * 없다 — S4에 설문을 띄우는 결정이 생기면 이 패턴만 좁히면 된다.
 */
const SURVEY_BLOCKED_PATH = /^\/room(\/|$)/;

/**
 * 라우트 기반 설문 차단 게이트 — **콘솔 페이지 타겟팅과 이중 방어**다(위 플러그인 주석).
 *
 * `AnalyticsRouteTracker`가 라우트 변경마다 부르고, `initAmplitude`가 최초 URL로 한 번
 * 부른다. 차단 경로에 들어오면 SDK 전체를 `disable()`로 멈추고 벗어나면 되살린다 —
 * SDK가 경로 단위 차단 API를 제공하지 않아 전역 on/off가 유일한 코드 가드다.
 *
 * `window.engagement`는 로더가 만드는 전역이고 실제 SDK 로드 전에는 호출이 큐에 쌓였다가
 * 로드 후 재생된다 — 즉 SDK보다 먼저 불러도 유실되지 않는다. 미초기화(키 없음)면 전역
 * 자체가 없어 no-op이다.
 */
export function updateSurveyGate(pathname: string) {
  // 타입(`EngagementSDK`)은 항상 있다고 선언돼 있지만 전역을 만드는 것은 로더의 모듈 부수효과라
  // 번들 구성·테스트 환경에 따라 없을 수 있다 — 런타임 존재 확인을 지우지 말 것.
  const engagement = window.engagement as typeof window.engagement | undefined;
  if (!initialized || !engagement) return;
  if (SURVEY_BLOCKED_PATH.test(pathname)) {
    engagement.disable();
  } else {
    engagement.enable();
  }
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

/** 세션 종료 사유 — `features/study-session`의 `SessionEndReason`을 평평하게 편 값. */
export interface StudySessionEndedInput {
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

/** 스터디룸 진입 = 세션 시작. 세션 완주율(시작 대비 종료)의 분모다. */
export function trackStudySessionStarted() {
  if (!initialized) return;
  track("study_session_started");
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
    study_sec: input.studySec,
    focus_sec: input.focusSec,
    pause_sec: input.pauseSec,
    distraction_sec: input.distractionSec,
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
export function trackStudySessionSubmitted(ok: boolean, attempt: number) {
  if (!initialized) return;
  track("study_session_submitted", { ok, attempt });
}
