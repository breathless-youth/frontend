import type { CoachTooltipContent } from "./onboardingGuideSteps";
import { CoachTooltipTail } from "./coachIcons";
import { coachOverlay, coachRadius, coachTokenColors } from "./coachOverlayTheme";

/**
 * 코치마크 말풍선 — Figma 공용 컴포넌트 `Coach / Tooltip`(node 47:101).
 *
 * 꼬리 방향(`tail`)은 툴팁이 강조 대상의 **위**에 있는지 **아래**에 있는지를 뜻한다.
 * `bottom`(G1·G2·G4) = 카드 아래에 아래를 가리키는 꼬리, `top`(G3) = 카드 위에 위를 가리키는 꼬리.
 *
 * Figma 실측 높이(98/117/92/98)는 **고정값이 아니라 최소값**이다 — 시스템 폰트가 커져
 * 본문이 2~4줄로 늘어나도 카드가 잘리지 않아야 한다(스펙 접근성 요건). 그래서 높이를
 * 지정하지 않고 내용에 따라 늘어나게 둔다.
 *
 * 탭으로 다음 스텝 이동이 가능해야 해서 `pointer-events-none`으로 클릭을 아래 탭 레이어에
 * 흘려보낸다 — 스크린 리더 노출에는 영향이 없다.
 *
 * (`apps/mobile/components/onboarding/CoachTooltip.tsx`에서 이식 — BY-334 온보딩 웹 이관.
 * `accessibilityRole="header"`는 `<h2>`로 옮겼다(카드 레벨 제목 — `MonthCalendar`·
 * `ResultCardParts`와 같은 판단).)
 */
export function CoachTooltip({ title, body, tail }: CoachTooltipContent) {
  const tailNode = (
    <CoachTooltipTail
      // 꼬리 SVG는 위를 가리키는 삼각형이다 — 아래를 가리켜야 할 때만 뒤집는다(Figma와 동일).
      style={tail === "bottom" ? { transform: "rotate(180deg)" } : undefined}
    />
  );

  return (
    <div className="pointer-events-none mx-8 flex flex-col items-center">
      {tail === "top" && tailNode}
      <div
        className="flex w-full flex-col gap-[5px] overflow-hidden border px-4 py-[15px]"
        style={{
          backgroundColor: coachOverlay.cardBg,
          borderColor: coachOverlay.cardBorder,
          borderRadius: coachRadius.card,
          ...coachOverlay.cardShadow,
        }}
      >
        {/* Figma 실측 15 Bold / lh19. 토큰 body.md(15)와 크기는 같지만 weight 정의가 달라 실측값을 쓴다. */}
        <h2
          className="text-[15px] font-bold leading-[19px]"
          style={{ color: coachTokenColors.cardTitle }}
        >
          {title}
        </h2>
        <p className="text-[13px] leading-[19px]" style={{ color: coachOverlay.cardBodyText }}>
          {body}
        </p>
      </div>
      {tail === "bottom" && tailNode}
    </div>
  );
}
