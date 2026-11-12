import { whenIdle } from "@/lib/whenIdle";

/**
 * lazy 화면 청크 로더
 *
 * `App.tsx`의 lazy 라우트와 미리 받기가 같은 함수를 불러 같은 청크를 가리키게 한다.
 * 미리 받기는 최적화일 뿐이라 실패해도 삼키고, 화면에 들어갈 때 lazy 라우트가 다시 받는다.
 */
export const loadResultPage = () => import("./ResultPage");
export const loadProfilePage = () => import("./ProfilePage");
export const loadTermsPage = () => import("./TermsPage");
export const loadPrivacyPage = () => import("./PrivacyPage");
export const loadLicensesPage = () => import("./LicensesPage");
export const loadContactPage = () => import("./ContactPage");
export const loadContactChatPage = () => import("./ContactChatPage");
export const loadInterviewFormPage = () => import("./InterviewFormPage");
export const loadTimelapseSettingsPage = () => import("./TimelapseSettingsPage");
export const loadAppLockSettingsPage = () => import("./AppLockSettingsPage");
export const loadTimelapsesPage = () => import("./TimelapsesPage");
export const loadRankingRecordsPage = () => import("./RankingRecordsPage");
export const loadGroupHomePage = () => import("./GroupHomePage");
export const loadGroupMembersPage = () => import("./GroupMembersPage");
export const loadGroupApplicationsPage = () => import("./GroupApplicationsPage");
export const loadReportApplicationPage = () => import("./ReportApplicationPage");
export const loadPublicGroupPage = () => import("./PublicGroupPage");
export const loadApplyPage = () => import("./ApplyPage");
export const loadGroupFormPage = () => import("./GroupFormPage");
export const loadBlockListPage = () => import("./BlockListPage");

/** 공부를 끝낼 때 네트워크가 끊겨도 결과 화면이 열리도록 세션 중에 미리 받는다. */
export function prefetchResultPage(): void {
  whenIdle(() => void loadResultPage().catch(() => {}));
}

/**
 * 설정 하위 화면 미리 받기
 *
 * 슬라이드 전환은 새 화면 커밋을 잠시만 기다리므로, 그 전환으로 여는 화면은 청크를 미리 받아 둔다.
 * 문서 이동으로 여는 문의 화면은 새 문서가 이 청크를 HTTP 캐시에서 가져간다.
 */
export function prefetchSettingsSubPages(): void {
  whenIdle(() => {
    for (const load of [
      loadProfilePage,
      loadTermsPage,
      loadPrivacyPage,
      loadLicensesPage,
      loadContactPage,
      loadTimelapseSettingsPage,
      loadAppLockSettingsPage,
    ]) {
      void load().catch(() => {});
    }
  });
}

/**
 * 타임랩스 전체 목록 미리 받기
 *
 * 홈 `더보기`가 슬라이드 전환으로 전체 목록을 연다. 전환이 청크를 기다리지 않게 미리 받는다.
 */
export function prefetchTimelapsesPage(): void {
  whenIdle(() => void loadTimelapsesPage().catch(() => {}));
}

/**
 * 차단 목록 미리 받기
 *
 * 설정의 차단 목록 줄이 슬라이드 전환으로 연다.
 * 줄은 그룹 공부방을 여는 앱에만 있어서 다른 설정 하위 화면과 따로 받는다.
 */
export function prefetchBlockListPage(): void {
  whenIdle(() => void loadBlockListPage().catch(() => {}));
}

/**
 * 그룹 하위 화면 미리 받기
 *
 * 그룹 홈과 그 하위 화면은 슬라이드 전환으로 열려서, 전환이 청크를 기다리지 않게 그룹 탭에서 미리 받는다.
 */
export function prefetchGroupPages(): void {
  whenIdle(() => {
    for (const load of [
      loadGroupHomePage,
      loadGroupMembersPage,
      loadGroupApplicationsPage,
      loadReportApplicationPage,
      loadPublicGroupPage,
      loadApplyPage,
      loadGroupFormPage,
    ]) {
      void load().catch(() => {});
    }
  });
}
