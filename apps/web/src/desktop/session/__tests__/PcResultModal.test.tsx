import type { StudySessionResponse } from "@focusmakers/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import {
  consumeStudyResultExit,
  stageStudyResultExit,
  trackStudyResultConfirmed,
} from "@/lib/amplitude";
import { getStudyDays, listStudySessionStats } from "@/lib/statsApi";

import { PcResultModal } from "../PcResultModal";

vi.mock("@/lib/statsApi", () => ({
  listStudySessionStats: vi.fn(),
  getStudyDays: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackStudyResultConfirmed: vi.fn(),
  stageStudyResultExit: vi.fn(),
  consumeStudyResultExit: vi.fn(),
}));

/** 타임랩스 카드는 따로 검증했다. 모달이 넘기는 값만 본다. */
const timelapseCard = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock("@/features/timelapse/ResultTimelapseCard", () => ({
  ResultTimelapseCard: (props: Record<string, unknown>) => {
    timelapseCard.props.push(props);
    return <div data-testid="timelapse-card" />;
  },
}));

const START = new Date(2026, 10, 22, 21, 3, 0);
const STARTED_AT_MS = START.getTime();

function at(offsetSec: number): string {
  return new Date(STARTED_AT_MS + offsetSec * 1000).toISOString();
}

function session(overrides: Partial<StudySessionResponse> = {}): StudySessionResponse {
  return {
    id: 10,
    userId: 7,
    statDate: "2026-11-22",
    startedAt: at(0),
    endedAt: at(6300),
    studySec: 6120,
    focusSec: 5040,
    focusRate: 82.35,
    events: [{ status: "AWAY", startedAt: at(600), endedAt: at(900) }],
    ...overrides,
  };
}

function renderModal({
  sessions = [session()],
  onClose = vi.fn(),
}: { sessions?: StudySessionResponse[]; onClose?: () => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/home?userId=7"]}>
        <Routes>
          <Route
            path="/home"
            element={
              <>
                {/* 창 뒤 홈의 버튼. 포커스가 창 밖으로 새면 여기로 온다. */}
                <button type="button">홈 버튼</button>
                <PcResultModal
                  sessions={sessions}
                  startedAtMs={STARTED_AT_MS}
                  container={null}
                  onClose={onClose}
                />
              </>
            }
          />
          <Route path="/records" element={<p>기록 화면</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onClose };
}

function dialog() {
  return screen.getByRole("dialog", { name: "오늘 공부 완료" });
}

/** 제목과 같은 줄에 있는 X */
function titleRowClose() {
  const title = screen.getByRole("heading", { name: "오늘 공부 완료" });
  return within(title.parentElement!).getByRole("button", { name: "닫기" });
}

/** 기록으로 가기와 같은 줄에 있는 닫기 */
function footerClose() {
  const records = screen.getByRole("button", { name: "기록으로 가기" });
  return within(records.parentElement!).getByRole("button", { name: "닫기" });
}

beforeEach(() => {
  vi.clearAllMocks();
  timelapseCard.props = [];
  vi.mocked(listStudySessionStats).mockResolvedValue({
    sessions: [],
    sessionCount: 3,
    totalStudySec: 15000,
    totalFocusSec: 12960,
    longestFocusSec: 2528,
    focusRate: 86.4,
    totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, SLEEP: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
  });
  vi.mocked(getStudyDays).mockResolvedValue({ totalDays: 23 });
});

describe("PcResultModal", () => {
  it("측정 세션은 순공시간·타임라인·오늘 누적·타임랩스를 한 열로 보인다", async () => {
    renderModal();

    const modal = dialog();
    expect(within(modal).queryByText("끝까지 해내셨네요!")).toBeNull();
    expect(within(modal).getByText("순공시간")).toBeInTheDocument();
    expect(within(modal).getByText("1시간 24분")).toBeInTheDocument();
    expect(within(modal).getByText("1시간 42분")).toBeInTheDocument();
    expect(within(modal).getByText("82% 집중")).toBeInTheDocument();
    expect(within(modal).getByText("공부 타임라인")).toBeInTheDocument();
    expect(await within(modal).findByText("23일")).toBeInTheDocument();
    expect(timelapseCard.props.at(-1)).toMatchObject({
      startedAtMs: STARTED_AT_MS,
      userId: 7,
      shareMode: "direct",
    });
  });

  it("오늘 누적 순공시간과 누적 공부 일 수는 반반 카드 두 개로 나눠 보인다", async () => {
    renderModal();

    const modal = dialog();
    const focusCard = (await within(modal).findByText("오늘 누적 순공시간")).closest(
      '[data-slot="card"]',
    );
    const daysCard = within(modal).getByText("누적 공부 일 수").closest('[data-slot="card"]');
    expect(focusCard).not.toBeNull();
    expect(daysCard).not.toBeNull();
    expect(focusCard).not.toBe(daysCard);
    expect(await within(focusCard as HTMLElement).findByText("3시간 36분")).toBeInTheDocument();
    expect(await within(daysCard as HTMLElement).findByText("23일")).toBeInTheDocument();
  });

  it("자율 모드는 총 공부시간만 보이고 타임라인과 타임랩스 없이 안내를 보인다", async () => {
    renderModal({ sessions: [session({ source: "TIMER", focusSec: 0, focusRate: 0 })] });

    const modal = dialog();
    expect(within(modal).getByText("총 공부시간")).toBeInTheDocument();
    expect(within(modal).getByText("1시간 42분")).toBeInTheDocument();
    expect(within(modal).queryByText("순공시간")).toBeNull();
    expect(within(modal).queryByText(/% 집중/)).toBeNull();
    expect(within(modal).queryByText("공부 타임라인")).toBeNull();
    expect(within(modal).getByText(/자율 모드로 공부한 시간은/)).toBeInTheDocument();
    expect(await within(modal).findByText("누적 공부 일 수")).toBeInTheDocument();
    expect(timelapseCard.props).toHaveLength(0);
  });

  it.each([
    ["아래 닫기 버튼", () => userEvent.click(footerClose())],
    ["제목 줄 X", () => userEvent.click(titleRowClose())],
    ["Esc", () => userEvent.keyboard("{Escape}")],
    [
      "바깥 누름",
      // 창 밖은 pointer-events가 막혀 사용자 이벤트 대신 Radix가 듣는 pointerdown을 직접 보낸다.
      // Radix는 창을 연 다음 틱에 바깥 누름을 듣기 시작한다.
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        fireEvent.pointerDown(document.body);
      },
    ],
  ])("%s는 onClose를 부르고 홈 이탈을 바로 보낸다", async (_, act) => {
    const { onClose } = renderModal();

    await act();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(trackStudyResultConfirmed).toHaveBeenCalledExactlyOnceWith({
      roomType: "single",
      via: "home",
      surface: "pc_home",
    });
    expect(stageStudyResultExit).toHaveBeenCalledExactlyOnceWith({
      roomType: "single",
      focusSec: 5040,
      consumeAt: "/home",
      surface: "pc_home",
    });
    expect(consumeStudyResultExit).toHaveBeenCalledExactlyOnceWith("/home");
  });

  it("Tab과 Shift+Tab은 창 안에서만 돈다", async () => {
    renderModal({ sessions: [session({ source: "TIMER", focusSec: 0, focusRate: 0 })] });
    const records = screen.getByRole("button", { name: "기록으로 가기" });
    expect(titleRowClose()).toHaveFocus();

    await userEvent.tab({ shift: true });
    expect(records).toHaveFocus();
    await userEvent.tab();
    expect(titleRowClose()).toHaveFocus();
    await userEvent.tab();
    expect(footerClose()).toHaveFocus();
  });

  it("기록으로 가기는 기록 화면으로 이동하고 기록 이탈을 예약한다", async () => {
    const { onClose } = renderModal();

    await userEvent.click(screen.getByRole("button", { name: "기록으로 가기" }));

    expect(await screen.findByText("기록 화면")).toBeInTheDocument();
    expect(trackStudyResultConfirmed).toHaveBeenCalledExactlyOnceWith({
      roomType: "single",
      via: "records",
      surface: "pc_home",
    });
    expect(stageStudyResultExit).toHaveBeenCalledExactlyOnceWith({
      roomType: "single",
      focusSec: 5040,
      consumeAt: "/records",
      surface: "pc_home",
    });
    // 기록 화면의 경로 추적기가 예약을 가져가므로 여기서 보내지 않는다.
    expect(consumeStudyResultExit).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("자정으로 나뉜 세션은 첫 세션을 그리고 이탈 예약에는 순공을 모두 더한다", async () => {
    renderModal({
      sessions: [
        session({ focusSec: 1200, studySec: 1500 }),
        session({ id: 11, focusSec: 600, studySec: 900 }),
      ],
    });

    expect(within(dialog()).getByText("20분")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");

    expect(stageStudyResultExit).toHaveBeenCalledWith(expect.objectContaining({ focusSec: 1800 }));
  });
});
