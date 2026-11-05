import { lazy, Profiler, Suspense, useEffect } from "react";
import type { ProfilerOnRenderCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import * as Sentry from "@sentry/react";

import { ErrorFallback } from "@/components/ErrorFallback";
import { Toaster } from "@/components/ui/sonner";
import { ForceUpdateDialog } from "@/features/force-update/components/ForceUpdateDialog";
import { useForceUpdateGate } from "@/features/force-update/useForceUpdateGate";
import { useRecordLastHidden } from "@/features/interview/useRecordLastHidden";
import { GroupLoginGate } from "@/features/login/GroupLoginGate";
import { trackForceUpdateStoreOpened } from "@/lib/amplitude";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import { reloadOnChunkError } from "@/lib/chunkReload";
import { useNativeControlPressRelay } from "@/lib/glassChrome";
import { useBlockForwardGestureIntoFullScreen } from "@/lib/historyGuard";
import { useInAppNotificationRelay } from "@/lib/inAppNotification";
import { useNativeAnalyticsRelay } from "@/lib/nativeAnalytics";
import { toastBottomOffset, useNativeTabBarClass, useNativeTabBarSync } from "@/lib/nativeTabBar";
import { useNativeRouteReset } from "@/lib/nativeRouteReset";
import { useNativeScreenReport } from "@/lib/nativeScreenReport";
import { useLaunchReadyOutsideHome } from "@/lib/launchReady";
import { useNativeSessionClosed } from "@/lib/nativeSessionClosed";
import { useNativeShellClass } from "@/lib/nativeShell";
import { usePageTransitionCommit } from "@/lib/pageTransition";
import { queryClient } from "@/lib/queryClient";
import { dismissToast } from "@/lib/toast";
import { HomePage } from "@/routes/HomePage";
import { HomeTabPage } from "@/routes/HomeTabPage";
import { OnboardingPage } from "@/routes/OnboardingPage";
import { DownloadPage } from "@/routes/DownloadPage";
import { InviteCodeSharePage } from "@/routes/InviteCodeSharePage";
import { InviteJoinRoute } from "@/routes/InviteJoinRoute";
import {
  loadAppLockSettingsPage,
  loadApplyPage,
  loadBlockListPage,
  loadContactPage,
  loadGroupApplicationsPage,
  loadGroupFormPage,
  loadGroupHomePage,
  loadGroupMembersPage,
  loadInterviewFormPage,
  loadLicensesPage,
  loadPrivacyPage,
  loadProfilePage,
  loadPublicGroupPage,
  loadRankingRecordsPage,
  loadReportApplicationPage,
  loadResultPage,
  loadTermsPage,
  loadTimelapseSettingsPage,
  loadTimelapsesPage,
} from "@/routes/lazyRoutes";
import { ManualRecordPage } from "@/routes/ManualRecordPage";
import { PlannerPage } from "@/routes/PlannerPage";
import { RankingPage } from "@/routes/RankingPage";
import { RecordsPage } from "@/routes/RecordsPage";
import { RoomPage } from "@/routes/RoomPage";
import { SessionGuidePage } from "@/routes/SessionGuidePage";
import { SettingsPage } from "@/routes/SettingsPage";
import { SocialTabRoute } from "@/routes/SocialTabRoute";

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
const GroupRoomPage = lazy(
  reloadOnChunkError(() =>
    import("@/routes/GroupRoomPage").then((module) => ({ default: module.GroupRoomPage })),
  ),
);
const LiveRoomPage = lazy(
  reloadOnChunkError(() =>
    import("@/routes/LiveRoomPage").then((module) => ({ default: module.LiveRoomPage })),
  ),
);
const ProfilePage = lazy(
  reloadOnChunkError(() => loadProfilePage().then((module) => ({ default: module.ProfilePage }))),
);
/**
 * 삭제한 온보딩 가이드의 예전 주소
 *
 * 앱의 화면 복원·푸시·구버전 앱이 아직 이 주소를 연다.
 * 구 앱 문서는 신원을 `?userId=N`에서 읽으므로 쿼리를 들고 홈으로 보낸다.
 * `entry`는 삭제한 가이드만 읽던 값이라 뺀다.
 * 모든 출시 앱에서 이 주소가 사라지면 이 리다이렉트를 삭제한다.
 */
function OnboardingGuideRedirect() {
  const params = new URLSearchParams(useLocation().search);
  params.delete("entry");
  const rest = params.toString();
  const search = rest === "" ? "" : `?${rest}`;
  return <Navigate to={{ pathname: "/home", search }} replace />;
}
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
const TimelapseSettingsPage = lazy(
  reloadOnChunkError(() =>
    loadTimelapseSettingsPage().then((module) => ({ default: module.TimelapseSettingsPage })),
  ),
);
const AppLockSettingsPage = lazy(
  reloadOnChunkError(() =>
    loadAppLockSettingsPage().then((module) => ({ default: module.AppLockSettingsPage })),
  ),
);
const TimelapsesPage = lazy(
  reloadOnChunkError(() =>
    loadTimelapsesPage().then((module) => ({ default: module.TimelapsesPage })),
  ),
);
const RankingRecordsPage = lazy(
  reloadOnChunkError(() =>
    loadRankingRecordsPage().then((module) => ({ default: module.RankingRecordsPage })),
  ),
);
// 그룹 탭과 참여 화면 말고 그룹 화면은 그룹을 쓰는 사람만 열어서 따로 받는다.
const GroupHomePage = lazy(
  reloadOnChunkError(() =>
    loadGroupHomePage().then((module) => ({ default: module.GroupHomePage })),
  ),
);
const GroupMembersPage = lazy(
  reloadOnChunkError(() =>
    loadGroupMembersPage().then((module) => ({ default: module.GroupMembersPage })),
  ),
);
const GroupApplicationsPage = lazy(
  reloadOnChunkError(() =>
    loadGroupApplicationsPage().then((module) => ({ default: module.GroupApplicationsPage })),
  ),
);
const ReportApplicationPage = lazy(
  reloadOnChunkError(() =>
    loadReportApplicationPage().then((module) => ({ default: module.ReportApplicationPage })),
  ),
);
const PublicGroupPage = lazy(
  reloadOnChunkError(() =>
    loadPublicGroupPage().then((module) => ({ default: module.PublicGroupPage })),
  ),
);
const ApplyPage = lazy(
  reloadOnChunkError(() => loadApplyPage().then((module) => ({ default: module.ApplyPage }))),
);
const GroupFormPage = lazy(
  reloadOnChunkError(() =>
    loadGroupFormPage().then((module) => ({ default: module.GroupFormPage })),
  ),
);
const BlockListPage = lazy(
  reloadOnChunkError(() =>
    loadBlockListPage().then((module) => ({ default: module.BlockListPage })),
  ),
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
// 지연 받기를 만드는 일 자체를 개발 빌드로 막아야 운영 빌드에 화면 모음과 고정 데이터 묶음이 생기지 않는다.
const DevGroupRoomsPage = import.meta.env.DEV
  ? lazy(() =>
      import("@/routes/DevGroupRoomsPage").then((module) => ({
        default: module.DevGroupRoomsPage,
      })),
    )
  : null;

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
  return (
    // 그룹 화면의 안내 토스트에는 그룹 이름이 들어가서 Amplitude 클릭 자동 수집이 토스트 글자를 싣지 않게 가린다.
    // Sonner는 이 속성을 넘겨받지 않아서 배치에 영향이 없는 `contents` 상자로 감싸 단다.
    <div data-amp-mask className="contents">
      <Toaster bottom={bottom} />
    </div>
  );
}

export function App() {
  const { t } = useTranslation("force-update");
  useRecordLastHidden();
  // 슬라이드 전환의 갱신 콜백이 라우트 커밋 시점에 풀리게 한다. Routes의 형제로 마운트해야
  // 한다(lib/pageTransition.ts). 라우트 엘리먼트 안에 두면 이동과 함께 언마운트돼 새 위치를
  // 못 본다.
  usePageTransitionCommit();
  // 전체 화면 라우트에서 네이티브 탭 바를 감춘다 — 웹 라우팅은 네이티브 스택을 건너지 않으므로
  // 알려주지 않으면 탭 바가 그대로 남는다(`lib/nativeTabBar.ts`).
  useNativeTabBarSync();
  // 네이티브 glass 부품의 누름을 그 부품을 선언한 화면의 처리기로 넘긴다(`lib/glassChrome.ts`).
  useNativeControlPressRelay();
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
  // 앱을 쓰는 중에 온 그룹 알림을 토스트로 보인다(`lib/inAppNotification.ts`).
  // 앱은 준비 신호를 보낸 문서에만 알림을 보내므로 그 신호를 보내는 아래 훅보다 먼저 구독한다.
  useInAppNotificationRelay();
  // 네이티브가 관측한 사용자 이벤트(탭 터치·권한 게이트 등)를 Amplitude로 넘긴다(`lib/nativeAnalytics.ts`).
  useNativeAnalyticsRelay();
  // 세션 모달이 닫히면 통계를 다시 받게 표시한다(lib/nativeSessionClosed.ts).
  useNativeSessionClosed();
  // 홈 밖의 화면으로 시작한 문서는 바로 앱 스플래시를 걷게 한다(`lib/launchReady.ts`).
  useLaunchReadyOutsideHome();
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
            title={t("title")}
            description={t("description")}
            confirmLabel={t("confirm")}
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
              <Route path="/onboarding" element={<OnboardingPage />} />
              <Route path="/session-guide" element={<SessionGuidePage />} />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/ranking" element={<RankingPage />} />
              <Route path="/ranking/records" element={<RankingRecordsPage />} />
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/manual-record" element={<ManualRecordPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/social" element={<SocialTabRoute />} />
              <Route element={<GroupLoginGate entry="group" />}>
                <Route path="/social/groups/new" element={<GroupFormPage mode="create" />} />
                <Route path="/social/groups/:groupId" element={<GroupHomePage />} />
                <Route
                  path="/social/groups/:groupId/settings"
                  element={<GroupFormPage mode="edit" />}
                />
                <Route path="/social/groups/:groupId/members" element={<GroupMembersPage />} />
                <Route path="/social/groups/:groupId/room" element={<GroupRoomPage />} />
                <Route path="/social/groups/:groupId/room/result" element={<ResultPage />} />
                <Route
                  path="/social/groups/:groupId/applications"
                  element={<GroupApplicationsPage />}
                />
                <Route
                  path="/social/groups/:groupId/applications/:applicationId/report"
                  element={<ReportApplicationPage />}
                />
                <Route path="/social/public/:groupId" element={<PublicGroupPage />} />
                <Route path="/social/public/:groupId/apply" element={<ApplyPage />} />
              </Route>
              {import.meta.env.DEV && (
                <Route path="/dev/webrtc-loopback" element={<WebrtcLoopbackPage />} />
              )}
              {DevGroupRoomsPage !== null && (
                <Route path="/dev/group-rooms" element={<DevGroupRoomsPage />} />
              )}
              {import.meta.env.VITE_PERF_PANEL === "1" && (
                <Route path="/perf/worker-parity" element={<WorkerParityPage />} />
              )}
              <Route path="/social/code" element={<InviteCodeSharePage />} />
              <Route path="/social/join" element={<InviteJoinRoute />} />
              {/* 공유 본문의 설치 링크. 받는 사람이 새 문서로 바로 여는 화면이라 지연 로딩하지 않는다. */}
              <Route path="/download" element={<DownloadPage />} />
              <Route path="/social/room/:roomId" element={<LiveRoomPage />} />
              <Route path="/social/room/:roomId/result" element={<ResultPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/onboarding-guide" element={<OnboardingGuideRedirect />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/interview" element={<InterviewFormPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/licenses" element={<LicensesPage />} />
              <Route path="/timelapse-settings" element={<TimelapseSettingsPage />} />
              <Route path="/app-lock-settings" element={<AppLockSettingsPage />} />
              <Route path="/blocks" element={<BlockListPage />} />
              <Route path="/timelapses" element={<TimelapsesPage />} />
            </Routes>
          </Suspense>
        )}
      </Sentry.ErrorBoundary>
    </QueryClientProvider>
  );
}
