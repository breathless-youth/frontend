import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ensureUserRegistered } from "../lib/userApi";

export default function RootLayout() {
  useEffect(() => {
    void ensureUserRegistered();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
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
          싱글룸 세션(S3) — 화면 구현체는 apps/web이고 WebView로 로드한다(ADR 0001).
          탭 바를 가리는 전체 화면으로 띄운다: 세션 중에는 탭 이동이 없다.
        */}
        <Stack.Screen name="room/[id]" options={{ presentation: "fullScreenModal" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
