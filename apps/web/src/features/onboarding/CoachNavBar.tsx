import {
  GUIDE_FINAL_HINT,
  GUIDE_HINT_PREFIX,
  GUIDE_PREV_LABEL,
  GUIDE_SKIP_LABEL,
} from "./onboardingGuideSteps";
import { CoachPagerDots } from "./CoachPagerDots";
import { coachOverlay, coachRadius, GUIDE_FOCUS_COLOR } from "./coachOverlayTheme";

/**
 * 코치마크 하단 내비게이션 — 페이저 도트 + "이전" + CTA + 하단 힌트(건너뛰기).
 *
 * **제스처 대체 경로**: 탭·스와이프로만 넘길 수 있으면 안 되므로 이 버튼들은 항상 화면에 있다.
 * 버튼을 지우고 제스처만 남기지 않는다(스펙 접근성 요건).
 *
 * 버튼 두 개를 공용 CTA 버튼 컴포넌트에 합치지 않고 여기 co-locate 한 이유: 이 변형은 **다크
 * 오버레이 위 전용**(Dark SM 48h·r14)이고, 배경색이 `state/focus` 라이트/다크 미확정 이슈에
 * 묶여 있다(`coachOverlayTheme.ts` 참고). 지금 공용 컴포넌트로 올리면 이 화면 한정 미결
 * 사항이 공용 레이어로 새어나간다 — 다른 화면에서 같은 변형이 필요해지는 시점에 승격한다
 * (루트 CLAUDE.md "과도한 추상화 금지").
 *
 * (`apps/mobile/components/onboarding/CoachNavBar.tsx`에서 이식 — BY-334 온보딩 웹 이관.
 * `Pressable(accessibilityRole="button")`는 `<button type="button">`으로 옮겼다. RN `hitSlop`은
 * CSS `padding` + 같은 크기의 음수 `margin`으로 옮겼다(건너뛰기 버튼 참고) — 레이아웃이
 * 차지하는 공간은 그대로 두고 히트박스만 넓히는 방식이라 웹에도 대응 개념이 있다.
 * `accessibilityHint`는 웹에 대응 개념이 없어 생략한다(`MonthCalendar` 웹 이식과
 * 같은 판단 — `SettingsRow` 웹 이식도 `accessibilityHint`를 옮기지 않았다).)
 */

/** Figma `Button / Ghost Dark SM`(node 47:140) — 66×48. */
function CoachGhostButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={GUIDE_PREV_LABEL}
      // 첫 스텝에서는 눌러도 아무 일이 없다는 사실이 스크린 리더에도 드러나야 한다.
      disabled={disabled}
      className="flex flex-col items-center justify-center border text-[15px] font-semibold leading-[18px]"
      style={{
        width: 66,
        height: 48,
        color: coachOverlay.ghostLabel,
        backgroundColor: coachOverlay.ghostBg,
        borderColor: coachOverlay.ghostBorder,
        borderRadius: coachRadius.button,
        // G1(첫 스텝)에서는 시각적으로도 비활성이 드러나야 한다(2026-07-29 확정) — 이전에는
        // accessibilityState로만 표시돼 G2~와 겉모습이 같았다.
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {GUIDE_PREV_LABEL}
    </button>
  );
}

/** Figma `Button / CTA`의 Dark SM 변형 — 높이 48·r14, 너비는 남는 폭을 채운다(Figma 288). */
function CoachCtaButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex flex-1 flex-col items-center justify-center text-[15px] font-semibold leading-[18px] text-white"
      style={{
        height: 48,
        backgroundColor: GUIDE_FOCUS_COLOR,
        borderRadius: coachRadius.button,
      }}
    >
      {label}
    </button>
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
    <div className="px-5">
      <div className="flex flex-col items-center">
        <CoachPagerDots stepIndex={stepIndex} />
      </div>

      <div className="mt-[19px] flex flex-row items-center gap-2">
        <CoachGhostButton onClick={onPrev} disabled={isFirstStep} />
        <CoachCtaButton label={ctaLabel} onClick={onNext} />
      </div>

      {skippable ? (
        // Figma에서는 한 줄 텍스트지만 "건너뛰기"만 눌려야 하고, 그 탭 영역이 12px 텍스트
        // 높이(14px)에 그치면 접근성 기준(44×44) 미달이다. RN은 `hitSlop`으로 탭 영역만
        // 넓혔다 — 웹은 padding으로 히트박스를 키우고 같은 크기의 음수 margin으로 레이아웃이
        // 차지하는 공간을 되돌려 같은 효과를 낸다(14 + 15 + 15 = 44).
        // 시각적 위치·문구는 Figma 그대로다(`GUIDE_HINT_PREFIX + GUIDE_SKIP_LABEL`).
        <div className="mt-[14px] flex flex-row flex-wrap items-center justify-center">
          <span
            className="text-center text-[12px] leading-[14px]"
            style={{ color: coachOverlay.bottomHint }}
          >
            {GUIDE_HINT_PREFIX}
          </span>
          <button
            type="button"
            onClick={onSkip}
            aria-label={GUIDE_SKIP_LABEL}
            className="-m-[15px] p-[15px] text-center text-[12px] leading-[14px]"
            style={{ color: coachOverlay.bottomHint }}
          >
            {GUIDE_SKIP_LABEL}
          </button>
        </div>
      ) : (
        <p
          className="mt-[14px] text-center text-[12px] leading-[14px]"
          style={{ color: coachOverlay.bottomHint }}
        >
          {GUIDE_FINAL_HINT}
        </p>
      )}
    </div>
  );
}
