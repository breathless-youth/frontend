import { whenIdle } from "@/lib/whenIdle";

/**
 * lazy 화면 청크 로더
 *
 * `App.tsx`의 lazy 라우트와 미리 받기가 같은 함수를 불러 같은 청크를 가리키게 한다.
 * 미리 받기는 최적화일 뿐이라 실패해도 삼키고, 화면에 들어갈 때 lazy 라우트가 다시 받는다.
 */
export const loadResultPage = () => import("./ResultPage");
export const loadOnboardingGuidePage = () => import("./OnboardingGuidePage");
export const loadProfilePage = () => import("./ProfilePage");
export const loadTermsPage = () => import("./TermsPage");
export const loadPrivacyPage = () => import("./PrivacyPage");
export const loadLicensesPage = () => import("./LicensesPage");
export const loadContactPage = () => import("./ContactPage");
export const loadInterviewFormPage = () => import("./InterviewFormPage");

/** 공부를 끝낼 때 네트워크가 끊겨도 결과 화면이 열리도록 세션 중에 미리 받는다. */
export function prefetchResultPage(): void {
  whenIdle(() => void loadResultPage().catch(() => {}));
}

/**
 * 가이드 화면 미리 받기
 *
 * 홈의 "집중 시작"이 슬라이드 전환으로 가이드를 연다.
 * 전환은 새 화면 커밋을 잠시만 기다리므로 청크가 그 안에 와 있어야 전환이 끊기지 않는다.
 */
export function prefetchOnboardingGuidePage(): void {
  whenIdle(() => void loadOnboardingGuidePage().catch(() => {}));
}

/**
 * 설정 하위 화면 미리 받기
 *
 * 슬라이드 전환으로 여는 화면은 가이드 화면과 같은 이유로 미리 받는다.
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
    ]) {
      void load().catch(() => {});
    }
  });
}
