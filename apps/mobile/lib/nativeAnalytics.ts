import type { NativeAnalyticsPropertyValue } from "@focusmakers/types";

/**
 * 네이티브에서만 관측되는 사용자 이벤트를 웹 Amplitude로 넘기는 통로(브리지 `track-event`).
 *
 * 분석 SDK는 웹에만 있다 — 앱은 Firebase Analytics도 링크하지 않고(`CLAUDE.md`), 네이티브
 * Amplitude SDK를 들이면 device_id가 웹뷰와 갈라져 신원 통합이 필요해진다. 대신 여기서 이벤트를
 * 모아 두고, 웹뷰 호스트(`components/RemoteWebViewHost.tsx`)가 `injectJavaScript`로 옮겨 담는다.
 * 웹은 같은 user_id·세션으로 전송한다(`apps/web/src/lib/amplitude.ts`의 `trackNativeShellEvent`).
 *
 * ## 전달 대상은 언제나 하나(sink)다
 *
 * 탭 4개의 웹뷰가 동시에 마운트돼 있어 아무 웹뷰에나 주입하면 한 터치가 N번 찍힌다. 호스트는
 * "포커스된 화면의 웹뷰이면서 웹이 `analytics-ready`를 보낸 문서"일 때만 sink로 붙고, 마지막에
 * 붙은 sink가 활성이다. sink가 하나도 없는 동안(권한 거부 화면이 탭을 덮음·로드 실패·재로드·
 * 렌더러 복구 중)은 큐에 보관했다가 다음 sink가 붙는 순간 순서대로 흘려보낸다 — 그래서 S2-3
 * 화면에서 일어난 일도 홈으로 돌아온 뒤 도착한다. 이벤트의 `atMs`는 이때를 위해 발생 시각을
 * 그대로 갖고 간다.
 *
 * 발신부(탭 바·권한 게이트·알림창 등)가 React 트리 어디에도 속하지 않는 순수 함수라
 * `tabBarVisibility`·`tabReset`처럼 모듈 스코프 통로를 쓴다.
 *
 * ## 카탈로그 규칙
 *
 * - 이름은 snake_case, 과거형(`_pressed`·`_resolved`·`_opened`). 웹 이벤트(`study_session_*`)와
 *   같은 규칙이다. 웹은 이름을 해석하지 않고 형식만 검증하므로 여기가 유일한 정의처다.
 * - 속성은 원시값(enum·boolean·수)만. 식별자·자유 문자열·초대코드·서버 오류 문구는 싣지 않는다
 *   (`apps/web/CLAUDE.md` 사용 분석 규칙과 동일).
 * - 웹이 스스로 알 수 있는 일(공유 시트 요청, 라우팅, 앱 포그라운드)은 여기에 넣지 않는다 —
 *   웹이 직접 찍는 편이 정확하고, 여기 넣으면 이중 집계가 된다.
 */

/** `components/TabBar.tsx`의 `TabId`와 같은 값 집합 — 탭 바가 좁혀서 보낸다. */
export type NativeTab = "home" | "social" | "record" | "settings";

export type NativeAnalyticsProperties = Record<string, NativeAnalyticsPropertyValue>;

/**
 * 네이티브 이벤트 카탈로그 — 키가 이벤트명, 값이 속성 타입(속성이 없으면 `undefined`).
 * `Record` 제약이 모든 속성값을 원시값으로 강제한다.
 */
export interface NativeAnalyticsEventMap extends Record<
  string,
  NativeAnalyticsProperties | undefined
> {
  /** 하단 탭 터치(`components/TabBar.tsx`). 활성 탭은 비활성화돼 있어 같은 탭 재터치는 찍히지 않는다. */
  tab_pressed: { tab: NativeTab; from_tab: NativeTab };
  /**
   * 카메라 권한 게이트의 분기 결과(`lib/cameraPermissionGate.ts`). `already_denied`는 OS 다이얼로그
   * 없이 바로 S2-3으로 간 경우, `error`는 권한 조회·요청 자체가 실패해 fail-closed로 막힌 경우다.
   * `prompted`는 이번에 OS 다이얼로그(S2-2)가 실제로 떴는지. `room_type`은 웹 `study_session_*`의
   * 같은 속성과 값을 맞춘다(single=집중 시작, social=소셜룸 입장 게이트).
   */
  camera_permission_gate_resolved: {
    result: "granted" | "denied" | "already_denied" | "error";
    prompted: boolean;
    room_type: "single" | "social";
  };
  /** 권한 거부 안내(S2-3, `app/permission-denied.tsx`) 노출. */
  permission_denied_viewed: undefined;
  /** S2-3 "설정 열기" 터치. */
  permission_denied_settings_opened: undefined;
  /** S2-3을 떠남 — "홈으로 돌아가기" 터치, 또는 설정에서 허용하고 돌아와 자동 복귀. */
  permission_denied_left: { reason: "back_home" | "permission_granted" };
  /** 권장 업데이트 알림창(BY-608, `lib/recommendedUpdateAlert.ts`) 노출. 값은 Remote Config `latest_version`. */
  recommended_update_prompted: { latest_version: string };
  /** 권장 업데이트 알림창 응답. `dismissed`는 Android 뒤로가기·바깥 터치(iOS에는 없는 경로). */
  recommended_update_answered: { action: "update" | "later" | "dismissed"; latest_version: string };
  /** 알림 탭으로 앱 진입(`lib/pushBootstrap.ts`). `route`는 쿼리를 뗀 앱 경로(초대코드 등 값은 싣지 않는다). */
  push_notification_opened: { route: string };
  /** 초대 딥링크 라우트(`app/social/join.tsx`) 진입 — 유니버설 링크·App Links·스킴·Install Referrer·알림 전부 여기로 합류한다. */
  invite_deep_link_opened: { has_code: boolean };
  /**
   * 원격 웹뷰 로드 실패 폴백 노출(`components/RemoteWebViewHost.tsx`). `config`는 베이스 URL 미설정
   * (개발 빌드), `error`는 네트워크·SSL 등 로드 실패, `http`는 최상위 문서의 HTTP 오류 응답.
   * 이 이벤트는 정의상 그 웹뷰로는 못 나간다 — 다른 탭이나 재시도 성공 뒤에 큐에서 흘러간다.
   */
  webview_load_failed: { path: string; reason: "config" | "error" | "http" };
  /** 실패 폴백의 "다시 시도" 터치. */
  webview_retry_pressed: { path: string };
}

export type NativeAnalyticsEventName = keyof NativeAnalyticsEventMap & string;

/** 큐와 sink를 오가는 이벤트 한 건 — 브리지 `track-event` 메시지에서 `type`만 뺀 모양이다. */
export interface NativeAnalyticsEvent {
  name: NativeAnalyticsEventName;
  properties?: NativeAnalyticsProperties;
  /** 발생 시각(`Date.now()`). 큐를 거쳐 늦게 전달돼도 웹이 이 값을 Amplitude `time`으로 쓴다. */
  atMs: number;
}

export type NativeAnalyticsSink = (event: NativeAnalyticsEvent) => void;

/** 속성이 없는 이벤트는 두 번째 인자를 받지 않는다 — 카탈로그에서 파생한다. */
type EventArgs<N extends NativeAnalyticsEventName> = NativeAnalyticsEventMap[N] extends undefined
  ? []
  : [properties: NativeAnalyticsEventMap[N]];

/**
 * sink 없이 쌓아 둘 최대 건수. 웹뷰가 오래 안 뜨는 경우(오프라인 로드 실패 반복)의 메모리 상한이다 —
 * 넘치면 오래된 것부터 버린다. 정상 경로에서는 몇 건을 넘지 않는다.
 */
const MAX_PENDING = 100;

const pending: NativeAnalyticsEvent[] = [];
/** 붙은 순서대로. 마지막이 활성 sink다 — 먼저 붙은 것이 아직 남아 있으면 활성이 빠질 때 그쪽으로 돌아간다. */
const sinks: NativeAnalyticsSink[] = [];

function activeSink(): NativeAnalyticsSink | null {
  return sinks[sinks.length - 1] ?? null;
}

/**
 * 이벤트를 기록한다. 활성 sink가 있으면 즉시 전달하고, 없으면 큐에 보관한다.
 *
 * 호출부는 결과를 기다리거나 실패를 처리할 것이 없다 — 분석 유실이 화면 동작을 막으면 안 된다.
 */
export function trackNativeEvent<N extends NativeAnalyticsEventName>(
  name: N,
  ...args: EventArgs<N>
): void {
  // 조건부 튜플이라 인덱스 타입이 좁혀지지 않는다 — 카탈로그 제약(원시값 Record)이 모양을 이미 보장한다.
  const properties = (args as unknown as [NativeAnalyticsProperties?])[0];
  const event: NativeAnalyticsEvent = {
    name,
    ...(properties !== undefined ? { properties } : {}),
    atMs: Date.now(),
  };
  const sink = activeSink();
  if (sink !== null) {
    sink(event);
    return;
  }
  pending.push(event);
  if (pending.length > MAX_PENDING) {
    pending.shift();
  }
}

/**
 * sink를 붙인다 — 붙는 즉시 큐에 쌓인 이벤트를 순서대로 넘겨받고, 이후 이벤트는 바로 받는다.
 * 반환값을 부르면 떼어진다. 나중에 붙은 sink가 활성이므로, 붙이는 쪽은 "지금 사용자에게 보이는
 * 준비된 웹뷰"일 때만 붙여야 한다(`RemoteWebViewHost`의 focused·analyticsReady 조건).
 */
export function attachNativeAnalyticsSink(sink: NativeAnalyticsSink): () => void {
  sinks.push(sink);
  for (const event of pending.splice(0)) {
    sink(event);
  }
  return () => {
    const index = sinks.lastIndexOf(sink);
    if (index !== -1) {
      sinks.splice(index, 1);
    }
  };
}

/** 테스트 전용: 큐와 sink를 비운다. 프로덕션 코드에서는 호출하지 않는다. */
export function __resetNativeAnalyticsForTests(): void {
  pending.length = 0;
  sinks.length = 0;
}
