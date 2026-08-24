import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  MOCK_FOCUS_PILL_LABEL,
  MOCK_PAUSED_PILL_LABEL,
  ONBOARDING_GUIDE_STEP_COUNT,
} from "../onboardingGuideSteps";
import { OnboardingGuideFlow } from "../OnboardingGuideFlow";

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

/**
 * 시연용 목업 타이머의 스텝별 동작을 플로우 레벨에서 고정한다(BY-427).
 * `freezeFocusTimer`/`freezeTotalTimer`/`showTimer`는 데이터 플래그라, 실제로 카운터가
 * 그 플래그대로 멈추고·흐르고·사라지는지는 플로우를 렌더해야만 검증된다.
 * (`getByText`는 `aria-hidden`과 무관하게 텍스트를 찾는다 — 목업은 장식이라 대부분 hidden이다.)
 */
describe("OnboardingGuideFlow — 목업 타이머 시연", () => {
  const flowProps = {
    onFinish: vi.fn(),
    onExit: vi.fn(),
    isReentry: false,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** "다음" CTA로 G1에서 `index`번째 스텝까지 이동한다. */
  function goToStep(index: number) {
    for (let i = 0; i < index; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: GUIDE_NEXT_LABEL }));
    }
  }

  it("G1에서는 두 타이머가 흐른다 — 시연 카운터 자체가 동작함을 먼저 고정", () => {
    render(<OnboardingGuideFlow {...flowProps} />);

    expect(screen.getByText("00:00:19")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("00:00:21")).toBeInTheDocument();
    expect(screen.getByText("총 00:00:24")).toBeInTheDocument();
  });

  it("G2에서는 순공만 멈추고 총 공부는 계속 흐른다 (비집중의 인과)", () => {
    render(<OnboardingGuideFlow {...flowProps} />);
    goToStep(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText("00:00:12")).toBeInTheDocument(); // 순공 — 시드 그대로
    expect(screen.getByText("총 00:00:25")).toBeInTheDocument(); // 총 공부 — 22 + 3
  });

  it("G4에서는 두 타이머 값이 모두 증가하지 않는다 (2026-08-25 BY-427 확정)", () => {
    render(<OnboardingGuideFlow {...flowProps} />);
    goToStep(3);

    expect(screen.getByText("00:00:20")).toBeInTheDocument();
    expect(screen.getByText("총 00:00:23")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // 카피("순공시간과 총 공부 시간이 모두 멈춰요")대로 값이 그대로다 — 색(회색)↔값 모순 해소.
    expect(screen.getByText("00:00:20")).toBeInTheDocument();
    expect(screen.getByText("총 00:00:23")).toBeInTheDocument();
  });

  it("G4 상태 필은 일시정지 문구를 보여준다 (2026-08-25 BY-427 피드백)", () => {
    render(<OnboardingGuideFlow {...flowProps} />);
    goToStep(3);

    expect(screen.getByText(MOCK_PAUSED_PILL_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(MOCK_FOCUS_PILL_LABEL)).not.toBeInTheDocument();
  });

  it("G5에서는 타이머와 상태 필이 렌더되지 않는다 (2026-08-25 BY-427 확정·피드백)", () => {
    render(<OnboardingGuideFlow {...flowProps} />);
    goToStep(4);

    expect(screen.getByText("영상은 기기 밖으로 나가지 않아요")).toBeInTheDocument();
    expect(screen.queryByText(/^\d{2}:\d{2}:\d{2}$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^총 \d{2}:\d{2}:\d{2}$/)).not.toBeInTheDocument();
    expect(screen.queryByText(MOCK_FOCUS_PILL_LABEL)).not.toBeInTheDocument();
  });
});
