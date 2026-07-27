import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

import { PrimaryCtaButton } from "../components/PrimaryCtaButton";
import { ScreenBackHeader } from "../components/ScreenBackHeader";
import { CONTACT_FORM_URL } from "../lib/settingsInfo";

/**
 * 문의하기 — 설정(S6) `지원` 섹션에서 진입한다.
 *
 * **앱 밖으로 내보내지 않는다**(BY-257). 다만 이용약관·개인정보처리방침과 달리 본문을 텍스트로
 * 옮길 수 없다 — 응답을 제출해야 하는 인터랙티브 폼이라 WebView로 띄운다. 이 화면이 ADR 0001이
 * 말하는 "WebView로 웹을 로드한다"의 첫 사례다(스터디룸은 아직 재구축 전).
 *
 * `react-native-webview`는 Expo Go에 포함돼 있어 Dev Client 없이 동작한다 — 실제로 시뮬레이터에서
 * 확인한 뒤 의존성에 추가했다(추측 설치가 아니다).
 */

/**
 * 폼을 불러오지 못했을 때의 문구.
 *
 * ⚠️ `voice-tone.md`에 확정 카피가 없다 — 다른 화면의 어조(`~어요`)에 맞춰 임시로 쓴다.
 * TODO(SCR-S6-settings.md): 문의 실패 문구 확정 필요.
 */
const LOAD_FAILURE_TITLE = "문의 폼을 불러오지 못했어요";
const LOAD_FAILURE_BODY = "네트워크 상태를 확인하고 다시 시도해 주세요.";

export default function ContactScreen() {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const retry = useCallback(() => {
    setFailed(false);
    setLoading(true);
    webViewRef.current?.reload();
  }, []);

  return (
    <View className="bg-bg-base dark:bg-bg-base-dark flex-1" style={{ paddingTop: insets.top }}>
      <ScreenBackHeader title="문의하기" />

      {failed ? (
        <View className="flex-1 items-center justify-center px-5" style={{ paddingBottom: 78 }}>
          <Text
            accessibilityRole="header"
            className="text-text-primary dark:text-text-primary-dark text-center text-[20px] font-bold leading-[24px]"
          >
            {LOAD_FAILURE_TITLE}
          </Text>
          <Text className="text-text-secondary dark:text-text-secondary-dark mt-[10px] text-center text-[14px] leading-[21px]">
            {LOAD_FAILURE_BODY}
          </Text>
          <View className="mt-[24px] w-full">
            <PrimaryCtaButton label="다시 시도" onPress={retry} />
          </View>
        </View>
      ) : (
        <View className="flex-1" style={{ paddingBottom: insets.bottom }}>
          <WebView
            ref={webViewRef}
            source={{ uri: CONTACT_FORM_URL }}
            // 폼 제출에 필요한 최소 설정만 켠다 — 파일 접근·임의 스킴 열기는 허용하지 않는다.
            javaScriptEnabled
            domStorageEnabled
            allowFileAccess={false}
            onLoadEnd={() => {
              setLoading(false);
            }}
            // 네트워크 실패와 HTTP 오류를 모두 같은 화면으로 처리한다 —
            // 사용자에게는 "폼이 안 열린다"는 하나의 사실이다.
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={() => {
              setLoading(false);
              setFailed(true);
            }}
          />
          {loading && (
            // 로딩 중에도 WebView를 마운트해 둔다 — 언마운트하면 로드가 처음부터 다시 시작된다.
            <View
              accessibilityLabel="문의 폼을 불러오는 중"
              className="bg-bg-base dark:bg-bg-base-dark absolute inset-0 items-center justify-center"
            >
              <ActivityIndicator />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
