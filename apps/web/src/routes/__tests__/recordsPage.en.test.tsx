import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudySessionListResponse } from "@focusmakers/types";
import i18n from "@/lib/i18n";
import { getPeriodStats, listStudySessionStats } from "@/lib/statsApi";
import { RecordsPage } from "@/routes/RecordsPage";

/**
 * 영어 렌더
 *
 * 기록 탭을 영어로 열면 한글이 한 글자도 남지 않아야 한다. 화면 글자와 aria-label을 함께 본다.
 * 세션 목록 아래 타임라인 범례는 세션 화면 문구를 빌려 써서 그 묶음이 끝나기 전까지 한글이라,
 * 세션이 있는 날은 행과 펼침만 본다.
 */

vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getPeriodStats: vi.fn(),
}));
vi.mock("@/lib/amplitude", () => ({
  trackRecordsDateSelected: vi.fn(),
  trackRecordsMonthChanged: vi.fn(),
  trackRecordsSessionExpanded: vi.fn(),
  trackRecordsViewChanged: vi.fn(),
  trackRecordsWeekChanged: vi.fn(),
  trackRecordsRhythmShown: vi.fn(),
  trackRecordsPeriodPickerOpened: vi.fn(),
  trackRecordsPeriodPicked: vi.fn(),
  trackErrorRetryPressed: vi.fn(),
}));

const HANGUL = /[가-힣]/;

function sessions(count: number): StudySessionListResponse {
  return {
    sessions: Array.from({ length: count }, (_, index) => ({
      id: index + 1,
      statDate: "2026-01-01",
      startedAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-01T01:00:00.000Z",
      studySec: 3600,
      focusSec: 1800,
      focusRate: 50,
      eventCounts: { AWAY: 2, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    })),
    sessionCount: count,
    totalStudySec: 3600 * count,
    totalFocusSec: 1800 * count,
    longestFocusSec: 1800,
    focusRate: 50,
    totalEventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
  };
}

function hangulIn(element: Element): string[] {
  const found: string[] = [];
  if (HANGUL.test(element.textContent ?? "")) {
    found.push(`text: ${element.textContent ?? ""}`);
  }
  for (const node of [element, ...element.querySelectorAll("[aria-label]")]) {
    const label = node.getAttribute("aria-label");
    if (label !== null && HANGUL.test(label)) {
      found.push(`aria-label: ${label}`);
    }
  }
  return found;
}

function renderRecords() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/records?userId=7"]}>
        <Routes>
          <Route path="/records" element={<RecordsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RecordsPage 영어", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(getPeriodStats).mockResolvedValue({
      from: "2026-01-01",
      to: "2026-01-31",
      compareFrom: null,
      compareTo: null,
      dailyList: [],
      compareDailyList: [],
    });
    await i18n.changeLanguage("en");
  });

  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("기록이 없는 날의 화면 전체에 한글이 없다", async () => {
    vi.mocked(listStudySessionStats).mockResolvedValue(sessions(0));

    renderRecords();

    const page = await screen.findByTestId("records-page");
    await screen.findByText(i18n.t("records:daily.empty"));
    expect(hangulIn(page)).toEqual([]);
  });

  it("세션 행과 펼친 내용에 한글이 없다", async () => {
    vi.mocked(listStudySessionStats).mockResolvedValue(sessions(1));

    renderRecords();

    const row = (await screen.findAllByRole("button", { expanded: false })).find(
      (button) => button.closest("li") !== null,
    );
    expect(row).toBeDefined();
    await userEvent.click(row!);

    expect(hangulIn(row!.closest("li")!)).toEqual([]);
  });
});
