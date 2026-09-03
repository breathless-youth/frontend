import "../global.css";

import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { consumePendingInviteRoute } from "../lib/installReferrerInvite";
import { lockPortrait } from "../lib/orientation";
import { initSentry, wrapRoot } from "../lib/sentry";
import { ensureUserRegistered } from "../lib/userApi";

/**
 * **렌더 밖(모듈 스코프)에서 부른다.** effect로 미루면 그 사이에 나는 에러 — 특히 앱 시작
 * 직후 터지는 것들 — 을 놓친다. 초기화 자체는 DSN 유무만 보므로 부작용이 없다.
 */
initSentry();

// Pretendard 로드가 끝날 때까지(아래 useFonts) 스플래시를 유지한다 — 안 그러면 시스템 폰트로
// 한 프레임 그렸다가 Pretendard로 바뀌는 깜빡임(FOUT)이 보인다. 위 initSentry와 같은 이유로
// 모듈 스코프에서 부른다: effect까지 미루면 그 사이 자동으로 숨어버릴 수 있다. 이미 숨겨진
// 상태에서 또 불리는 등 실패해도 무해하므로 거부는 무시한다.
void SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * 서버 통계는 홈·기록 탭이 공유한다. staleTime 30초: 탭을 오가는 짧은 간격에는 캐시를
 * 쓰고, 그보다 오래되면 포커스 시 재조회한다. retry 1: 오류 UI에 재시도 버튼이 있으므로
 * 자동 재시도를 길게 끌지 않는다.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function RootLayout() {
  const router = useRouter();
  const [fontsLoaded, fontError] = useFonts({
    Pretendard: require("../assets/fonts/PretendardVariable.ttf") as number,
  });

  useEffect(() => {
    // 실패해도 스플래시는 걷는다 — 시스템 폰트로라도 그려야지, 안 그려질 이유가 없다.
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    void ensureUserRegistered();
    // 앱 전역 세로 잠금 — 세션(`room/[id]`)이 자기 마운트에서 풀고 언마운트에서 되잠근다.
    // 아래 rn-screens `orientation` 옵션은 iOS에서 무력해서(P0-3 정정, `lib/orientation.ts`)
    // 실제 잠금은 이 호출이 담당한다.
    lockPortrait();
  }, []);

  useEffect(() => {
    // Install Referrer는 Android 전용이다 — iOS는 스토어가 값을 앱에 전달할 통로 자체가 없다.
    if (Platform.OS !== "android") return;
    void consumePendingInviteRoute().then((route) => {
      if (route !== null) router.push(route);
    });
  }, [router]);

  // RN에는 window focus가 없다 — 앱 포그라운드 복귀를 react-query의 focus 신호로 잇는다.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);

  // Pretendard 로드 결과(성공/실패)가 나오기 전에는 아무것도 그리지 않는다 — 스플래시가 그
  // 자리를 대신 덮는다(위 preventAutoHideAsync). 실패까지 여기서 계속 막으면 스플래시가
  // 영영 안 걷혀 앱이 멎는다 — 실패 시엔 시스템 폰트로라도 그린다.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {/*
          방향은 **화면 단위로** 정한다 — 기본 세로, 세션(`room/[id]`)과 소셜룸(웹 브리지
          `set-orientation`)만 회전 허용.

          `app.json`의 `orientation`은 `"default"`(전 방향)여야 한다. 그건 "앱을 전부 회전
          가능하게" 만드는 설정이 아니라 **네이티브가 허용하는 방향의 상한**이다(iOS
          `UISupportedInterfaceOrientations`). 여기서 `"portrait"`로 조이면 상한이 세로로 닫혀
          세션이 landscape를 요청해도 회전하지 않는다.

          그래서 정책은: 상한은 전 방향으로 열어 두고, 기본값을 세로로 닫은 다음, 룸에서만
          다시 연다.

          ⚠️ **rn-screens `orientation` 옵션은 Android에서만 싣는다** (BY-444, 2026-08-26 —
          "iOS에서 무력하지만 무해"라던 P0-3 정정(2026-08-01)의 재정정). iOS에서 이 옵션은
          무해하지 않다: 화면 어딘가에 orientation이 실려 있으면 expo-screen-orientation의
          루트 VC(`ScreenOrientationViewController`)가 `shouldUseRNScreenOrientation()`으로
          **JS 잠금(`lockAsync`)을 통째로 무시하고 rn-screens에 양보**하는데, rn-screens의
          iOS 마스크 산출 경로는 우리 계층 구조에서 전 방향 허용으로 떨어진다. 그래서 8/1에
          도입한 iOS 세로 잠금이 한 번도 집행되지 못하고 전 화면이 회전됐다. iOS 방향의
          단일 소유자는 `lib/orientation.ts`(expo-screen-orientation)다: 위 effect의
          `lockPortrait()` + 룸의 해제/재잠금. Android는 이 옵션(`setRequestedOrientation`)이
          그대로 동작하므로 유지한다.
        */}
        <Stack
          screenOptions={{
            headerShown: false,
            ...(Platform.OS === "android" ? { orientation: "portrait" as const } : null),
          }}
        >
          <Stack.Screen name="(tabs)" />
          {/* S2-3 권한 거부 안내 — 탭 위에 올라오는 전체 화면. 백 제스처를 막지 않는다(홈 복귀와 동일 결과). */}
          <Stack.Screen name="permission-denied" />
          {/*
            G1~G5 온보딩 가이드·이용약관·개인정보처리방침·문의하기는 웹으로 이관됐다(BY-333) —
            네이티브 라우트를 더 이상 두지 않는다.
          */}
          {/*
            싱글룸 세션(S3) — 화면 구현체는 apps/web이고 WebView로 로드한다(ADR 0001).
            탭 바를 가리는 전체 화면으로 띄운다: 세션 중에는 탭 이동이 없다.
          */}
          {/*
            방향: 이 화면만 회전을 연다(S3-5·S3-6 가로 거치 모드). Android 전용인 이유는 위
            Stack 주석과 같다(BY-444) — iOS는 세션 화면의 `unlockForSession()`이 연다.
            `"all"`이 아니라 `"default"`인 이유는 iOS에서 `"all"`이 **거꾸로 세로**
            (portrait_down)까지 포함하기 때문이다 — 거치대에 눕히는 용도에 거꾸로는 필요 없고,
            Android에서는 `"default"`가 시스템 판단에 맡겨 사용자의 회전 잠금 설정을 존중한다.

            세로 세션 화면(S3-1~S3-4)도 그대로 살아 있다 — 가로는 강제가 아니라 선택지다.
          */}
          <Stack.Screen
            name="room/[id]"
            options={{
              presentation: "fullScreenModal",
              ...(Platform.OS === "android" ? { orientation: "default" as const } : null),
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

// 렌더 트리에서 난 에러를 잡으려면 루트를 감싸야 한다 — `initSentry()`만으로는 부족하다.
export default wrapRoot(RootLayout);
