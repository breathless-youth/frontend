import { add, Identify, identify, init, setUserId, track } from "@amplitude/analytics-browser";
import type { Types } from "@amplitude/analytics-browser";
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
 */
const URL_EVENT_PROPERTIES = [
  "[Amplitude] Page Location",
  "[Amplitude] Previous Page Location",
  "[Amplitude] Page URL",
  "[Amplitude] Page Path",
  "[Amplitude] Element Href",
];

/**
 * 모든 전송 이벤트의 URL 속성을 `sanitizeUrl`로 정제하는 enrichment 플러그인.
 *
 * **autocapture와 SDK 기본 플러그인이 담는 URL은 우리 코드를 거치지 않는다.** 특히
 * `pageUrlEnrichment`는 `autocapture`에서 명시적으로 끄지 않는 한 켜져 있고(기본값 true),
 * 속성이 비어 있는 이벤트(예: `Start Session`)에 `location.href`를 **원본 그대로** 채워 넣는다.
 * 즉 이 플러그인이 없으면 세션 이벤트에 `?userId=N`이 실린다.
 *
 * user_id는 이제 `setUserId`라는 **제 자리**로 보내므로(2026-08-08 결정), URL 문자열에까지
 * 식별자가 섞이면 같은 화면이 사용자 수만큼 다른 값으로 쪼개져 차트에서 묶이지 않는다.
 * 정제는 그래서 계속 유지한다 — 개인정보 이유가 아니라 데이터 품질 이유로도 필요하다.
 */
function sanitizeUrlPlugin(): Types.EnrichmentPlugin {
  return {
    name: "focusmakers-sanitize-url",
    type: "enrichment",
    // 동기 처리지만 플러그인 계약이 Promise 반환을 요구한다.
    execute: async (event) => {
      // SDK 타입은 매출 이벤트까지 포함한 유니온이라 문자열 키로 못 읽는다. 우리가 만지는 것은
      // 아래 목록의 키뿐이고 값 타입도 확인하므로 레코드로 좁혀서 다룬다.
      const properties = event.event_properties as Record<string, unknown> | undefined;
      if (!properties) {
        return event;
      }
      for (const key of URL_EVENT_PROPERTIES) {
        const value = properties[key];
        if (typeof value === "string" && value !== "") {
          properties[key] = sanitizeUrl(value);
        }
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
  init(apiKey, {
    autocapture: {
      sessions: true,
      // 정제된 경로로 AnalyticsRouteTracker가 직접 보낸다 — 켜면 이중 집계.
      pageViews: false,
      attribution: true,
      formInteractions: true,
      fileDownloads: true,
      elementInteractions: true,
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
