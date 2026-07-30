import { useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { resolveDevWebOrigin } from "../../lib/devWebOrigin";
import { buildSessionUrl } from "../../lib/webAssetServer";
import { getWebAssetServer } from "../../lib/webAssetServerRegistry";
import { getRegisteredUserId } from "../../lib/userApi";

/**
 * 싱글룸 세션(S3-1~S3-8) — 화면 구현체는 `apps/web`이고 여기서는 WebView로 로드한다(ADR 0001).
 *
 * 이 파일이 하는 일은 셋뿐이다: 로컬 서버를 띄우고, 세션 URL을 조립하고, WebView에 넘긴다.
 * 타이머·상태 판정·이벤트 누적은 전부 웹이 소유한다(설계 문서 §1, 세션 상태 모델 스펙 §1) —
 * **여기에 세션 로직을 넣지 말 것.**
 *
 * `allowsInlineMediaPlayback`·`mediaCapturePermissionGrantType`은 WebView 안의
 * `getUserMedia`가 카메라를 열기 위해 필요하다(ADR 0001 Consequences).
 */
export default function SessionRoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  /**
   * 웹 dev 서버 오리진(`lib/devWebOrigin.ts`). `null`이면 평소대로 동봉 자산을 쓴다.
   * 렌더마다 다시 읽어도 값이 바뀌지 않는다 — `Constants.expoConfig`는 앱 수명 동안 고정이다.
   */
  const devWebOrigin = resolveDevWebOrigin();

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        /**
         * 개발용 웹 dev 서버가 지정돼 있으면 **정적 서버를 띄우지 않는다**(`lib/devWebOrigin.ts`).
         * 띄워봐야 아무도 안 보는 포트를 잡을 뿐이고, 기동 실패가 아래 catch로 들어가
         * dev 서버는 멀쩡한데 "세션을 시작하지 못했어요"가 뜨는 엉뚱한 실패가 된다.
         */
        const [origin, userId] = await Promise.all([
          devWebOrigin === null ? getWebAssetServer().start() : Promise.resolve(devWebOrigin),
          // userId를 못 읽어도 세션은 연다 — `buildSessionUrl`은 `null`을 지원하고
          // `apps/web`은 그 부재를 unsaved 경로로 처리한다. SecureStore 읽기 실패로
          // 세션 전체를 죽이면 복구 가능한 상황이 막다른 길이 된다.
          // 이 catch 덕분에 아래 catch에 도달하는 건 **서버 기동 실패뿐**이고,
          // 그래서 로그 문구도 실제 원인과 일치한다.
          getRegisteredUserId().catch(() => null),
        ]);
        if (!cancelled) {
          setUri(
            buildSessionUrl(origin, {
              roomId: id ?? "1",
              userId,
              // Dev Client 빌드에서만 웹 진단(해상도 오버레이·콘솔 로그)을 켠다.
              // 릴리스 빌드에는 플래그가 붙지 않아 사용자에게 보이지 않는다.
              diag: __DEV__,
            }),
          );
        }
      } catch (error: unknown) {
        console.warn("[room] 로컬 웹 자산 서버 기동 실패", error);
        if (!cancelled) {
          setFailed(true);
        }
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [id, devWebOrigin]);

  if (failed) {
    return (
      <>
        {/* 세션 화면은 시스템 테마와 무관하게 항상 다크다 — 상태 바 아이콘도 밝게 고정한다
            (라이트 모드 기기에서 `style="auto"`가 어두운 아이콘을 골라 배경에 묻힌다). */}
        <StatusBar style="light" />
        <View className="flex-1 items-center justify-center bg-[#0B0F14] px-6">
          <Text className="text-center text-[15px] leading-[22px] text-white/80">
            세션을 시작하지 못했어요
          </Text>
        </View>
      </>
    );
  }

  if (uri === null) {
    return (
      <>
        <StatusBar style="light" />
        <View className="flex-1 items-center justify-center bg-[#0B0F14]">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <WebView
        testID="session-webview"
        source={{ uri }}
        // 세션 화면은 항상 다크다 — 로딩 중 흰 배경이 번쩍이지 않게 한다.
        style={{ flex: 1, backgroundColor: "#0B0F14" }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        // iOS 16.4+는 `isInspectable`을 켠 WebView만 Safari 웹 인스펙터에 노출한다.
        // 이걸 안 켜면 세션 화면이 백지로 떠도 안을 볼 수단이 없다 — 로컬 서버 404인지,
        // wasm 로드 실패인지, `getUserMedia` 거부인지 구분이 안 된다.
        // `__DEV__` 게이트라 릴리스 빌드에는 들어가지 않는다.
        webviewDebuggingEnabled={__DEV__}
        // **최상위 네비게이션**만 로컬 서버 오리진으로 제한한다 — 여기 없는 오리진으로
        // 이동하려 하면 WebView가 대신 시스템 브라우저로 넘긴다. 서브리소스(fetch·이미지·
        // wasm) 로드는 이 prop이 통제하지 않는다.
        //
        // 두 호스트 표기를 모두 받는다: 로컬 서버는 `127.0.0.1`에 바인딩할 예정인데(설계 §1)
        // 라이브러리가 오리진을 어느 쪽 문자열로 보고할지는 스파이크 전까지 알 수 없다.
        // 한쪽만 적어 두면 `buildSessionUrl`이 만든 URL이 화이트리스트에 걸려 세션이
        // 시스템 브라우저로 튀어나가는, 원인과 증상이 전혀 안 맞는 버그가 된다.
        //
        // 웹 dev 서버를 쓸 때는 그 오리진도 넣는다 — iOS 실기기는 secure context 때문에
        // `https://192.168.x.x:5173` 형태를 쓰는데, 위 두 항목에 걸리지 않아 세션이
        // Safari로 튀어나간다. `??`가 아니라 스프레드인 이유는 dev 오리진이 없을 때
        // 배열 모양을 그대로 두기 위해서다.
        originWhitelist={[
          "http://localhost:*",
          "http://127.0.0.1:*",
          ...(devWebOrigin === null ? [] : [`${devWebOrigin}/*`]),
        ]}
      />
    </>
  );
}
