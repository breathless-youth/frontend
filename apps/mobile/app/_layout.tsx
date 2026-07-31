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
        <Stack screenOptions={{ headerShown: false }}>
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
          <Stack.Screen name="room/[id]" options={{ presentation: "fullScreenModal" }} />
        </Stack>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
