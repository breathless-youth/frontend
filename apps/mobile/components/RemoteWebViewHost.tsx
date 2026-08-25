import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from "react-native-webview";

import type { ToNativeMessage } from "@focusmakers/types";

import { PrimaryCtaButton } from "./PrimaryCtaButton";
import type { BridgeReply } from "../lib/nativeBridgeHandler";
import { getWebBaseUrl } from "../lib/webBaseUrl";
import { injectMessageScript, parseToNativeMessage } from "../lib/webBridge";

/**
 * 원격 웹(`apps/web`) 화면을 로드하는 공용 WebView 호스트(전 화면 원격 웹뷰 셸, BY-333).
 *
 * `apps/mobile/app/room/[id].tsx`가 직접 띄우던 WebView를 재사용 가능한 형태로 승격했다 —
 * 세션 카메라에 필요한 `allowsInlineMediaPlayback`·`mediaPlaybackRequiresUserAction={false}`·
 * `mediaCapturePermissionGrantType="grant"`는 그대로 유지한다.
 *
 * 베이스 URL이 설정되지 않았거나(`lib/webBaseUrl.ts`가 던짐) 로드가 실패하면 **같은 실패
 * 폴백 화면**으로 떨어진다 — 빈 URL로 웹뷰를 띄워 흰 화면이 뜨는 것보다, 명확한 실패가 낫다.
 */

// `react-native-webview`의 루트 진입점(index.d.ts)은 `ShouldStartLoadRequest`를 재수출하지
// 않는다(`WebViewMessageEvent`·`WebViewNavigation`만 재수출) — 그래서 라이브러리 내부 경로
// (`lib/WebViewTypes`)를 직접 import하는 대신, 공개 타입 `WebViewNavigation`에 문서화된
// `isTopFrame` 필드를 더해 여기서 구성한다. iOS(WKWebView)만 이 필드를 채운다 — Android
// (`RNCWebViewClient.java`)는 아예 넣지 않으므로 `undefined`로 들어올 수 있다(옵셔널로
// 선언하는 이유, 아래 핸들러 참고).
type ShouldStartLoadRequest = WebViewNavigation & { isTopFrame?: boolean };

const LOAD_FAILURE_TITLE = "화면을 불러오지 못했어요";
const LOAD_FAILURE_BODY = "네트워크 상태를 확인하고 다시 시도해 주세요.";

/** 쿼리 파라미터를 `?a=1&b=2` 형태로 인코딩한다. 값이 없으면 빈 문자열(쿼리 없이 연다). */
function buildQueryString(query: Record<string, string | number> | undefined): string {
  const entries = query ? Object.entries(query) : [];
  if (entries.length === 0) {
    return "";
  }
  return `?${entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&")}`;
}

/** `baseUrl` + `path` + `query` → WebView에 넘길 완성 URL. */
export function buildRemoteWebViewUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, string | number>,
): string {
  return `${baseUrl.replace(/\/$/, "")}${path}${buildQueryString(query)}`;
}

/**
 * 스킴+호스트만 떼어낸다(예: `https://web.example.com`). 베이스 URL의 오리진 계산과
 * `onShouldStartLoadWithRequest`의 최상위 프레임 오리진 비교 양쪽에 쓴다.
 * 매치 실패(URL 형태가 아닌 값) 시 원본을 그대로 돌려준다 — 빈 문자열로 비교가 항상
 * 실패하는 것보다, 설정 실수를 그대로 드러내는 편이 디버깅하기 쉽다.
 */
export function originOf(url: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\/[^/]+/i.exec(url)?.[0] ?? url;
}

export type RemoteWebViewHostProps = {
  /** `apps/web` 라우트 경로. 예: `/home`, `/room/1`. */
  path: string;
  /** 쿼리 파라미터. 생략하면 쿼리 없이 연다. */
  query?: Record<string, string | number>;
  /**
   * 웹이 보낸 브리지 메시지(session-ready·start-session·navigate-home·open-settings·
   * submit-session)를 `lib/webBridge.ts`로 파싱해 넘긴다. 모르는 메시지는 넘어오지 않는다
   * (파싱 단계에서 걸러짐).
   *
   * 두 번째 인자 `reply`로 웹에 응답을 되돌려 보낸다(`submit-session` → `submit-result`).
   * 통로가 이 컴포넌트 안(`webViewRef.injectJavaScript`)에 있어 핸들러가 직접 가질 수 없다.
   */
  onBridgeMessage?: (message: ToNativeMessage, reply: BridgeReply) => void;
  /** WebView·실패 화면에 강제할 배경색(세션 화면처럼 테마 무관 고정 배경이 필요할 때만 넘긴다). */
  backgroundColor?: string;
  /**
   * 로드가 끝나면 호출된다(성공·실패 둘 다). 스플래시를 언제 걷을지 판단하는 용도이고,
   * `ok`는 실패 폴백 화면이 떠 있는지를 알려준다 — 세션 화면이 안드로이드 하드웨어
   * 뒤로가기를 막을지 결정하는 데 쓴다(`RemoteScreen` 참고).
   */
  onLoadEnd?: (ok: boolean) => void;
  /**
   * 사망 복구(재로드·재마운트)에 들어가면 호출된다. 스플래시를 **다시 덮기** 위한 신호다 —
   * 렌더러가 죽은 웹뷰는 빈 화면·잔상만 남기므로 복구가 끝날 때(onLoadEnd)까지 가린다(BY-436).
   *
   * ⚠️ WebView의 `onLoadStart` 이벤트에 걸지 않는다. Android는
   * `doUpdateVisitedHistory`(RNCWebViewClient.java)가 SPA `pushState`에도 onLoadStart를
   * 발화시키는데 짝이 되는 onLoadEnd는 없어서, 탭 안 웹 라우팅 한 번에 스플래시가 영영
   * 걷히지 않았다(실기기: 소셜 홈 → 초대코드 입력 이동에서 스켈레톤 고착). 복구 진입은
   * 이 컴포넌트가 정확히 아는 사건이라 `enterRecovery`가 직접 알린다.
   */
  onRecoveryStart?: (() => void) | undefined;
  testID?: string;
};

/**
 * 생존 확인(ping) 타임아웃과 시도 횟수(BY-436). 포그라운드 복귀 직후 JS 스레드가 잠깐
 * 바쁠 수 있어 1회 재시도한다 — 오탐(살아 있는 웹뷰 재로드)은 진행 중 측정을 날리므로
 * 미탐(흰 화면 1~2초 연장)보다 훨씬 비싸다.
 */
const PING_TIMEOUT_MS = 700;
const PING_MAX_ATTEMPTS = 2;

/**
 * Android 렌더러 사망의 전역 복구 채널(BY-436).
 *
 * Android WebView는 렌더러 프로세스 하나를 앱의 모든 WebView(탭 4개)가 공유하고, **죽은
 * 렌더러는 거기 붙어 있던 WebView를 전부 파괴해야 대체된다**(플랫폼 계약). 사망을 감지한
 * 호스트 하나만 재마운트하면 이웃 웹뷰들이 죽은 렌더러를 계속 잡고 있어 새 WebView가 그
 * 죽은 렌더러에 붙고, 로드가 영영 시작되지 않는다 — 실기기에서 복구 스플래시(소셜
 * 스켈레톤)가 걷히지 않던 원인. 그래서 사망 판정·통보는 마운트된 모든 호스트의 재마운트로
 * 넓힌다. iOS는 WKWebView 프로세스가 웹뷰별 독립이라 이 채널을 쓰지 않는다(개별 reload).
 */
const recoveryListeners = new Set<() => void>();

export function requestGlobalWebViewRecovery(): void {
  for (const listener of [...recoveryListeners]) {
    listener();
  }
}

export function RemoteWebViewHost({
  path,
  query,
  onBridgeMessage,
  backgroundColor,
  onLoadEnd,
  onRecoveryStart,
  testID,
}: RemoteWebViewHostProps) {
  const webViewRef = useRef<WebView>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  /**
   * iOS 가장자리 스와이프(back-forward) 제스처 허용 여부 — 웹이 `set-back-gesture`로 끄고 켠다
   * (온보딩 가이드가 우발 이탈을 막으려고 끈다, 계약 주석 참고). 공용 `nativeBridgeHandler`가
   * 아니라 여기서 소비하는 이유: 제어 대상(`allowsBackForwardNavigationGestures`)이 이 컴포넌트의
   * WebView prop이라, 핸들러로 보내면 그 상태를 다시 여기로 배선하는 우회로만 생긴다.
   */
  const [backGestureEnabled, setBackGestureEnabled] = useState(true);
  // 재시도 시 베이스 URL 설정도 다시 읽는다 — retry 한 번으로 "설정 누락"과 "일시적 로드
  // 실패" 두 경우 모두를 같은 버튼으로 재시도할 수 있게 한다.
  const [retryKey, setRetryKey] = useState(0);

  /**
   * 웹이 `report-screen`으로 보고한 마지막 화면(BY-436). 렌더러 사망으로 웹뷰를 다시 띄울 때
   * 돌아갈 곳이다 — Android 재마운트는 초기 `source`가 탭 루트 경로라, 이 값이 없으면
   * 사용자가 있던 화면(소셜룸 등)을 잃는다. ref인 이유: 살아 있는 동안 `source`가 바뀌면
   * 그 자체가 내비게이션이 되므로, 재마운트(retryKey) 시점에만 읽는다.
   */
  const restoreRef = useRef<{ path: string; query?: Record<string, string> } | null>(null);
  /** 생존 확인(ping) 상태 — 대기 중인 id·타이머·시도 횟수. */
  const pingRef = useRef<{
    id: number;
    timer: ReturnType<typeof setTimeout>;
    attempts: number;
  } | null>(null);
  const pingSeqRef = useRef(0);
  /** 첫 로드 완료 여부 — 그 전에는 웹 브리지가 없어 ping이 항상 타임아웃(오탐)이 된다. */
  const hasLoadedRef = useRef(false);
  const loadFailedRef = useRef(false);
  /** 사망 복구(재마운트·재로드) 진행 중 — 전역 복구 요청이 겹쳐도 재마운트를 반복하지 않는다. */
  const recoveringRef = useRef(false);

  const target = useMemo(() => {
    try {
      const baseUrl = getWebBaseUrl();
      // 재마운트·재시도에서만 복원 경로가 반영된다 — 위 restoreRef 주석 참고.
      const restore = restoreRef.current;
      return {
        uri: buildRemoteWebViewUrl(
          baseUrl,
          restore?.path ?? path,
          restore?.query ? { ...(query ?? {}), ...restore.query } : query,
        ),
        origin: originOf(baseUrl),
      };
    } catch (error: unknown) {
      if (__DEV__) {
        console.warn("[RemoteWebViewHost] 웹 베이스 URL 설정 안 됨", error);
      }
      return null;
    }
    // retryKey는 값을 쓰지 않지만 재시도 신호로 재계산을 트리거하는 용도다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, query, retryKey]);

  const retry = useCallback(() => {
    setLoadFailed(false);
    loadFailedRef.current = false;
    setRetryKey((key) => key + 1);
    webViewRef.current?.reload();
  }, []);

  /**
   * OS가 메모리 회수로 웹 콘텐츠 프로세스를 죽였을 때의 자동 복구(BY-374).
   *
   * 이 통보를 받지 않으면 웹뷰는 **빈 흰 화면**으로 남는다 — 이미 로드가 끝난 페이지라
   * `onError`(로드 실패 폴백)도, 첫 로드용 스플래시도 불리지 않아 앱 재시작 말고는 복구
   * 수단이 없다(2026-08-14 시뮬레이터 WebContent kill로 재현: 세 탭 모두 흰 화면 영구 방치).
   * 세션 화면(`/room/:id`)도 같은 정책으로 재로드한다 — 죽는 순간 측정 상태(웹 JS 메모리)는
   * 어차피 소실되므로, 남은 결정은 "어디로 보낼 것인가"뿐이고 공부 중이던 사용자를 세션
   * 화면에 되돌리는 쪽을 택했다(측정 데이터 생존은 BY-291 체크포인트 몫).
   *
   * iOS는 `reload()`가 새 콘텐츠 프로세스를 띄우므로 그걸로 충분하다. Android는 렌더러가
   * 죽은 WebView 인스턴스를 재사용할 수 없어(플랫폼 제약) reload 대신 `key`를 바꿔 웹뷰를
   * 재마운트한다 — `retryKey`가 이미 그 역할의 신호라 재사용한다.
   */
  // ponytail: 반복 크래시 시 재로드 루프 가드 없음 — 페이지 자체가 프로세스를 죽이는 경우가
  // 생기면(현재 탭 페이지들은 경량이라 관측된 바 없음) 시도 횟수 제한을 추가할 것.
  //
  // 통보를 받는 즉시 `onLoadStart`로 스플래시부터 되돌린다(BY-436) — 재로드의 자체
  // onLoadStart를 기다리면 그 사이 죽은 웹뷰의 흰 화면·잔상이 그대로 노출된다(실기기 확인).
  const clearPing = useCallback(() => {
    if (pingRef.current !== null) {
      clearTimeout(pingRef.current.timer);
      pingRef.current = null;
    }
  }, []);

  /**
   * 사망 복구 진입 공통 처리 — 스플래시를 되돌리고 생존 확인 상태를 초기화한다.
   * `clearPing`이 없으면 진행 중이던 ping 타이머가 새 문서 로드(700ms 이상 걸린다) 중에
   * 만료돼 건강한 새 문서를 또 재로드하는 루프가 되고, `hasLoadedRef`를 되돌리지 않으면
   * 로드 완료 전의 포그라운드 복귀가 브리지 없는 문서에 ping을 쏴 같은 오판을 만든다.
   */
  const enterRecovery = useCallback(() => {
    clearPing();
    hasLoadedRef.current = false;
    recoveringRef.current = true;
    onRecoveryStart?.();
  }, [clearPing, onRecoveryStart]);

  const handleContentProcessDidTerminate = useCallback(() => {
    enterRecovery();
    webViewRef.current?.reload();
  }, [enterRecovery]);
  // 렌더러 사망은 이 웹뷰만의 일이 아니다 — 전역 복구로 넓힌다(상단 recoveryListeners 주석).
  const handleRenderProcessGone = useCallback(() => {
    requestGlobalWebViewRecovery();
  }, []);

  // 전역 복구 채널 구독 — 어느 호스트가 렌더러 사망을 감지하든 함께 재마운트한다.
  useEffect(() => {
    const listener = () => {
      if (recoveringRef.current) {
        return;
      }
      enterRecovery();
      setRetryKey((key) => key + 1);
    };
    recoveryListeners.add(listener);
    return () => {
      recoveryListeners.delete(listener);
    };
  }, [enterRecovery]);

  /**
   * 생존 확인 실패 — 렌더러가 죽었다고 보고 사후 통보와 같은 복구를 앞당겨 실행한다.
   * iOS는 `reload()`(현재 URL·history state 보존 — 소셜룸이 router state로 재입장한다),
   * Android는 죽은 렌더러의 WebView를 재사용할 수 없어 재마운트한다(위 BY-374 주석과
   * 같은 플랫폼 제약 — 복원 경로는 `restoreRef`가 잇는다).
   */
  const declareDead = useCallback(() => {
    if (Platform.OS === "android") {
      // 자기 재마운트도 전역 채널의 리스너가 수행한다 — 렌더러는 공유라 혼자 살아날 수 없다.
      requestGlobalWebViewRecovery();
    } else {
      enterRecovery();
      webViewRef.current?.reload();
    }
  }, [enterRecovery]);

  const sendPing = useCallback(
    (attempts: number) => {
      pingSeqRef.current += 1;
      const id = pingSeqRef.current;
      webViewRef.current?.injectJavaScript(
        injectMessageScript({ type: "ping", id, atMs: Date.now() }),
      );
      const timer = setTimeout(() => {
        if (attempts + 1 >= PING_MAX_ATTEMPTS) {
          declareDead();
        } else {
          sendPing(attempts + 1);
        }
      }, PING_TIMEOUT_MS);
      pingRef.current = { id, timer, attempts };
    },
    [declareDead],
  );

  /**
   * 포그라운드 복귀마다 웹뷰 생존을 확인한다(BY-436). 사후 통보(위 두 핸들러)는 복귀보다
   * 한참 늦게 오거나(Android) 아예 오지 않을 수 있어(iOS 장기 서스펜드), 그동안 순백
   * 화면이 노출됐다 — 통보를 기다리지 않고 직접 물어본다. 웹 쪽 응답자는
   * `apps/web/src/lib/nativeLiveness.ts`.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        // 복귀 전 타임아웃이 사망 오판이 되지 않게 접는다.
        clearPing();
        return;
      }
      if (!hasLoadedRef.current || loadFailedRef.current) {
        return;
      }
      clearPing();
      sendPing(0);
    });
    return () => {
      subscription.remove();
      clearPing();
    };
  }, [clearPing, sendPing]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseToNativeMessage(event.nativeEvent.data);
      if (message === null) {
        return;
      }
      // 위 backGestureEnabled 주석의 이유로 이 메시지만 여기서 소비하고 핸들러로 넘기지 않는다.
      if (message.type === "set-back-gesture") {
        setBackGestureEnabled(message.enabled);
        return;
      }
      // 생존 확인 응답 — 대기 중인 ping과 id가 맞으면 산 것이다. 화면에 넘길 내용이 없다.
      if (message.type === "pong") {
        if (pingRef.current !== null && pingRef.current.id === message.id) {
          clearPing();
        }
        return;
      }
      if (message.type === "report-screen") {
        restoreRef.current = {
          path: message.path,
          ...(message.restoreQuery ? { query: message.restoreQuery } : {}),
        };
        // 소비하지 않고 위로도 넘긴다 — 복구 스플래시 톤(dark)은 RemoteScreen이 쓴다.
      }
      onBridgeMessage?.(message, (reply) => {
        webViewRef.current?.injectJavaScript(injectMessageScript(reply));
      });
    },
    [clearPing, onBridgeMessage],
  );

  const targetOrigin = target?.origin;
  const handleShouldStartLoadWithRequest = useCallback(
    (request: ShouldStartLoadRequest) => {
      // `=== false`로 명시 비교한다(`!request.isTopFrame`이 아니다) — `isTopFrame`은
      // iOS만 채우는 필드라 Android에서는 `undefined`로 들어온다. `!undefined`도 `true`이므로
      // `!request.isTopFrame`으로 쓰면 Android의 모든 최상위 요청이 하위 프레임으로 오판돼
      // 오리진 검사를 통째로 건너뛰고 전부 허용된다(BY-333 리뷰 — Critical 보안 구멍,
      // `mediaCapturePermissionGrantType="grant"`와 겹치면 임의 오리진이 카메라를 자동 승인
      // 받는다). 필드가 없을 때는 "하위 프레임 아님"으로 안전하게 닫히도록 `=== false`만
      // 하위 프레임으로 취급한다.
      if (request.isTopFrame === false) {
        // 하위 프레임(예: /contact가 임베드하는 구글 폼 iframe)은 오리진 검사 없이 항상
        // 허용한다. react-native-webview는 iframe 로드도 이 콜백에 태우는데,
        // `originWhitelist`만으로는 최상위/하위 프레임을 구분하지 못해 화이트리스트에 없는
        // iframe 오리진(docs.google.com)이 "외부 이동"으로 오판돼 시스템 브라우저로 튕겨나갔다
        // (2026-07-31 실기기 확인 — 설정→문의하기 진입 시 크롬이 열림).
        return true;
      }
      // 최상위 프레임이 우리 오리진이 아닌 곳으로 이동하려는 경우: 지금은 웹 안에서 외부로
      // 나가는 최상위 이동이 설계상 없다(2026-07-31 검토) — 그래서 열어주기(Linking.openURL)
      // 대신 보수적으로 로드를 막는다. 외부로 내보내야 하는 최상위 이동이 생기면 그때
      // Linking.openURL 분기를 추가한다.
      return originOf(request.url) === targetOrigin;
    },
    [targetOrigin],
  );

  // 인라인 화살표로 넘기면 렌더마다 새 함수가 되어 WebView의 prop이 매번 바뀐다.
  const handleLoadEnd = useCallback(() => {
    // 새 문서는 제스처를 끈 적이 없다 — 렌더러 재생성·reload 뒤에도 이전 문서의 잠금이
    // 남지 않게 로드마다 기본값으로 되돌린다. 끈 쪽이 살아 있으면 다시 끄는 책임도 그쪽이다.
    setBackGestureEnabled(true);
    hasLoadedRef.current = true;
    recoveringRef.current = false;
    onLoadEnd?.(true);
  }, [onLoadEnd]);

  const showFailureFallback = target === null || loadFailed;

  // 로드 실패(설정 누락 포함)로 폴백 화면을 보여줄 때도 onLoadEnd를 호출한다 — RemoteScreen의
  // 스플래시는 onLoadEnd가 있어야만 걷히므로, 실패 시에도 알려주지 않으면 스플래시가 실패
  // 화면(그리고 "다시 시도" 버튼)을 영영 가려 조작 불가 상태가 된다(BY-333 실기기 확인).
  useEffect(() => {
    if (showFailureFallback) {
      onLoadEnd?.(false);
    }
  }, [showFailureFallback, onLoadEnd]);

  if (showFailureFallback) {
    return (
      <View
        testID={testID}
        className="bg-bg-base dark:bg-bg-base-dark flex-1 items-center justify-center px-6"
        style={backgroundColor ? { backgroundColor } : undefined}
      >
        <Text
          accessibilityRole="header"
          className="text-text-primary dark:text-text-primary-dark text-center text-[15px] font-bold leading-[22px]"
        >
          {LOAD_FAILURE_TITLE}
        </Text>
        <Text className="text-text-secondary dark:text-text-secondary-dark mt-[10px] text-center text-[13px] leading-[19px]">
          {LOAD_FAILURE_BODY}
        </Text>
        {/* 사유는 개발 빌드에서만 노출한다 — 사용자에게 설정 키 이름 같은 내부 정보를 보이지 않는다. */}
        {__DEV__ && target === null && (
          <Text className="text-text-tertiary mt-[6px] text-center text-[11px]">
            (dev) WEB_BASE_URL 미설정 — apps/mobile/.env.local 확인
          </Text>
        )}
        <View className="mt-[20px] w-full max-w-[280px]">
          <PrimaryCtaButton label="다시 시도" onPress={retry} />
        </View>
      </View>
    );
  }

  return (
    <WebView
      // 재시도·Android 렌더러 사망 시 웹뷰를 통째로 새로 만든다(위 handleRenderProcessGone 주석).
      key={retryKey}
      ref={webViewRef}
      testID={testID}
      source={{ uri: target.uri }}
      style={backgroundColor ? { flex: 1, backgroundColor } : { flex: 1 }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      // 오리진 제한은 `originWhitelist`가 아니라 `onShouldStartLoadWithRequest`(위)로 건다.
      //
      // `react-native-webview`는 `originWhitelist`를 통과하지 못한 요청을 우리 콜백에 넘기지도
      // 않고 바로 시스템 브라우저로 열어버린다(내부 `createOnShouldStartLoadWithRequest`가
      // whitelist 미통과 시 `Linking.openURL`을 먼저 호출). `originWhitelist`를 우리 오리진
      // 하나로 좁혀 두면 iframe(하위 프레임) 요청도 이 필터를 통과 못 해 우리 로직이 실행되기도
      // 전에 크롬으로 튕겨나간다 — `/contact`의 구글 폼 iframe이 이렇게 새어 나갔다
      // (2026-07-31 Expo Go 실기기 확인). 그래서 `originWhitelist`는 라이브러리 기본값
      // (`http://*`·`https://*` — 즉 스킴만 http(s)로 제한)으로 두고, 실제 "우리 오리진인가"
      // 판단은 프레임 종류를 구분할 수 있는 `onShouldStartLoadWithRequest` 쪽에 맡긴다.
      onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
      // 오버스크롤(안드로이드 stretch·iOS bounce) 구간에는 웹 CSS가 닿지 않고 **웹뷰 자체의
      // 배경**이 드러난다 — 다크 모드에서 위아래로 밀 때 화면 밖에 흰 띠가 보였다
      // (2026-08-01 실기기 확인. 웹 쪽 `html` 배경을 채워도 이 영역은 해결되지 않는다).
      // 테마를 네이티브가 알 수 없으므로 색을 맞추는 대신 오버스크롤 자체를 없앤다 —
      // 스크롤 한계는 웹 페이지가 그대로 갖고, 고무줄 효과만 사라진다.
      overScrollMode="never"
      bounces={false}
      // iOS 가장자리 스와이프로 **웹뷰 자체의 히스토리**를 되돌린다(WKWebView
      // `allowsBackForwardNavigationGestures` — 기본값이 false라 켜주지 않으면 동작하지 않는다).
      //
      // 이게 없으면 설정→문의하기처럼 웹 안에서만 일어난 이동을 스와이프로 되돌릴 수 없다.
      // 네이티브 스택은 탭 루트라 pop할 화면이 없고, 웹 히스토리는 제스처가 꺼져 있어
      // 양쪽 다 반응하지 않았다(2026-08-01 iPhone 13 mini 확인).
      // 세션 화면은 웹 히스토리가 비어 있어(새로 로드된 라우트) 이 제스처로 빠져나가지 않는다.
      //
      // 예외: 온보딩 가이드(G1~G5)는 이 제스처가 가이드 통째 이탈이 되어 웹이
      // `set-back-gesture`로 잠시 끈다(위 backGestureEnabled 주석·계약 주석 참고).
      allowsBackForwardNavigationGestures={backGestureEnabled}
      onMessage={handleMessage}
      // 여기서의 `true`는 "폴백 화면이 아니다"라는 뜻이다 — `onError`/`onHttpError`가 뒤이어
      // 불리면 위 effect가 `false`로 정정한다(둘 다 로드 종료 후에 온다).
      onLoadEnd={handleLoadEnd}
      onError={() => {
        setLoadFailed(true);
        loadFailedRef.current = true;
      }}
      onHttpError={() => {
        setLoadFailed(true);
        loadFailedRef.current = true;
      }}
      onContentProcessDidTerminate={handleContentProcessDidTerminate}
      onRenderProcessGone={handleRenderProcessGone}
    />
  );
}
