import { useCallback, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import type { ToNativeMessage } from "@focuson/types";

import { PrimaryCtaButton } from "./PrimaryCtaButton";
import { getWebBaseUrl } from "../lib/webBaseUrl";
import { parseToNativeMessage } from "../lib/webBridge";

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
 * `originWhitelist`에 쓸 스킴+호스트만 떼어낸다(예: `https://web.example.com`).
 * 매치 실패(URL 형태가 아닌 값) 시 원본을 그대로 돌려준다 — 화이트리스트가 비어 최상위
 * 네비게이션이 전부 막히는 것보다, 설정 실수를 그대로 드러내는 편이 디버깅하기 쉽다.
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
   * 웹이 보낸 브리지 메시지(session-ready·start-session·exit-session·open-settings)를
   * `lib/webBridge.ts`로 파싱해 넘긴다. 모르는 메시지는 넘어오지 않는다(파싱 단계에서 걸러짐).
   */
  onBridgeMessage?: (message: ToNativeMessage) => void;
  /** WebView·실패 화면에 강제할 배경색(세션 화면처럼 테마 무관 고정 배경이 필요할 때만 넘긴다). */
  backgroundColor?: string;
  /**
   * 로드가 끝나면 호출된다(성공·실패 둘 다 — `react-native-webview`의 `onLoadEnd` 그대로).
   * 초기 로딩을 가리는 스플래시를 언제 걷을지 판단하는 용도(`RemoteScreen` 참고).
   */
  onLoadEnd?: () => void;
  testID?: string;
};

export function RemoteWebViewHost({
  path,
  query,
  onBridgeMessage,
  backgroundColor,
  onLoadEnd,
  testID,
}: RemoteWebViewHostProps) {
  const webViewRef = useRef<WebView>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // 재시도 시 베이스 URL 설정도 다시 읽는다 — retry 한 번으로 "설정 누락"과 "일시적 로드
  // 실패" 두 경우 모두를 같은 버튼으로 재시도할 수 있게 한다.
  const [retryKey, setRetryKey] = useState(0);

  const target = useMemo(() => {
    try {
      const baseUrl = getWebBaseUrl();
      return { uri: buildRemoteWebViewUrl(baseUrl, path, query), origin: originOf(baseUrl) };
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
    setRetryKey((key) => key + 1);
    webViewRef.current?.reload();
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseToNativeMessage(event.nativeEvent.data);
      if (message !== null) {
        onBridgeMessage?.(message);
      }
    },
    [onBridgeMessage],
  );

  if (target === null || loadFailed) {
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
            (dev) app.json extra.webBaseUrl 미설정
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
      ref={webViewRef}
      testID={testID}
      source={{ uri: target.uri }}
      style={backgroundColor ? { flex: 1, backgroundColor } : { flex: 1 }}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      mediaCapturePermissionGrantType="grant"
      // 최상위 네비게이션만 설정된 베이스 URL의 오리진으로 제한한다(로컬 서버 화이트리스트는
      // 다음 단계에서 로컬 서빙 코드와 함께 사라진다).
      originWhitelist={[`${target.origin}/*`]}
      onMessage={handleMessage}
      onLoadEnd={onLoadEnd}
      onError={() => setLoadFailed(true)}
      onHttpError={() => setLoadFailed(true)}
    />
  );
}
