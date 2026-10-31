import { fireEvent, render, screen, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { MeasurementFeedbackCardHost } from "../MeasurementFeedbackCardHost";
import {
  createMemoryMeasurementFeedbackStore,
  loadMeasurementFeedbackState,
  resetMeasurementFeedbackStore,
  setMeasurementFeedbackStore,
} from "../measurementFeedbackStore";

const analytics = vi.hoisted(() => ({
  trackMeasurementFeedbackShown: vi.fn(),
  trackMeasurementFeedbackRated: vi.fn(),
  trackMeasurementFeedbackReasonSelected: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (o) => ({ ...(await o<typeof Amplitude>()), ...analytics }));

const NOW = Date.UTC(2026, 9, 31, 3, 0, 0);
const HOUR_MS = 60 * 60 * 1000;
const QUESTION = "이번 측정 결과 어땠나요?";

function renderHost({
  focusSec = 1200,
  roomType = "single",
  strict = false,
}: { focusSec?: number; roomType?: "single" | "social"; strict?: boolean } = {}) {
  const tree = <MeasurementFeedbackCardHost focusSec={focusSec} roomType={roomType} />;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  setMeasurementFeedbackStore(createMemoryMeasurementFeedbackStore());
});

afterEach(() => {
  resetMeasurementFeedbackStore();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("MeasurementFeedbackCardHost — 노출", () => {
  it("순공 5분 이상이면 카드를 보이고 노출 시각과 노출 이벤트를 남긴다", () => {
    renderHost({ focusSec: 1200, roomType: "social" });

    expect(screen.getByRole("heading", { name: QUESTION })).toBeInTheDocument();
    expect(loadMeasurementFeedbackState()).toEqual({ lastShownAt: NOW });
    expect(analytics.trackMeasurementFeedbackShown).toHaveBeenCalledWith({
      roomType: "social",
      focusSec: 1200,
    });
  });

  it("순공 5분 미만이면 카드도 노출 기록도 남기지 않는다", () => {
    const { container } = renderHost({ focusSec: 299 });

    expect(container).toBeEmptyDOMElement();
    expect(loadMeasurementFeedbackState()).toEqual({ lastShownAt: null });
    expect(analytics.trackMeasurementFeedbackShown).not.toHaveBeenCalled();
  });

  it("72시간 안에 이미 보였으면 띄우지 않는다", () => {
    setMeasurementFeedbackStore(createMemoryMeasurementFeedbackStore(NOW - 71 * HOUR_MS));

    const { container } = renderHost();

    expect(container).toBeEmptyDOMElement();
    expect(analytics.trackMeasurementFeedbackShown).not.toHaveBeenCalled();
  });

  it("노출 기록을 읽지 못하면 띄우지 않는다", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setMeasurementFeedbackStore({
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
    expect(analytics.trackMeasurementFeedbackShown).toHaveBeenCalledTimes(1);
  });
});

describe("MeasurementFeedbackCardHost — 응답", () => {
  it("만족해요를 고르면 이유를 묻지 않고 감사 문구로 마무리한다", () => {
    renderHost();

    fireEvent.click(screen.getByRole("button", { name: "만족해요" }));

    expect(screen.getByRole("status")).toHaveTextContent("소중한 의견 감사합니다!");
    expect(screen.queryByText("어떤 점이 아쉬웠나요?")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "만족해요" })).not.toBeInTheDocument();
    expect(analytics.trackMeasurementFeedbackRated).toHaveBeenCalledWith({
      roomType: "single",
      focusSec: 1200,
      rating: "good",
    });
  });

  it("아쉬워요를 고르면 이유를 묻고, 이유를 고르면 감사 문구로 마무리한다", () => {
    renderHost();

    fireEvent.click(screen.getByRole("button", { name: "아쉬워요" }));

    expect(screen.getByRole("button", { name: "아쉬워요" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "만족해요" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    const reasons = screen.getByRole("group", { name: "어떤 점이 아쉬웠나요?" });
    expect(screen.getByText("하나만 골라주세요")).toBeInTheDocument();
    expect(analytics.trackMeasurementFeedbackRated).toHaveBeenCalledWith({
      roomType: "single",
      focusSec: 1200,
      rating: "bad",
    });

    fireEvent.click(within(reasons).getByRole("button", { name: "실제보다 적게 잡혔어요" }));

    expect(screen.getByRole("status")).toHaveTextContent("소중한 의견 감사합니다!");
    expect(screen.queryByText("어떤 점이 아쉬웠나요?")).not.toBeInTheDocument();
  });

  it("마무리되면 포커스를 감사 문구로 옮긴다", () => {
    renderHost();

    const good = screen.getByRole("button", { name: "만족해요" });
    good.focus();
    fireEvent.click(good);

    expect(screen.getByRole("status")).toHaveFocus();
  });

  it("같은 선택지를 다시 눌러도 만족도 이벤트는 한 번만 보낸다", () => {
    renderHost();

    fireEvent.click(screen.getByRole("button", { name: "보통이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "보통이에요" }));

    expect(analytics.trackMeasurementFeedbackRated).toHaveBeenCalledTimes(1);
  });

  it("다른 선택지로 바꾸면 바꾼 값으로 다시 보낸다", () => {
    renderHost();

    fireEvent.click(screen.getByRole("button", { name: "보통이에요" }));
    fireEvent.click(screen.getByRole("button", { name: "만족해요" }));

    expect(analytics.trackMeasurementFeedbackRated.mock.calls).toEqual([
      [{ roomType: "single", focusSec: 1200, rating: "meh" }],
      [{ roomType: "single", focusSec: 1200, rating: "good" }],
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("소중한 의견 감사합니다!");
  });

  it("보통이에요를 고르면 조금 아쉬운 점이 있었는지 묻는다", () => {
    renderHost();

    fireEvent.click(screen.getByRole("button", { name: "보통이에요" }));

    expect(screen.getByText("조금 아쉬운 점이 있었나요?")).toBeInTheDocument();
    expect(screen.queryByText("어떤 점이 아쉬웠나요?")).not.toBeInTheDocument();
  });

  it.each([
    { label: "실제보다 적게 잡혔어요", reason: "under" },
    { label: "실제보다 많이 잡혔어요", reason: "over" },
    { label: "결과를 봐도 잘 모르겠어요", reason: "unclear" },
    { label: "보고 싶은 정보가 없어요", reason: "missing_info" },
  ])("'$label'은 $reason 값으로 보낸다", ({ label, reason }) => {
    renderHost({ focusSec: 600, roomType: "social" });

    fireEvent.click(screen.getByRole("button", { name: "보통이에요" }));
    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(analytics.trackMeasurementFeedbackReasonSelected).toHaveBeenCalledWith({
      roomType: "social",
      focusSec: 600,
      rating: "meh",
      reason,
    });
  });
});
