import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { InterviewCardHost } from "../InterviewCardHost";
import type * as InterviewForm from "../interviewForm";
import {
  createMemoryInterviewStore,
  loadInterviewState,
  resetInterviewStore,
  setInterviewStore,
} from "../interviewStore";

const getInterviewStatus = vi.hoisted(() => vi.fn());
vi.mock("@/lib/interviewApi", () => ({ getInterviewStatus }));
const openInterviewForm = vi.hoisted(() => vi.fn());
vi.mock("../interviewForm", async (o) => ({
  ...(await o<typeof InterviewForm>()),
  openInterviewForm,
}));
const analytics = vi.hoisted(() => ({
  trackInterviewShown: vi.fn(),
  trackInterviewClicked: vi.fn(),
  trackInterviewDismissed: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (o) => ({ ...(await o<typeof Amplitude>()), ...analytics }));

const FORM = "https://docs.google.com/forms/d/e/a/viewform?entry.1=NICKNAME";
const eligible = { cardEligible: true, cardUrl: FORM, settingsEnabled: true, settingsUrl: FORM };

function renderHost({ strict = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/room/1/result?userId=7"]}>
        <InterviewCardHost userId={7} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => setInterviewStore(createMemoryInterviewStore()));
afterEach(() => {
  resetInterviewStore();
  vi.clearAllMocks();
});

describe("InterviewCardHost", () => {
  it("대상이면 카드를 보이고 노출을 기록한다", async () => {
    getInterviewStatus.mockResolvedValue(eligible);
    renderHost();

    expect(await screen.findByText("꾸준히 쓰는 이유를 들려주세요")).toBeInTheDocument();
    expect(screen.getByText("15분 통화하면 스타벅스 기프티콘 100% 증정")).toBeInTheDocument();
    expect(loadInterviewState()?.cardShownCount).toBe(1);
    expect(analytics.trackInterviewShown).toHaveBeenCalledWith({
      source: "g3_complete",
      exposure: 1,
    });
  });

  it("대상이 아니면 그리지 않는다", async () => {
    getInterviewStatus.mockResolvedValue({ ...eligible, cardEligible: false, cardUrl: null });
    renderHost();

    await waitFor(() => expect(getInterviewStatus).toHaveBeenCalled());
    expect(screen.queryByText("꾸준히 쓰는 이유를 들려주세요")).toBeNull();
  });

  it("같은 날 두 번째 결과 화면에서는 그리지 않는다", async () => {
    getInterviewStatus.mockResolvedValue(eligible);
    const first = renderHost();
    await screen.findByText("꾸준히 쓰는 이유를 들려주세요");
    first.unmount();

    renderHost();
    await waitFor(() => expect(getInterviewStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("꾸준히 쓰는 이유를 들려주세요")).toBeNull();
  });

  it("X를 누르면 숨기고 닫기 이벤트를 남긴다", async () => {
    getInterviewStatus.mockResolvedValue(eligible);
    renderHost();

    fireEvent.click(await screen.findByRole("button", { name: "인터뷰 안내 닫기" }));

    expect(screen.queryByText("꾸준히 쓰는 이유를 들려주세요")).toBeNull();
    expect(analytics.trackInterviewDismissed).toHaveBeenCalledWith({
      source: "g3_complete",
      exposure: 1,
      action: "x",
    });
  });

  it("신청하면 신청으로 남기고 폼을 연다", async () => {
    getInterviewStatus.mockResolvedValue(eligible);
    renderHost();

    fireEvent.click(await screen.findByRole("button", { name: "인터뷰 신청하기" }));

    expect(loadInterviewState()?.applied).toBe(true);
    expect(openInterviewForm).toHaveBeenCalledWith(FORM, "?userId=7");
  });

  it("조회가 실패하면 그리지 않는다", async () => {
    getInterviewStatus.mockRejectedValue(new Error("x"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    renderHost();

    await waitFor(() => expect(getInterviewStatus).toHaveBeenCalled());
    expect(screen.queryByText("꾸준히 쓰는 이유를 들려주세요")).toBeNull();
  });

  it("결과 화면을 떠난 뒤 도착한 응답은 기록하지 않는다", async () => {
    let resolve: (value: typeof eligible) => void = () => {};
    getInterviewStatus.mockReturnValue(new Promise((r) => (resolve = r)));
    const view = renderHost();
    await waitFor(() => expect(getInterviewStatus).toHaveBeenCalled());
    view.unmount();

    resolve(eligible);
    await new Promise((r) => setTimeout(r, 0));

    expect(loadInterviewState()?.cardShownCount).toBe(0);
    expect(analytics.trackInterviewShown).not.toHaveBeenCalled();
  });

  it("StrictMode에서 effect가 두 번 돌아도 노출은 한 번만 남긴다", async () => {
    getInterviewStatus.mockResolvedValue(eligible);
    renderHost({ strict: true });

    expect(await screen.findByText("꾸준히 쓰는 이유를 들려주세요")).toBeInTheDocument();
    expect(loadInterviewState()?.cardShownCount).toBe(1);
    expect(analytics.trackInterviewShown).toHaveBeenCalledTimes(1);
  });
});
