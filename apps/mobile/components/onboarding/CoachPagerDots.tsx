import { View } from "react-native";

import { guideProgressLabel, ONBOARDING_GUIDE_STEP_COUNT } from "../../lib/onboardingGuideSteps";
import { coachOverlay, coachRadius, GUIDE_FOCUS_COLOR } from "./coachOverlayTheme";

/**
 * 코치마크 페이지 인디케이터 — Figma 공용 컴포넌트 `Coach / Pager Dots`(node 47:137).
 * 활성 16×4 바 + 비활성 4px 도트 × 4.
 *
 * **도트 자체는 장식이다.** 진행 상태를 색·크기로만 전달하면 안 되므로(`design.md` "색상 단독
 * 전달 금지") 컨테이너에 "5단계 중 N단계"를 `accessibilityLabel`로 함께 준다 — 개별 도트는
 * 스크린 리더에 노출하지 않는다.
 *
 * ⚠️ 활성 바 색: Figma 실측은 `#3182f6`(= `brand/primary` 다크값)인데 스펙의 토큰 표는 이 바를
 * `colors.state.focus`로 적었다. 화면 안에서 CTA와 같은 파랑으로 보여야 자연스러워 스펙을 따르되
 * (`GUIDE_FOCUS_COLOR`), 괴리는 기록해 둔다 — `state/focus` 값 확정 시 함께 재확인한다.
 */
export function CoachPagerDots({ stepIndex }: { stepIndex: number }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={guideProgressLabel(stepIndex)}
      accessibilityValue={{ min: 1, max: ONBOARDING_GUIDE_STEP_COUNT, now: stepIndex + 1 }}
      className="flex-row items-center gap-[5px]"
    >
      {Array.from({ length: ONBOARDING_GUIDE_STEP_COUNT }, (_, index) =>
        index === stepIndex ? (
          <View
            key={index}
            style={{
              width: 16,
              height: 4,
              borderRadius: coachRadius.full,
              backgroundColor: GUIDE_FOCUS_COLOR,
            }}
          />
        ) : (
          <View
            key={index}
            style={{
              width: 4,
              height: 4,
              borderRadius: coachRadius.full,
              backgroundColor: coachOverlay.pagerInactive,
            }}
          />
        ),
      )}
    </View>
  );
}
