import "../global.css";

import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { lockPortrait } from "../lib/orientation";
import { ensureUserRegistered } from "../lib/userApi";

/**
 * 서버 통계는 홈·기록 탭이 공유한다. staleTime 30초: 탭을 오가는 짧은 간격에는 캐시를
 * 쓰고, 그보다 오래되면 포커스 시 재조회한다. retry 1: 오류 UI에 재시도 버튼이 있으므로
 * 자동 재시도를 길게 끌지 않는다.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  useEffect(() => {
    void ensureUserRegistered();
    // 앱 전역 세로 잠금 — 세션(`room/[id]`)이 자기 마운트에서 풀고 언마운트에서 되잠근다.
    // 아래 rn-screens `orientation` 옵션은 iOS에서 무력해서(P0-3 정정, `lib/orientation.ts`)
    // 실제 잠금은 이 호출이 담당한다.
    lockPortrait();
  }, []);

  // RN에는 window focus가 없다 — 앱 포그라운드 복귀를 react-query의 focus 신호로 잇는다.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
    });
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        {/*
          방향은 **화면 단위로** 정한다 — 기본 세로, 세션(`room/[id]`)만 회전 허용.

          `app.json`의 `orientation`은 `"default"`(전 방향)여야 한다. 그건 "앱을 전부 회전
          가능하게" 만드는 설정이 아니라 **네이티브가 허용하는 방향의 상한**이다(iOS
          `UISupportedInterfaceOrientations`). 여기서 `"portrait"`로 조이면 상한이 세로로 닫혀
          아래 화면별 `orientation`이 landscape를 요청해도 회전하지 않는다.

          그래서 정책은: 상한은 전 방향으로 열어 두고, 기본값을 세로로 닫은 다음, 세션에서만
          다시 연다.

          ⚠️ **아래 rn-screens `orientation` 옵션은 iOS에서 무력하다** (P0-3 정정, 2026-08-01) —
          Expo 앱 델리게이트는 rn-screens에 방향을 묻지 않아서, 실제 iOS 잠금은
          `lib/orientation.ts`(expo-screen-orientation)가 한다: 위 effect의 `lockPortrait()` +
          세션 화면의 마운트 해제/재잠금. 옵션을 지우지 않는 이유는 Android에서는 이 경로
          (`setRequestedOrientation`)가 동작하기 때문이다. 근거 전문은 `lib/orientation.ts`.
        */}
        <Stack screenOptions={{ headerShown: false, orientation: "portrait" }}>
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
            방향: 이 화면만 회전을 연다(S3-5·S3-6 가로 거치 모드). `"all"`이 아니라 `"default"`인
            이유는 iOS에서 `"all"`이 **거꾸로 세로**(portrait_down)까지 포함하기 때문이다 —
            거치대에 눕히는 용도에 거꾸로는 필요 없고, Android에서는 `"default"`가 시스템 판단에
            맡겨 사용자의 회전 잠금 설정을 존중한다.

            세로 세션 화면(S3-1~S3-4)도 그대로 살아 있다 — 가로는 강제가 아니라 선택지다.
          */}
          <Stack.Screen
            name="room/[id]"
            options={{ presentation: "fullScreenModal", orientation: "default" }}
          />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
