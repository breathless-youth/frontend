import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes } from "react-router-dom";
import * as Sentry from "@sentry/react";

import { ErrorFallback } from "@/components/ErrorFallback";
import { useBlockForwardGestureIntoFullScreen } from "@/lib/historyGuard";
import { useNativeRouteReset } from "@/lib/nativeRouteReset";
import { useNativeShellClass } from "@/lib/nativeShell";
import { useNativeTabBarSync } from "@/lib/nativeTabBar";
import { ContactPage } from "@/routes/ContactPage";
import { HomePage } from "@/routes/HomePage";
import { HomeTabPage } from "@/routes/HomeTabPage";
import { LicensesPage } from "@/routes/LicensesPage";
import { LiveRoomPage } from "@/routes/LiveRoomPage";
import { WebrtcLoopbackPage } from "@/routes/WebrtcLoopbackPage";
import { OnboardingGuidePage } from "@/routes/OnboardingGuidePage";
import { PrivacyPage } from "@/routes/PrivacyPage";
import { ProfilePage } from "@/routes/ProfilePage";
import { InviteCodeJoinPage } from "@/routes/InviteCodeJoinPage";
import { InviteCodeSharePage } from "@/routes/InviteCodeSharePage";
import { RecordsPage } from "@/routes/RecordsPage";
import { ResultPage } from "@/routes/ResultPage";
import { RoomPage } from "@/routes/RoomPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { SocialHomePage } from "@/routes/SocialHomePage";
import { TermsPage } from "@/routes/TermsPage";

const queryClient = new QueryClient();

export function App() {
  // 전체 화면 라우트에서 네이티브 탭 바를 감춘다 — 웹 라우팅은 네이티브 스택을 건너지 않으므로
  // 알려주지 않으면 탭 바가 그대로 남는다(`lib/nativeTabBar.ts`).
  useNativeTabBarSync();
  // 웹뷰 안에서만 페이지 드래그·길게 눌러 선택을 막는다(`lib/nativeShell.ts`).
  useNativeShellClass();
  // 포워드 스와이프로 닫았던 전체 화면 라우트가 되열리는 것을 막는다(`lib/historyGuard.ts`).
  useBlockForwardGestureIntoFullScreen();
  // Android 시스템 뒤로가기로 탭을 떠날 때 네이티브가 보내는 초기화 신호를 받아 탭 루트로
  // 되돌린다(`lib/nativeRouteReset.ts`).
  useNativeRouteReset();

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        렌더 크래시를 흰 화면 대신 폴백으로 받는다. 바운더리가 잡은 에러는
        `onUncaughtError`(`sentryRootOptions`)를 타지 않고 바운더리 자신이 1회 전송한다 —
        `onCaughtError`를 추가하면 이중 전송이 된다(`errorBoundary.test.tsx`가 고정).
      */}
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:id" element={<RoomPage />} />
          <Route path="/room/:id/result" element={<ResultPage />} />
          <Route path="/home" element={<HomeTabPage />} />
          <Route path="/records" element={<RecordsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/social" element={<SocialHomePage />} />
          {import.meta.env.DEV && (
            <Route path="/dev/webrtc-loopback" element={<WebrtcLoopbackPage />} />
          )}
          <Route path="/social/code" element={<InviteCodeSharePage />} />
          <Route path="/social/join" element={<InviteCodeJoinPage />} />
          <Route path="/social/room/:roomId" element={<LiveRoomPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/onboarding-guide" element={<OnboardingGuidePage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/licenses" element={<LicensesPage />} />
        </Routes>
      </Sentry.ErrorBoundary>
    </QueryClientProvider>
  );
}
