import "../global.css";

import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { AppState } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

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

          그래서 실제 정책은 이 두 줄이 만든다: 상한은 전 방향으로 열어 두고, 기본값을 세로로
          닫은 다음, 세션에서만 다시 연다.

          `react-native-screens`(4.16.0, 이미 직접 의존성)가 처리하므로 `expo-screen-orientation`을
          추가하지 않는다 — SCR-S3-5-S3-6 P0-3의 "새 네이티브 의존성 승인"이 불필요해진 이유.
        */}
        <Stack screenOptions={{ headerShown: false, orientation: "portrait" }}>
          <Stack.Screen name="(tabs)" />
          {/* S2-3 권한 거부 안내 — 탭 위에 올라오는 전체 화면. 백 제스처를 막지 않는다(홈 복귀와 동일 결과). */}
          <Stack.Screen name="permission-denied" />
          {/*
            G1~G5 온보딩 가이드 — 5스텝 전체가 이 라우트 하나다(스텝은 화면이 아니라 상태).
            탭 바를 가리는 전체 화면 모달로 띄운다: 배경이 세션 화면 목업이라 탭 바가 함께
            보이면 "지금 세션 화면"이라는 착시가 깨진다. 백 제스처는 막지 않는다 —
            시스템 뒤로가기 처리는 아직 미정이라 플랫폼 기본값을 그대로 둔다
            (`app/onboarding-guide.tsx`의 TODO 참고).
          */}
          <Stack.Screen
            name="onboarding-guide"
            options={{ presentation: "fullScreenModal", animation: "fade" }}
          />
          {/*
            이용약관·개인정보처리방침 — 설정에서 진입하는 읽기 전용 문서 화면. 탭 바를 덮는 스택
            라우트라 `(tabs)` 밖에 둔다. 백 제스처를 막지 않는다(화면 안 뒤로가기 버튼과 같은 결과).
          */}
          <Stack.Screen name="terms" />
          <Stack.Screen name="privacy" />
          {/* 문의하기 — 폼을 WebView로 띄우는 화면. 위 두 화면과 같은 이유로 `(tabs)` 밖에 둔다. */}
          <Stack.Screen name="contact" />
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
