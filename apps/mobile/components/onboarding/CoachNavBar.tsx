import { Pressable, Text, View } from "react-native";

import {
  GUIDE_FINAL_HINT,
  GUIDE_HINT_PREFIX,
  GUIDE_PREV_LABEL,
  GUIDE_SKIP_LABEL,
} from "../../lib/onboardingGuideSteps";
import { CoachPagerDots } from "./CoachPagerDots";
import { coachOverlay, coachRadius, GUIDE_FOCUS_COLOR } from "./coachOverlayTheme";

/**
 * 코치마크 하단 내비게이션 — 페이저 도트 + "이전" + CTA + 하단 힌트(건너뛰기).
 *
 * **제스처 대체 경로**: 탭·스와이프로만 넘길 수 있으면 안 되므로 이 버튼들은 항상 화면에 있다.
 * 버튼을 지우고 제스처만 남기지 않는다(스펙 접근성 요건).
 *
 * 버튼 두 개를 `components/PrimaryCtaButton.tsx`(Figma `Button / CTA`의 LG 변형)에 합치지
 * 않고 여기 co-locate 한 이유: 이 변형은 **다크 오버레이 위 전용**(Dark SM 48h·r14)이고,
 * 배경색이 `state/focus` 라이트/다크 미확정 이슈에 묶여 있다(`coachOverlayTheme.ts` 참고).
 * 지금 공용 컴포넌트로 올리면 이 화면 한정 미결 사항이 공용 레이어로 새어나간다 —
 * 다른 화면에서 같은 변형이 필요해지는 시점에 승격한다(루트 CLAUDE.md "과도한 추상화 금지").
 */

/** Figma `Button / Ghost Dark SM`(node 47:140) — 66×48. */
function CoachGhostButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={GUIDE_PREV_LABEL}
      // 첫 스텝에서는 눌러도 아무 일이 없다는 사실이 스크린 리더에도 드러나야 한다.
      accessibilityState={{ disabled }}
      className="items-center justify-center border"
      style={{
        width: 66,
        height: 48,
        backgroundColor: coachOverlay.ghostBg,
        borderColor: coachOverlay.ghostBorder,
        borderRadius: coachRadius.button,
      }}
    >
      <Text
        className="text-[15px] font-semibold leading-[18px]"
        style={{ color: coachOverlay.ghostLabel }}
      >
        {GUIDE_PREV_LABEL}
      </Text>
    </Pressable>
  );
}

/** Figma `Button / CTA`의 Dark SM 변형 — 높이 48·r14, 너비는 남는 폭을 채운다(Figma 288). */
function CoachCtaButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 items-center justify-center"
      style={{
        height: 48,
        backgroundColor: GUIDE_FOCUS_COLOR,
        borderRadius: coachRadius.button,
      }}
    >
      <Text className="text-[15px] font-semibold leading-[18px] text-white">{label}</Text>
    </Pressable>
  );
}

export function CoachNavBar({
  stepIndex,
  ctaLabel,
  skippable,
  isFirstStep,
  onPrev,
  onNext,
  onSkip,
}: {
  stepIndex: number;
  ctaLabel: string;
  /** 하단 힌트 안에 "건너뛰기"가 있는가(G1~G4만). */
  skippable: boolean;
  isFirstStep: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <View className="px-5">
      <View className="items-center">
        <CoachPagerDots stepIndex={stepIndex} />
      </View>

      <View className="mt-[19px] flex-row items-center gap-2">
        <CoachGhostButton onPress={onPrev} disabled={isFirstStep} />
        <CoachCtaButton label={ctaLabel} onPress={onNext} />
      </View>

      {skippable ? (
        // Figma에서는 한 줄 텍스트지만 "건너뛰기"만 눌려야 하고, 그 탭 영역이 12px 텍스트
        // 높이(14px)에 그치면 접근성 기준(44×44) 미달이다 — hitSlop으로 넓힌다.
        // 시각적 위치·문구는 Figma 그대로다(`GUIDE_HINT_PREFIX + GUIDE_SKIP_LABEL`).
        <View className="mt-[14px] flex-row flex-wrap items-center justify-center">
          <Text
            className="text-center text-[12px] leading-[14px]"
            style={{ color: coachOverlay.bottomHint }}
          >
            {GUIDE_HINT_PREFIX}
          </Text>
          <Pressable
            onPress={onSkip}
            accessibilityRole="button"
            accessibilityLabel={GUIDE_SKIP_LABEL}
            accessibilityHint="안내를 건너뛰고 다음 단계로 넘어가요"
            hitSlop={{ top: 15, bottom: 15, left: 16, right: 16 }}
          >
            <Text
              className="text-center text-[12px] leading-[14px]"
              style={{ color: coachOverlay.bottomHint }}
            >
              {GUIDE_SKIP_LABEL}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text
          className="mt-[14px] text-center text-[12px] leading-[14px]"
          style={{ color: coachOverlay.bottomHint }}
        >
          {GUIDE_FINAL_HINT}
        </Text>
      )}
    </View>
  );
}
