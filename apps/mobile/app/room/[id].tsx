import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";

import { resolveDevWebOrigin } from "../../lib/devWebOrigin";
import { relaySessionSubmit } from "../../lib/sessionSubmitRelay";
import { buildSessionUrl } from "../../lib/webAssetServer";
import { getWebAssetServer } from "../../lib/webAssetServerRegistry";
import { getRegisteredUserId } from "../../lib/userApi";
import { injectMessageScript, parseToNativeMessage } from "../../lib/webBridge";

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
  /** 응답을 되돌려 보낼 통로. `injectJavaScript`가 여기 달려 있다. */
  const webViewRef = useRef<WebView>(null);
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

  /**
   * 웹 → 네이티브 메시지 처리 — **지금은 세션 제출 대행뿐이다**(`lib/sessionSubmitRelay.ts`).
   *
   * 세션 로직이 여기로 넘어오는 게 아니다. 웹이 완성한 요청 본문을 받아 HTTP만 대신 쳐 주고
   * 결과를 그대로 돌려준다 — WebView 안에서 직접 `fetch`하면 백엔드가 CORS 헤더를 보내지 않아
   * 막히기 때문이다(2026-07-30 확인). 그 전까지는 제출이 조용히 실패해서 종료를 눌러도 결과
   * 화면으로 넘어가지 않았다.
   *
   * 모르는 메시지는 `parseToNativeMessage`가 `null`로 흘려보낸다 — 앱과 웹 번들의 버전이
   * 어긋날 수 있고, 모르는 메시지에 죽으면 세션이 멈춘다.
   */
  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const message = parseToNativeMessage(event.nativeEvent.data);
    if (message === null || message.type !== "submit-session") {
      return;
    }
    // `relaySessionSubmit`은 실패도 `ok: false` 메시지로 돌려주므로 여기서 catch할 것이 없다.
    // 응답을 못 보내면 웹이 타임아웃까지 "저장 중..."에 갇히므로 그 경로를 만들지 않는다.
    void relaySessionSubmit(message).then((result) => {
      webViewRef.current?.injectJavaScript(injectMessageScript(result));
    });
  }, []);

  /**
   * Android 하드웨어 뒤로가기 차단 — **세션 유실 방지**.
   *
   * 막지 않으면 뒤로가기가 네이티브 스택에서 이 화면을 팝하고, 그때 WebView가 통째로 파괴된다.
   * 세션 로직은 전부 웹에 있으므로 `endAndSubmit`이 실행될 기회 자체가 없다 —
   * 종료 확인 다이얼로그도 뜨지 않고, **공부한 시간이 서버에 하나도 남지 않는다.** 사용자
   * 입장에서는 뒤로가기를 한 번 누른 것뿐인데 세션이 증발하고 되돌릴 방법이 없다.
   *
   * `true`를 돌려주는 것은 "이 이벤트를 소비했으니 기본 동작(화면 닫기)을 하지 말라"는 뜻이다.
   * iOS에는 하드웨어 뒤로가기가 없어 이 핸들러가 불리지 않는다 — 실질적으로 Android 전용이다.
   *
   * **왜 다이얼로그를 띄우지 않고 그냥 막는가.** 종료 확인 다이얼로그(S3-7)는 웹 소유인데
   * 네이티브→웹 명령을 보낼 브리지가 아직 배선되지 않았다(`lib/webBridge.ts`는 있으나
   * 어느 화면에도 연결돼 있지 않다). 그리고 SCR-S3-7이 하드웨어 뒤로가기에 대해
   * **"종료를 이 경로로 확정시키지 말 것"**을 명시했고, 확정되지 않은 닫기 경로는 열지 않고
   * 막아 두는 것이 이 저장소의 기존 방침이다(U1 `UpdateNoticeSheet`의 dim-press·swipe-down·
   * hardware-back 처리와 같다). 세션은 화면 안의 종료 버튼으로만 끝난다.
   *
   * TODO: 브리지가 배선되면 여기서 막는 대신 웹에 `back-pressed`를 넘겨 S3-7 다이얼로그를
   * 열도록 바꾼다. 그게 Android 관례에 더 맞는다.
   *
   * ⚠️ **세션이 실제로 살아 있을 때만 막는다.** 오류 화면(`failed`)과 로딩 중(`uri === null`)에는
   * 지킬 세션이 없는데, 거기서까지 막으면 사용자가 그 화면에 갇혀 나갈 방법이 사라진다.
   */
  useFocusEffect(
    useCallback(() => {
      if (failed || uri === null) {
        return;
      }
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
      return () => subscription.remove();
    }, [failed, uri]),
  );

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
        ref={webViewRef}
        source={{ uri }}
        onMessage={handleMessage}
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
