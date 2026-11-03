import type { StudySessionResponse } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createMemoryMeasurementFeedbackStore,
  resetMeasurementFeedbackStore,
  setMeasurementFeedbackStore,
} from "@/features/measurement-feedback/measurementFeedbackStore";
import i18n from "@/lib/i18n";
import { getStudyDays, listStudySessionStats } from "@/lib/statsApi";
import { ResultPage } from "@/routes/ResultPage";

vi.mock("@/lib/statsApi", () => ({ listStudySessionStats: vi.fn(), getStudyDays: vi.fn() }));
vi.mock("@/lib/rankingApi", () => ({
  getRankingSessionGains: () => Promise.resolve({ weekly: null, others: [] }),
}));
vi.mock("@/lib/interviewApi", () => ({
  getInterviewStatus: () =>
    Promise.resolve({
      cardEligible: false,
      cardUrl: null,
      settingsEnabled: false,
      settingsUrl: null,
    }),
}));
// 타임랩스 카드는 타임랩스 묶음이 따로 확인한다.
vi.mock("@/features/timelapse/ResultTimelapseCard", () => ({ ResultTimelapseCard: () => null }));
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));

const HANGUL = /[가-힣]/;

const START = new Date(2026, 6, 25, 21, 3, 0);
const at = (sec: number) => new Date(START.getTime() + sec * 1000).toISOString();

const session: StudySessionResponse = {
  id: 10,
  userId: 1,
  statDate: "2026-07-25",
  startedAt: at(0),
  endedAt: at(6300),
  studySec: 6120,
  focusSec: 5040,
  focusRate: 82.35,
  events: [
    { status: "AWAY", startedAt: at(600), endedAt: at(900) },
    { status: "PAUSE", startedAt: at(2400), endedAt: at(2580) },
  ],
};

/** 화면 글자와 aria-label을 함께 모은다. 스크린리더가 읽는 이름도 영어여야 한다. */
function visibleText(container: HTMLElement): string {
  const labels = [...container.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  return [container.textContent, ...labels].join("\n");
}

afterEach(async () => {
  resetMeasurementFeedbackStore();
  delete (window as { matchMedia?: unknown }).matchMedia;
  await i18n.changeLanguage("ko");
});

describe("공부 결과 영어 화면", () => {
  it("영어로 바꾸면 결과 화면에 한글이 남지 않는다", async () => {
    vi.mocked(listStudySessionStats).mockResolvedValue({
      sessions: [],
      sessionCount: 1,
      totalStudySec: 6120,
      totalFocusSec: 5040,
      longestFocusSec: 1500,
      focusRate: 82.35,
      totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 1, SLEEP: 0, PAUSE: 1 },
      studiedDatesInMonth: [],
    });
    vi.mocked(getStudyDays).mockResolvedValue({ totalDays: 23 });
    setMeasurementFeedbackStore(createMemoryMeasurementFeedbackStore());
    // 모션 줄이기로 연출 없이 처음부터 전부 그린다.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
      }),
    });
    await i18n.changeLanguage("en");

    const { container } = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter
          initialEntries={[
            { pathname: "/room/7/result", search: "?userId=7", state: { sessions: [session] } },
          ]}
        >
          <Routes>
            <Route path="/room/:id/result" element={<ResultPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // 요약 카드가 서버 값을 받아 숫자를 그릴 때까지 기다린다.
    await waitFor(() => expect(container.querySelector('[aria-busy="true"]')).toBeNull());

    expect(visibleText(container)).not.toMatch(HANGUL);
  });
});
