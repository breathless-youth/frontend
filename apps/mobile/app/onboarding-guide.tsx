import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback } from "react";

import { OnboardingGuideFlow } from "../components/onboarding/OnboardingGuideFlow";
import { continueAfterOnboardingGuide } from "../lib/focusStartFlow";
import { parseOnboardingGuideEntry } from "../lib/onboardingGuideSteps";

/**
 * G1~G5 온보딩 가이드 — 스펙 `frontend/docs/screens/SCR-G1-G5-onboarding-guide.md`.
 * Figma `68:902`·`68:976`·`68:1057`·`68:1118`·`68:1285`.
 *
 * **라우트는 하나다.** 5개 스텝은 `OnboardingGuideFlow`의 상태이지 별도 화면이 아니다.
 * 진입 경로는 `entry` 파라미터로 구분한다:
 *   - `focus-start` — S1 홈 "집중 시작" 최초 탭(종료 후 카메라 권한 요청으로 이어짐)
 *   - `home-card` — S1 홈 "공부 측정 가이드" 카드(다시 보기)
 *   - `settings` — S6 설정 "측정 기준 안내"(다시 보기, MG4가 연결)
 *
 * 탭 바가 없는 전체 화면이라 `app/(tabs)/` 밖에 둔다.
 */
export default function OnboardingGuideScreen() {
  const { entry: entryParam } = useLocalSearchParams<{ entry?: string }>();
  const entry = parseOnboardingGuideEntry(entryParam);

  const closeGuide = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  }, []);

  /**
   * 완료(G5 CTA)와 건너뛰기가 **여기서 갈라지지 않는다** — 2026-07-26 확정
   * "건너뛰어도 세션은 이어서 시작". 그래서 종료 이유를 보지 않는다.
   *
   * 가이드를 먼저 닫고 다음 단계로 넘긴다. `continueAfterOnboardingGuide()`가 저장소 쓰기를
   * `await`하며 한 틱 양보하므로, 닫기 전환이 끝난 뒤에 다음 화면 이동이 일어난다.
   */
  const handleFinish = useCallback(() => {
    closeGuide();
    void continueAfterOnboardingGuide(
      {
        showPermissionDeniedGuide: () => router.push("/permission-denied"),
        startSession: () => {
          router.push("/room/1");
        },
      },
      entry,
    ).catch((error: unknown) => {
      // 여기까지 오면 화면 전환이 실패한 경우다. 어떤 경우에도 세션을 시작하지 않는다.
      console.warn("[onboarding-guide] 가이드 종료 후 처리 실패", error);
    });
  }, [closeGuide, entry]);

  return (
    <>
      {/*
        이 플로우는 시스템 테마와 무관하게 항상 다크 배경이다 — 루트의 `style="auto"`를
        덮어써 상태 바 아이콘을 밝게 유지한다(라이트 모드 기기에서 검은 아이콘이 묻힌다).
      */}
      <StatusBar style="light" />
      {/*
        ⚠️ 시스템 뒤로가기(Android 하드웨어 백 / iOS 스와이프 백) 처리는 미정이다.
        "건너뛰기와 동일 처리"가 자연스러워 보이지만 근거 문서가 없어 임의로 확정하지 않는다 —
        지금은 플랫폼 기본 동작(라우트만 닫힘: 플래그도 세우지 않고 권한 요청도 하지 않음)에
        맡긴다. 부수효과가 전혀 없는 쪽이라 나중에 어느 쪽으로 확정되든 되돌리기 쉽다.
        TODO(SCR-G1-G5-onboarding-guide.md Review Checklist): 시스템 뒤로가기 처리 확정 필요.
      */}
      <OnboardingGuideFlow onFinish={handleFinish} />
    </>
  );
}
