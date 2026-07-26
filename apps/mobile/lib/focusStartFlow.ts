import { runCameraPermissionGate } from "./cameraPermissionGate";
import type { OnboardingGuideEntry } from "./onboardingGuideSteps";
import { hasSeenOnboardingGuide, markOnboardingGuideSeen } from "./onboardingGuideStore";

/**
 * "집중 시작" 플로우 오케스트레이션
 * (`frontend/docs/screens/SCR-G1-G5-onboarding-guide.md` Interaction Contract §3).
 *
 * 2026-07-26 인터뷰 6차 확정 문장 그대로:
 *
 * > 집중 시작 → 가이드(G1~G5) → G5 CTA 또는 건너뛰기 → 카메라 권한 요청(최초 1회) → 세션 시작.
 * > **건너뛰어도 세션은 이어서 시작.**
 *
 * 각 화면은 자기 다음 단계를 직접 호출하지 않는다 — 가이드는 "끝났다"만 알리고, 이 모듈이
 * 다음 단계를 정한다. 홈(S1)과 가이드 라우트 두 곳에서 같은 규칙을 써야 해서 한 군데 모았다.
 *
 * 네비게이션은 주입받는다(`expo-router`를 import하지 않는다) — 순수 분기라 테스트 가능하고,
 * `lib/`은 화면에 의존하지 않는다는 기존 관례(`cameraPermissionGate.ts`)를 지킨다.
 */

export type FocusStartNavigator = {
  /** 온보딩 가이드(G1~G5) 플로우를 연다. */
  openOnboardingGuide(entry: OnboardingGuideEntry): void;
  /** S2-3 권한 거부 안내로 보낸다. */
  showPermissionDeniedGuide(): void;
  /**
   * 싱글룸 세션(S3-1)을 시작한다.
   * 세션 라우트는 WG 계열(`apps/web`) 완료 전까지 존재하지 않는다 — 호출부는 존재하지 않는
   * 경로로 이동을 시도하지 말고 아무것도 하지 않아야 한다.
   */
  startSession(): void;
};

/** 권한 게이트를 돌려 목적지 두 곳 중 하나로 보낸다. 게이트는 fail-closed다. */
async function runPermissionStep(
  nav: Pick<FocusStartNavigator, "showPermissionDeniedGuide" | "startSession">,
): Promise<void> {
  if ((await runCameraPermissionGate()) === "show-denied-guide") {
    nav.showPermissionDeniedGuide();
    return;
  }
  nav.startSession();
}

/**
 * S1 홈의 "집중 시작" 탭 진입점.
 *
 * 가이드를 아직 안 봤으면 가이드를 먼저 띄우고 여기서 끝낸다(가이드 종료 후
 * `continueAfterOnboardingGuide()`가 이어받는다). 이미 봤으면 곧장 권한 게이트로 간다.
 */
export async function runFocusStartFlow(nav: FocusStartNavigator): Promise<void> {
  if (!(await hasSeenOnboardingGuide())) {
    nav.openOnboardingGuide("focus-start");
    return;
  }
  await runPermissionStep(nav);
}

/**
 * 가이드 플로우가 끝났을 때(G5 CTA 완료 · 건너뛰기 **둘 다**) 이어지는 단계.
 *
 * 완료와 건너뛰기가 여기서 갈라지지 않는 것이 6차 확정 사항의 핵심이다 — 그래서 종료 이유를
 * 인자로 받지 않는다. 갈리는 것은 종료 이유가 아니라 **진입 출처**다.
 *
 * ⚠️ 진입 경로 B·C(홈 가이드 카드 · 설정 › 측정 기준 안내)에서 G5 "집중 시작하기"를 눌렀을 때
 * 세션을 시작하는지, 가이드만 닫고 원래 화면으로 돌아가는지는 **미정이다**. 6차 인터뷰는
 * "홈 가이드 카드·설정 진입점은 유지"라고만 했다. CTA 문구가 "집중 시작하기"라 세션 시작이
 * 자연스러워 보이지만 임의로 확정하지 않는다 — 지금은 가이드만 닫는다(부수효과 없는 쪽).
 * TODO(SCR-G1-G5-onboarding-guide.md Review Checklist): 재진입 CTA 동작 확정 후 이 분기 교체.
 */
export async function continueAfterOnboardingGuide(
  nav: Pick<FocusStartNavigator, "showPermissionDeniedGuide" | "startSession">,
  entry: OnboardingGuideEntry,
): Promise<void> {
  // 완료·건너뛰기 어느 쪽이든 "봤다"로 기록한다. 건너뛰기를 "안 본 것"으로 두면 다음
  // '집중 시작'에서 가이드가 다시 떠 확정 플로우와 어긋난다(스펙 Data Contract).
  // 재진입(B·C)에서는 이미 true라 값이 바뀌지 않는다 — 멱등이라 그대로 호출한다.
  await markOnboardingGuideSeen();

  if (entry !== "focus-start") {
    return;
  }
  await runPermissionStep(nav);
}
