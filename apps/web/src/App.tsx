import { lazy, Profiler, Suspense, useEffect } from "react";
import type { ProfilerOnRenderCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Routes, useLocation } from "react-router-dom";
import * as Sentry from "@sentry/react";

import { ErrorFallback } from "@/components/ErrorFallback";
import { Toaster } from "@/components/ui/sonner";
import { ForceUpdateDialog } from "@/features/force-update/components/ForceUpdateDialog";
import {
  FORCE_UPDATE_CONFIRM_LABEL,
  FORCE_UPDATE_DESCRIPTION,
  FORCE_UPDATE_TITLE,
} from "@/features/force-update/copy";
import { useForceUpdateGate } from "@/features/force-update/useForceUpdateGate";
import { useRecordLastHidden } from "@/features/interview/useRecordLastHidden";
import { trackForceUpdateStoreOpened } from "@/lib/amplitude";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { reloadOnChunkError } from "@/lib/chunkReload";
import { useBlockForwardGestureIntoFullScreen } from "@/lib/historyGuard";
import { useNativeAnalyticsRelay } from "@/lib/nativeAnalytics";
import { toastBottomOffset, useNativeTabBarClass, useNativeTabBarSync } from "@/lib/nativeTabBar";
import { useNativeRouteReset } from "@/lib/nativeRouteReset";
import { useNativeScreenReport } from "@/lib/nativeScreenReport";
import { useNativeSessionClosed } from "@/lib/nativeSessionClosed";
import { useNativeShellClass } from "@/lib/nativeShell";
import { usePageTransitionCommit } from "@/lib/pageTransition";
import { queryClient } from "@/lib/queryClient";
import { dismissToast } from "@/lib/toast";
import { HomePage } from "@/routes/HomePage";
import { HomeTabPage } from "@/routes/HomeTabPage";
import { InviteCodeJoinPage } from "@/routes/InviteCodeJoinPage";
import { InviteCodeSharePage } from "@/routes/InviteCodeSharePage";
import {
  loadContactPage,
  loadInterviewFormPage,
  loadLicensesPage,
  loadOnboardingGuidePage,
  loadPrivacyPage,
  loadProfilePage,
  loadResultPage,
  loadTermsPage,
} from "@/routes/lazyRoutes";
import { PlannerPage } from "@/routes/PlannerPage";
import { RecordsPage } from "@/routes/RecordsPage";
import { RoomPage } from "@/routes/RoomPage";
import { SettingsPage } from "@/routes/SettingsPage";
import { SocialHomePage } from "@/routes/SocialHomePage";

/**
 * 탭 밖 화면 lazy 로딩
 *
 * 탭 웹뷰의 첫 화면에 필요 없는 화면만 따로 받는다.
 * 탭·초대 화면까지 lazy로 바꾸면 엔트리 실행 뒤 청크를 요청하는 워터폴과 Suspense reveal 지연으로 홈 첫 화면이 오히려 느려져 정적 import로 둔다.
 * 세션 화면도 같은 이유로 정적 import다.
 * 네이티브 세션 화면이 `/room/:id`를 새 문서로 열어, Suspense 폴백과 reveal 지연이 그대로 첫 페인트를 늦춘다.
 * 배포 교체로 청크를 못 받으면 `reloadOnChunkError`가 한 번 새로고침한다.
 */
const ResultPage = lazy(
  reloadOnChunkError(() => loadResultPage().then((module) => ({ default: module.ResultPage }))),
);
const LiveRoomPage = lazy(
  reloadOnChunkError(() =>
    import("@/routes/LiveRoomPage").then((module) => ({ default: module.LiveRoomPage })),
  ),
);
const ProfilePage = lazy(
  reloadOnChunkError(() => loadProfilePage().then((module) => ({ default: module.ProfilePage }))),
);
const OnboardingGuidePage = lazy(
  reloadOnChunkError(() =>
    loadOnboardingGuidePage().then((module) => ({ default: module.OnboardingGuidePage })),
  ),
);
const ContactPage = lazy(
  reloadOnChunkError(() => loadContactPage().then((module) => ({ default: module.ContactPage }))),
);
const InterviewFormPage = lazy(
  reloadOnChunkError(() =>
    loadInterviewFormPage().then((module) => ({ default: module.InterviewFormPage })),
  ),
);
const TermsPage = lazy(
  reloadOnChunkError(() => loadTermsPage().then((module) => ({ default: module.TermsPage }))),
);
const PrivacyPage = lazy(
  reloadOnChunkError(() => loadPrivacyPage().then((module) => ({ default: module.PrivacyPage }))),
);
const LicensesPage = lazy(
  reloadOnChunkError(() => loadLicensesPage().then((module) => ({ default: module.LicensesPage }))),
);
const WebrtcLoopbackPage = lazy(
  reloadOnChunkError(() =>
    import("@/routes/WebrtcLoopbackPage").then((module) => ({
      default: module.WebrtcLoopbackPage,
    })),
  ),
);
const WorkerParityPage = lazy(
  reloadOnChunkError(() =>
    import("@/routes/WorkerParityPage").then((module) => ({ default: module.WorkerParityPage })),
  ),
);

// 세션 화면의 커밋 횟수를 개발 빌드에서만 기록한다.
// React Compiler 전후 비교의 근거다.
const roomCommitStats = { commits: 0, actualMs: 0, lastLogAt: 0 };
const onRoomRender: ProfilerOnRenderCallback = (
  _id,
  phase,
  actualDuration,
  _base,
  _start,
  commitTime,
) => {
  if (phase === "mount") {
    roomCommitStats.commits = 1;
    roomCommitStats.actualMs = actualDuration;
    roomCommitStats.lastLogAt = commitTime;
    return;
  }
  roomCommitStats.commits += 1;
  roomCommitStats.actualMs += actualDuration;
  if (commitTime - roomCommitStats.lastLogAt >= 10_000) {
    roomCommitStats.lastLogAt = commitTime;
    // eslint-disable-next-line no-console -- 개발 빌드에서만 찍는 측정 로그다
    console.info(
      `[profile] RoomPage commits=${roomCommitStats.commits} actualMs=${roomCommitStats.actualMs.toFixed(1)}`,
    );
  }
};

function RoomPageProfiled() {
  useEffect(() => {
    return () => {
      // StrictMode가 마운트 직후 정리를 한 번 더 돌려 커밋 1건짜리 요약은 건너뛴다.
      if (roomCommitStats.commits <= 1) return;
      // eslint-disable-next-line no-console -- 개발 빌드에서만 찍는 측정 로그다
      console.info(
        `[profile] RoomPage unmount commits=${roomCommitStats.commits} actualMs=${roomCommitStats.actualMs.toFixed(1)}`,
      );
    };
  }, []);
  return (
    <Profiler id="RoomPage" onRender={onRoomRender}>
      <RoomPage />
    </Profiler>
  );
}

/** 라우트가 바뀔 때마다 탭 바를 피해 토스트 위치를 다시 잰다. */
function AppToaster() {
  const { pathname } = useLocation();
  const bottom = toastBottomOffset(pathname, isNativeBridgeAvailable());
  // 전역 Toaster는 화면과 달리 언마운트되지 않아, 지우지 않으면 이전 화면의 토스트가
  // 다음 화면까지 넘어간다. 이 컴포넌트가 <Routes>보다 앞선 형제라 이펙트가 먼저 돌고,
  // 새로 마운트되는 화면이 자기 토스트를 부르면 그 호출이 막 건 dismiss를 취소한다.
  useEffect(() => {
    dismissToast();
  }, [pathname]);
  return <Toaster bottom={bottom} />;
}

export function App() {
  useRecordLastHidden();
  // 슬라이드 전환의 갱신 콜백이 라우트 커밋 시점에 풀리게 한다. Routes의 형제로 마운트해야
  // 한다(lib/pageTransition.ts). 라우트 엘리먼트 안에 두면 이동과 함께 언마운트돼 새 위치를
  // 못 본다.
  usePageTransitionCommit();
  // 전체 화면 라우트에서 네이티브 탭 바를 감춘다 — 웹 라우팅은 네이티브 스택을 건너지 않으므로
  // 알려주지 않으면 탭 바가 그대로 남는다(`lib/nativeTabBar.ts`).
  useNativeTabBarSync();
  // 웹뷰 안에서만 페이지 드래그·길게 눌러 선택을 막는다(`lib/nativeShell.ts`).
  useNativeShellClass();
  // 시스템 탭 바(iOS)면 하단 여백 공식을 안전 영역 기준으로 바꾼다(`lib/nativeTabBar.ts`).
  useNativeTabBarClass();
  // 포워드 스와이프로 닫았던 전체 화면 라우트가 되열리는 것을 막는다(`lib/historyGuard.ts`).
  useBlockForwardGestureIntoFullScreen();
  // Android 시스템 뒤로가기로 탭을 떠날 때 네이티브가 보내는 초기화 신호를 받아 탭 루트로
  // 되돌린다(`lib/nativeRouteReset.ts`).
  useNativeRouteReset();
  // 렌더러 사망 복구용 현재 화면 보고(`lib/nativeScreenReport.ts`).
  useNativeScreenReport();
  // 네이티브가 관측한 사용자 이벤트(탭 터치·권한 게이트 등)를 Amplitude로 넘긴다(`lib/nativeAnalytics.ts`).
  useNativeAnalyticsRelay();
  // 세션 모달이 닫히면 통계를 다시 받게 표시한다(lib/nativeSessionClosed.ts).
  useNativeSessionClosed();
  // 앱 버전이 최소 버전 미만이면 강제 업데이트 모달을 앱 전역에 띄운다
  const { forced: forceUpdateRequired, onUpdate: openAppStoreForUpdate } = useForceUpdateGate();

  return (
    <QueryClientProvider client={queryClient}>
      {/*
        렌더 크래시를 흰 화면 대신 폴백으로 받는다. 바운더리가 잡은 에러는
        `onUncaughtError`(`sentryRootOptions`)를 타지 않고 바운더리 자신이 1회 전송한다 —
        `onCaughtError`를 추가하면 이중 전송이 된다(`errorBoundary.test.tsx`가 고정).
      */}
      <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
        <AppToaster />
        {forceUpdateRequired ? (
          // 강제 업데이트가 걸리면 라우트 트리 자체를 마운트하지 않는다 — 모달 뒤에서 화면이
          // 계속 렌더되며 이펙트를 돌리는 것도, 라우트 에러가 같은 바운더리에서 이 모달을
          // 대체해 버리는 것도 막는다.
          <ForceUpdateDialog
            title={FORCE_UPDATE_TITLE}
            description={FORCE_UPDATE_DESCRIPTION}
            confirmLabel={FORCE_UPDATE_CONFIRM_LABEL}
            onConfirm={() => {
              trackForceUpdateStoreOpened();
              openAppStoreForUpdate();
            }}
          />
        ) : (
          // 앱 안 이동은 transition이라 청크가 올 때까지 이전 화면이 남는다.
          // 폴백은 새 문서로 lazy 화면을 열 때만 잠깐 보인다.
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/room/:id"
                element={import.meta.env.DEV ? <RoomPageProfiled /> : <RoomPage />}
              />
              <Route path="/room/:id/result" element={<ResultPage />} />
              <Route path="/home" element={<HomeTabPage />} />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/social" element={<SocialHomePage />} />
              {import.meta.env.DEV && (
                <Route path="/dev/webrtc-loopback" element={<WebrtcLoopbackPage />} />
              )}
              {import.meta.env.VITE_PERF_PANEL === "1" && (
                <Route path="/perf/worker-parity" element={<WorkerParityPage />} />
              )}
              <Route path="/social/code" element={<InviteCodeSharePage />} />
              <Route path="/social/join" element={<InviteCodeJoinPage />} />
              <Route path="/social/room/:roomId" element={<LiveRoomPage />} />
              <Route path="/social/room/:roomId/result" element={<ResultPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/onboarding-guide" element={<OnboardingGuidePage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/interview" element={<InterviewFormPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/licenses" element={<LicensesPage />} />
            </Routes>
          </Suspense>
        )}
      </Sentry.ErrorBoundary>
    </QueryClientProvider>
  );
}
