import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { FocusFeedbackCardHost } from "../FocusFeedbackCardHost";
import {
  createMemoryFocusFeedbackStore,
  loadFocusFeedbackState,
  resetFocusFeedbackStore,
  setFocusFeedbackStore,
} from "../focusFeedbackStore";

const analytics = vi.hoisted(() => ({
  trackFocusFeedbackShown: vi.fn(),
  trackFocusFeedbackAnswered: vi.fn(),
  trackFocusFeedbackCommentSubmitted: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (o) => ({ ...(await o<typeof Amplitude>()), ...analytics }));

const NOW = Date.UTC(2026, 9, 31, 3, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const QUESTION = "공부하는 동안 앱이 집중에 어떤 영향을 줬나요?";

function renderHost({
  studySec = 1800,
  roomType = "single",
  strict = false,
}: { studySec?: number; roomType?: "single" | "social"; strict?: boolean } = {}) {
  const tree = (
    <FocusFeedbackCardHost studySec={studySec} roomType={roomType} onAnswered={vi.fn()} />
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setFocusFeedbackStore(createMemoryFocusFeedbackStore());
});

afterEach(() => {
  resetFocusFeedbackStore();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("FocusFeedbackCardHost — 노출", () => {
  it("총 공부 30분 이상이면 카드를 보이고 노출 시각과 노출 이벤트를 남긴다", () => {
    renderHost({ studySec: 1800, roomType: "social" });

    expect(screen.getByRole("heading", { name: QUESTION })).toBeInTheDocument();
    expect(loadFocusFeedbackState()).toEqual({ lastShownAt: NOW });
    expect(analytics.trackFocusFeedbackShown).toHaveBeenCalledWith({
      roomType: "social",
      studySec: 1800,
    });
  });

  it("총 공부 30분 미만이면 카드도 노출 기록도 남기지 않는다", () => {
    const { container } = renderHost({ studySec: 1799 });

    expect(container).toBeEmptyDOMElement();
    expect(loadFocusFeedbackState()).toEqual({ lastShownAt: null });
    expect(analytics.trackFocusFeedbackShown).not.toHaveBeenCalled();
  });

  it("72시간 안에 이미 보였으면 띄우지 않는다", () => {
    setFocusFeedbackStore(createMemoryFocusFeedbackStore(NOW - 71 * HOUR_MS));

    const { container } = renderHost();

    expect(container).toBeEmptyDOMElement();
    expect(analytics.trackFocusFeedbackShown).not.toHaveBeenCalled();
  });

  it("노출 기록을 읽지 못하면 띄우지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setFocusFeedbackStore({
      readLastShownAt: () => {
        throw new Error("blocked");
      },
      writeLastShownAt: () => undefined,
    });

    const { container } = renderHost();

    expect(container).toBeEmptyDOMElement();
  });

  it("개발 모드에서 이펙트가 두 번 돌아도 노출은 한 번만 보낸다", () => {
    renderHost({ strict: true });

    expect(screen.getByRole("heading", { name: QUESTION })).toBeInTheDocument();
    expect(analytics.trackFocusFeedbackShown).toHaveBeenCalledTimes(1);
  });
});

describe("FocusFeedbackCardHost — 응답", () => {
  it("총 공부 1시간이면 두 선택지를 보여 주고 도움 응답에 자유 응답을 안내한다", () => {
    renderHost({ studySec: 3600 });

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "도움이 됐어요",
      "방해가 됐어요",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "도움이 됐어요" }));

    const comment = screen.getByRole("textbox", {
      name: "어떤 순간에 그렇게 느꼈나요?",
    });
    expect(comment).toHaveClass("amp-block", "sentry-block");
    expect(comment).toHaveAccessibleDescription("의견을 남겨 주시면 서비스 개선에 도움이 돼요.");
    expect(analytics.trackFocusFeedbackAnswered).toHaveBeenCalledExactlyOnceWith({
      roomType: "single",
      studySec: 3600,
      impact: "helped",
    });
  });

  it.each([
    { label: "도움이 됐어요", impact: "helped", studySec: 3599 },
    { label: "방해가 됐어요", impact: "hindered", studySec: 3600 },
  ])(
    "총 공부 $studySec초에 $label를 고르면 바로 감사 문구를 보여 준다",
    ({ label, impact, studySec }) => {
      renderHost({ studySec });

      fireEvent.click(screen.getByRole("button", { name: label }));

      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("소중한 의견 감사합니다!");
      expect(analytics.trackFocusFeedbackAnswered).toHaveBeenCalledExactlyOnceWith({
        roomType: "single",
        studySec,
        impact,
      });
    },
  );

  it("자유 응답을 건너뛰어도 첫 응답을 집계하고 감사 문구에 포커스를 옮긴다", () => {
    renderHost({ studySec: 3600 });
    fireEvent.click(screen.getByRole("button", { name: "도움이 됐어요" }));
    fireEvent.click(screen.getByRole("button", { name: "건너뛰기" }));

    expect(analytics.trackFocusFeedbackAnswered).toHaveBeenCalledTimes(1);
    expect(analytics.trackFocusFeedbackCommentSubmitted).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("소중한 의견 감사합니다!");
    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("자유 응답은 내용을 입력하고 보내기를 눌렀을 때만 집계한다", () => {
    renderHost({ studySec: 3600 });
    fireEvent.click(screen.getByRole("button", { name: "도움이 됐어요" }));

    const comment = screen.getByRole("textbox", {
      name: "어떤 순간에 그렇게 느꼈나요?",
    });
    const send = screen.getByRole("button", { name: "보내기" });
    fireEvent.change(comment, { target: { value: "  " } });
    expect(send).toBeDisabled();
    fireEvent.change(comment, { target: { value: "  시간을 확인하고 다시 책을 펼쳤어요.  " } });
    expect(analytics.trackFocusFeedbackCommentSubmitted).not.toHaveBeenCalled();

    fireEvent.click(send);

    expect(analytics.trackFocusFeedbackCommentSubmitted).toHaveBeenCalledExactlyOnceWith({
      roomType: "single",
      studySec: 3600,
      impact: "helped",
      comment: "시간을 확인하고 다시 책을 펼쳤어요.",
    });
    expect(screen.getByRole("status")).toHaveTextContent("소중한 의견 감사합니다!");
  });
});
