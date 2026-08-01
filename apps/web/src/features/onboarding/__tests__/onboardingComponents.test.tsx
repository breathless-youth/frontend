import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CoachNavBar } from "../CoachNavBar";
import { CoachPagerDots } from "../CoachPagerDots";
import { CoachTooltip } from "../CoachTooltip";
import { GuidePrivacyCard } from "../GuidePrivacyCard";
import {
  GUIDE_FINAL_HINT,
  GUIDE_NEXT_LABEL,
  GUIDE_PREV_LABEL,
  GUIDE_SKIP_LABEL,
  guideProgressLabel,
  ONBOARDING_GUIDE_STEP_COUNT,
} from "../onboardingGuideSteps";

/**
 * 온보딩 가이드(G1~G5) 프리미티브 웹 이식 테스트 (BY-334).
 *
 * RN 원본 `apps/mobile/components/onboarding/`에는 이 5개 컴포넌트 전용 `__tests__`가 없다.
 * 그래서 각 컴포넌트가 지닌 표기·접근성·인터랙션 규칙(주석에 적힌 것들)을 새로 커버한다
 * (`recordsComponents.test.tsx`·`settingsComponents.test.tsx`와 같은 판단 — BY-330·331).
 */

describe("CoachPagerDots", () => {
  it("progressbar 역할과 진행 라벨·값을 노출한다", () => {
    render(<CoachPagerDots stepIndex={2} />);

    const bar = screen.getByRole("progressbar", { name: guideProgressLabel(2) });
    expect(bar).toHaveAttribute("aria-valuemin", "1");
    expect(bar).toHaveAttribute("aria-valuemax", String(ONBOARDING_GUIDE_STEP_COUNT));
    expect(bar).toHaveAttribute("aria-valuenow", "3");
  });

  it("개별 도트는 장식이라 접근성 트리에 role을 노출하지 않는다", () => {
    render(<CoachPagerDots stepIndex={0} />);

    const bar = screen.getByRole("progressbar");
    expect(bar.children).toHaveLength(ONBOARDING_GUIDE_STEP_COUNT);
    for (const dot of Array.from(bar.children)) {
      expect(dot).not.toHaveAttribute("role");
    }
  });
});

describe("CoachTooltip", () => {
  it("제목은 heading으로, 본문은 텍스트로 렌더한다", () => {
    render(
      <CoachTooltip
        title="순공시간이 여기에 쌓여요"
        body="집중하는 동안 타이머가 흘러가요."
        tail="bottom"
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "순공시간이 여기에 쌓여요" }),
    ).toBeInTheDocument();
    expect(screen.getByText("집중하는 동안 타이머가 흘러가요.")).toBeInTheDocument();
  });

  it("tail이 bottom이면 꼬리 SVG를 180도 회전한다", () => {
    const { container } = render(<CoachTooltip title="제목" body="본문" tail="bottom" />);
    const tail = container.querySelector("svg");
    expect(tail?.style.transform).toBe("rotate(180deg)");
  });

  it("tail이 top이면 꼬리 SVG를 회전하지 않는다", () => {
    const { container } = render(<CoachTooltip title="제목" body="본문" tail="top" />);
    const tail = container.querySelector("svg");
    expect(tail?.style.transform).toBe("");
  });
});

describe("GuidePrivacyCard", () => {
  it("제목·본문·일러스트를 렌더한다", () => {
    const { container } = render(
      <GuidePrivacyCard
        title="영상은 기기 밖으로 나가지 않아요"
        body="측정은 기기 안에서만 이루어지고, 영상은 저장하지 않아요."
      />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "영상은 기기 밖으로 나가지 않아요" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("측정은 기기 안에서만 이루어지고, 영상은 저장하지 않아요."),
    ).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("CoachNavBar", () => {
  const baseProps = {
    stepIndex: 0,
    ctaLabel: GUIDE_NEXT_LABEL,
    isFirstStep: false,
    onPrev: vi.fn(),
    onNext: vi.fn(),
    onSkip: vi.fn(),
  };

  it("첫 스텝에서는 이전 버튼이 비활성화된다", () => {
    render(<CoachNavBar {...baseProps} skippable isFirstStep={true} />);
    expect(screen.getByRole("button", { name: GUIDE_PREV_LABEL })).toBeDisabled();
  });

  it("첫 스텝이 아니면 이전 버튼을 누를 수 있고 onPrev가 호출된다", () => {
    const onPrev = vi.fn();
    render(<CoachNavBar {...baseProps} skippable isFirstStep={false} onPrev={onPrev} />);

    const prevButton = screen.getByRole("button", { name: GUIDE_PREV_LABEL });
    expect(prevButton).not.toBeDisabled();
    fireEvent.click(prevButton);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("CTA 버튼을 누르면 onNext가 호출된다", () => {
    const onNext = vi.fn();
    render(<CoachNavBar {...baseProps} skippable onNext={onNext} />);

    fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("skippable이면 건너뛰기 버튼과 힌트 접두문을 렌더하고 누르면 onSkip이 호출된다", () => {
    const onSkip = vi.fn();
    render(<CoachNavBar {...baseProps} skippable onSkip={onSkip} />);

    expect(screen.getByText(/좌우로 밀거나 화면을 탭해도 넘어가요/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: GUIDE_SKIP_LABEL }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("skippable이 아니면 건너뛰기 버튼 대신 최종 힌트를 렌더한다", () => {
    render(<CoachNavBar {...baseProps} skippable={false} />);

    expect(screen.queryByRole("button", { name: GUIDE_SKIP_LABEL })).not.toBeInTheDocument();
    expect(screen.getByText(GUIDE_FINAL_HINT)).toBeInTheDocument();
  });
});
