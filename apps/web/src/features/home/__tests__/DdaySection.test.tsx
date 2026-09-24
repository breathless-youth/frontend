import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";

import { ApiError } from "@/lib/api";
import { deleteDday, getDday, putDday } from "@/lib/ddayApi";

import { monthOfDateKey, shiftMonth } from "@/features/records/recordsFormat";

import { DdaySection } from "../DdaySection";
import { todayKstDateKey } from "@/lib/dateKst";

import { daysUntil, formatDday } from "../ddayFormat";

vi.mock("@/lib/ddayApi", () => ({
  getDday: vi.fn(),
  putDday: vi.fn(),
  deleteDday: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackDdaySheetOpened: vi.fn(),
  trackDdaySaved: vi.fn(),
  trackDdayDeleted: vi.fn(),
  setDdayUserProperties: vi.fn(),
}));

vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));

const mockedGet = vi.mocked(getDday);
const mockedPut = vi.mocked(putDday);
const mockedDelete = vi.mocked(deleteDday);

/**
 * 남은 일수는 진짜 오늘로 센다 — 가짜 시계를 끼우면 react-query 뮤테이션이 멈춘다. 기대값은 같은
 * 헬퍼로 만든다(헬퍼 자체는 ddayFormat.test가 고정 날짜로 검증한다).
 */
const FUTURE = "2099-01-09";
const PAST = "2020-09-20";
const SET = { title: "2027 수능", targetDate: FUTURE };
const SET_DAYS_LEFT = daysUntil(FUTURE);

/** 달력에서 고를 날 — 다음 달 15일. 오늘 달 안에서 고르면 월말엔 지난 날이 될 수 있다. */
const NEXT_MONTH = shiftMonth(monthOfDateKey(todayKstDateKey()), 1);
const PICK_KEY = `${NEXT_MONTH.year}-${String(NEXT_MONTH.month).padStart(2, "0")}-15`;
const PICK_LABEL = `${NEXT_MONTH.month}월 15일`;

/** 시트가 열린 뒤 다음 달로 넘겨 15일을 고른다. */
function pickNextMonth15() {
  fireEvent.click(screen.getByRole("button", { name: "다음 달" }));
  fireEvent.click(screen.getByRole("button", { name: PICK_LABEL }));
}

function renderSection() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <DdaySection userId={7} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DdaySection — 좌상단 블록", () => {
  it("설정한 D-Day가 없어도 같은 두 줄이다 — 위 'D-Day', 아래 '목표 날짜를 설정하세요'", async () => {
    mockedGet.mockResolvedValue(null);
    renderSection();

    expect(await screen.findByRole("button", { name: "D-Day 설정" })).toBeInTheDocument();
    expect(screen.getByTestId("dday-label")).toHaveTextContent("D-Day");
    expect(screen.getByTestId("dday-caption")).toHaveTextContent("목표 날짜를 설정하세요");
    expect(analytics.setDdayUserProperties).toHaveBeenCalledWith(null);
  });

  it("설정돼 있으면 D-N과 제목을 보여 주고 user property를 맞춘다", async () => {
    mockedGet.mockResolvedValue(SET);
    renderSection();

    expect(await screen.findByTestId("dday-label")).toHaveTextContent(formatDday(SET_DAYS_LEFT));
    expect(screen.getByText("2027 수능")).toBeInTheDocument();
    expect(analytics.setDdayUserProperties).toHaveBeenCalledWith({ daysLeft: SET_DAYS_LEFT });
  });

  it("지난 D-Day는 D+N을 다른 색으로 보여 주고 지우지 않는다", async () => {
    mockedGet.mockResolvedValue({ title: "모의고사", targetDate: PAST });
    renderSection();

    const label = await screen.findByTestId("dday-label");
    expect(label).toHaveTextContent(`D+${-daysUntil(PAST)}`);
    expect(label.className).toContain("text-muted-foreground");
  });

  it("조회에 실패하면 미설정처럼 그린다", async () => {
    mockedGet.mockRejectedValue(new Error("network"));
    renderSection();

    expect(await screen.findByRole("button", { name: "D-Day 설정" })).toBeInTheDocument();
  });
});

describe("DdaySection — 시트", () => {
  it("블록을 탭하면 시트가 열리고, 달력에서 날을 고르고 제목을 써야 저장이 켜진다", async () => {
    mockedGet.mockResolvedValue(null);
    mockedPut.mockImplementation((body) => Promise.resolve(body));
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "D-Day 설정" }));

    const dialog = await screen.findByRole("dialog", { name: "D-Day" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(analytics.trackDdaySheetOpened).toHaveBeenCalledWith(false);
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();

    const save = screen.getByRole("button", { name: "저장" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("제목"), { target: { value: " 수능 " } });
    expect(save).toBeDisabled();
    pickNextMonth15();
    expect(screen.getByTestId("dday-sheet-days")).toHaveTextContent(
      formatDday(daysUntil(PICK_KEY)),
    );
    expect(save).toBeEnabled();

    await userEvent.click(save);

    await waitFor(() => {
      expect(mockedPut).toHaveBeenCalledWith({ title: "수능", targetDate: PICK_KEY });
    });
    const pickedDaysLeft = daysUntil(PICK_KEY);
    expect(await screen.findByTestId("dday-label")).toHaveTextContent(formatDday(pickedDaysLeft));
    expect(analytics.trackDdaySaved).toHaveBeenCalledWith({
      isNew: true,
      daysLeft: pickedDaysLeft,
      titleLength: 2,
    });
    expect(analytics.setDdayUserProperties).toHaveBeenLastCalledWith({ daysLeft: pickedDaysLeft });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("편집 모드의 삭제는 확인 없이 바로 지우고 블록이 미설정으로 돌아간다", async () => {
    mockedGet.mockResolvedValue(SET);
    mockedDelete.mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: /D-Day 수정/ }));
    expect(analytics.trackDdaySheetOpened).toHaveBeenCalledWith(true);
    expect(screen.getByLabelText("제목")).toHaveValue("2027 수능");
    // 달력은 저장된 날의 달에서 열리고 그 날이 눌려 있다
    expect(screen.getByText("2099년 1월")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1월 9일" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    expect(await screen.findByRole("button", { name: "D-Day 설정" })).toBeInTheDocument();
    expect(screen.getByTestId("dday-caption")).toHaveTextContent("목표 날짜를 설정하세요");
    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(analytics.trackDdayDeleted).toHaveBeenCalledWith(SET_DAYS_LEFT);
    expect(analytics.setDdayUserProperties).toHaveBeenLastCalledWith(null);
  });

  it("서버가 날짜를 거절(400)하면 안내 문구를 보여 주고 시트는 열려 있다", async () => {
    mockedGet.mockResolvedValue(null);
    mockedPut.mockRejectedValue(new ApiError("목표 날짜는 오늘 이후여야 합니다", 400));
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "D-Day 설정" }));
    fireEvent.change(await screen.findByLabelText("제목"), { target: { value: "수능" } });
    pickNextMonth15();
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("오늘 이후 날짜를 골라 주세요");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(analytics.trackDdaySaved).not.toHaveBeenCalled();
  });

  it("제목에 포커스가 가면 달력이 날짜 칩으로 접히고, 칩을 누르면 다시 펼쳐진다", async () => {
    mockedGet.mockResolvedValue(null);
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "D-Day 설정" }));
    await screen.findByRole("dialog", { name: "D-Day" });
    pickNextMonth15();

    fireEvent.focus(screen.getByLabelText("제목"));
    expect(screen.queryByRole("button", { name: "다음 달" })).not.toBeInTheDocument();
    const chip = screen.getByRole("button", { name: new RegExp(`${NEXT_MONTH.month}월 15일`) });
    expect(chip).toHaveTextContent(formatDday(daysUntil(PICK_KEY)));

    fireEvent.click(chip);
    expect(screen.getByRole("button", { name: "다음 달" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: PICK_LABEL })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
