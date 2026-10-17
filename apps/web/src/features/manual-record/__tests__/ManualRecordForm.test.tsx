import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import type * as Bridge from "@/lib/bridge";
import type {
  StudySessionResponse,
  StudySessionSummary,
  SubjectRef,
  SubjectResponse,
} from "@focusmakers/types";

import { addDaysToDateKey, kstDateKey } from "@/features/records/recordsFormat";
import {
  trackManualRecordAdd,
  trackManualRecordDelete,
  trackManualRecordEdit,
  trackManualRecordOverlapBlocked,
} from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import { postToNative } from "@/lib/bridge";
import { createManualRecord, deleteManualRecord, updateManualRecord } from "@/lib/manualRecordApi";
import { statsKeys } from "@/lib/statsQueries";

import { ManualRecordForm, type ManualRecordFormProps } from "../ManualRecordForm";
import { daysAgo } from "../manualRecord";

vi.mock("@/lib/manualRecordApi", () => ({
  createManualRecord: vi.fn(),
  updateManualRecord: vi.fn(),
  deleteManualRecord: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackManualRecordAdd: vi.fn(),
  trackManualRecordEdit: vi.fn(),
  trackManualRecordDelete: vi.fn(),
  trackManualRecordOverlapBlocked: vi.fn(),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  ...analytics,
}));
vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  postToNative: vi.fn(() => false),
}));

/** 이미 지난 화요일. 시계에 의존하는 기본값(오늘)은 순수 모듈 테스트가 고정 시각으로 본다. */
const DAY = "2025-03-04";
const NEXT = addDaysToDateKey(DAY, 1);
const DAYS_AGO = daysAgo(DAY, kstDateKey());
const pad = (value: number) => String(value).padStart(2, "0");
const iso = (day: string, hour: number, minute = 0) =>
  new Date(`${day}T${pad(hour)}:${pad(minute)}:00+09:00`).toISOString();

function summary(
  id: number,
  startedAt: string,
  endedAt: string,
  over: Partial<StudySessionSummary> = {},
): StudySessionSummary {
  const sec = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
  return {
    id,
    statDate: DAY,
    startedAt,
    endedAt,
    studySec: sec,
    focusSec: sec,
    focusRate: 100,
    eventCounts: { AWAY: 0, PHONE: 0, DEVICE: 0, SLEEP: 0, PAUSE: 0 },
    events: [],
    subjectSegments: [],
    ...over,
  };
}

function saved(id: number, startedAt: string, endedAt: string): StudySessionResponse {
  const sec = (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
  return {
    id,
    userId: 7,
    statDate: DAY,
    startedAt,
    endedAt,
    studySec: sec,
    focusSec: sec,
    focusRate: 100,
    events: [],
    source: "MANUAL",
    submissionStartedAt: startedAt,
  };
}

const KOREAN: SubjectResponse = {
  id: 3,
  name: "국어",
  colorIndex: 1,
  studySec: 0,
  focusSec: 0,
  tasks: [],
};

function renderForm(props: Partial<ManualRecordFormProps> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const onDone = vi.fn();
  // 화면을 다시 연 상황은 key를 바꿔 새 인스턴스로 흉내 낸다.
  const tree = (key: number, next: Partial<ManualRecordFormProps> = {}) => (
    <QueryClientProvider client={queryClient}>
      <ManualRecordForm
        key={key}
        userId={7}
        dateKey={DAY}
        mode={{ kind: "add", entry: "planner_button" }}
        sessions={[]}
        subjects={[KOREAN]}
        subjectRefs={new Map()}
        onDone={onDone}
        {...props}
        {...next}
      />
    </QueryClientProvider>
  );
  const { rerender } = render(tree(1));
  return {
    onDone,
    invalidate,
    remount: () => rerender(tree(2)),
    // 저장 뒤 화면이 내려가기 전에 무효화로 다시 받은 조회가 들어온 상황을 흉내 낸다.
    update: (next: Partial<ManualRecordFormProps>) => rerender(tree(1, next)),
  };
}

const startInput = () => screen.getByLabelText("시작");
const endInput = () => screen.getByLabelText("종료");
const saveButton = () => screen.getByRole("button", { name: "저장" });

describe("ManualRecordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("날짜 줄에 포커스하고, 지난 날 기본값과 안내 한 줄을 보여 준다", async () => {
    renderForm();

    const date = screen.getByText("3월 4일 화요일");
    await waitFor(() => expect(date).toHaveFocus());
    expect(startInput()).toHaveAttribute("type", "time");
    expect(startInput()).toHaveAttribute("step", "60");
    expect(startInput()).toHaveValue("09:00");
    expect(endInput()).toHaveValue("10:00");
    expect(
      screen.getByText("직접 추가한 기록은 연속 공부·랭킹에 반영되지 않아요"),
    ).toBeInTheDocument();
    expect(screen.queryByText("다음 날")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("종료가 시작보다 이르면 다음 날을 붙인다", () => {
    renderForm();

    fireEvent.change(endInput(), { target: { value: "08:00" } });

    expect(screen.getByText("다음 날")).toBeInTheDocument();
    expect(endInput()).toHaveAccessibleDescription(expect.stringContaining("다음 날"));
    expect(startInput()).not.toHaveAccessibleDescription(expect.stringContaining("다음 날"));
  });

  it("칩은 종료에 누적해서 더한다", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "+30분" }));
    expect(endInput()).toHaveValue("10:30");
    fireEvent.click(screen.getByRole("button", { name: "+1시간" }));
    expect(endInput()).toHaveValue("11:30");
  });

  it("화면을 연 뒤 흐른 시간은 시각을 바꿀 때 지금으로 다시 읽어 미래로 막지 않는다", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const today = "2026-10-17";
      vi.setSystemTime(new Date(`${today}T14:00:00+09:00`));
      renderForm({ dateKey: today });

      vi.setSystemTime(new Date(`${today}T14:10:00+09:00`));
      fireEvent.change(startInput(), { target: { value: "13:00" } });
      fireEvent.change(endInput(), { target: { value: "14:05" } });

      expect(screen.queryByText("지금 이후 시간은 넣을 수 없어요")).not.toBeInTheDocument();
      expect(saveButton()).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("1분 미만이면 안내를 읽어 주고 저장을 끈다", () => {
    renderForm();

    fireEvent.change(endInput(), { target: { value: "09:00" } });

    expect(screen.getByText("1분 이상이어야 해요")).toHaveAttribute("aria-live", "polite");
    expect(startInput()).toHaveAttribute("aria-invalid", "true");
    expect(endInput()).toHaveAttribute("aria-invalid", "true");
    expect(endInput()).toHaveAccessibleDescription("1분 이상이어야 해요");
    expect(saveButton()).toBeDisabled();
  });

  it("일부 겹치면 빠지는 구간을 알리고 저장은 켜 둔다", () => {
    renderForm({ sessions: [summary(1, iso(DAY, 9, 30), iso(DAY, 10))] });

    fireEvent.change(startInput(), { target: { value: "09:00" } });
    fireEvent.change(endInput(), { target: { value: "11:00" } });

    expect(
      screen.getByText("이미 기록된 30분(09:30~10:00)은 제외하고 1시간 30분을 저장해요"),
    ).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("전부 겹치면 막고, 막힘 이벤트는 화면을 연 동안 한 번만 보낸다", () => {
    const blocked = vi.mocked(trackManualRecordOverlapBlocked);
    const { remount } = renderForm({ sessions: [summary(1, iso(DAY, 9), iso(DAY, 12))] });

    fireEvent.change(startInput(), { target: { value: "09:00" } });
    fireEvent.change(endInput(), { target: { value: "10:00" } });

    expect(screen.getByText("이미 기록이 있는 시간이에요")).toBeInTheDocument();
    expect(startInput()).toHaveAttribute("aria-invalid", "true");
    expect(saveButton()).toBeDisabled();
    expect(blocked).toHaveBeenCalledTimes(1);
    expect(blocked).toHaveBeenCalledWith({ entry: "planner_button", daysAgo: DAYS_AGO });

    // 막힘에서 벗어났다가 다시 막혀도 같은 열림 안에서는 더 보내지 않는다.
    fireEvent.change(endInput(), { target: { value: "13:00" } });
    expect(screen.queryByText("이미 기록이 있는 시간이에요")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(blocked).toHaveBeenCalledTimes(1);

    fireEvent.change(endInput(), { target: { value: "11:00" } });
    expect(screen.getByText("이미 기록이 있는 시간이에요")).toBeInTheDocument();
    expect(blocked).toHaveBeenCalledTimes(1);

    // 다시 열면 새 인스턴스라 한 번 더 보낸다.
    remount();
    fireEvent.change(startInput(), { target: { value: "09:00" } });
    fireEvent.change(endInput(), { target: { value: "10:00" } });
    expect(screen.getByText("이미 기록이 있는 시간이에요")).toBeInTheDocument();
    expect(blocked).toHaveBeenCalledTimes(2);
  });

  it("저장하면 캐시를 비우고 다른 탭에 알리고 이벤트를 남긴 뒤 onDone을 한 번 부른다", async () => {
    vi.mocked(createManualRecord).mockResolvedValue([saved(41, iso(DAY, 9), iso(DAY, 10))]);
    const { onDone, invalidate } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "국어" }));
    expect(screen.getByRole("button", { name: "국어" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(saveButton());

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createManualRecord)).toHaveBeenCalledWith({
      startedAt: iso(DAY, 9),
      endedAt: iso(DAY, 10),
      subjectId: 3,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: statsKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["subjects"] });
    expect(vi.mocked(postToNative)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "records-changed" }),
    );
    expect(vi.mocked(trackManualRecordAdd)).toHaveBeenCalledWith({
      entry: "planner_button",
      durationMin: 60,
      hasSubject: true,
      daysAgo: DAYS_AGO,
      trimmedMin: 0,
      pieces: 1,
    });
  });

  it("저장이 끝난 뒤 저장된 기록이 들어와 전부 겹쳐 보여도 막힘 이벤트를 보내지 않는다", async () => {
    const piece = saved(41, iso(DAY, 9), iso(DAY, 10));
    vi.mocked(createManualRecord).mockResolvedValue([piece]);
    const { onDone, update } = renderForm();

    fireEvent.click(saveButton());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));

    update({ sessions: [summary(41, piece.startedAt, piece.endedAt)] });
    expect(vi.mocked(trackManualRecordOverlapBlocked)).not.toHaveBeenCalled();
  });

  it("서버가 409를 주면 그날·다음 날 조회를 다시 받고 전부 겹침 안내를 보여 준다", async () => {
    vi.mocked(createManualRecord).mockRejectedValue(new ApiError("겹침", 409));
    const { onDone, invalidate } = renderForm();

    fireEvent.click(saveButton());

    expect(await screen.findByText("이미 기록이 있는 시간이에요")).toBeInTheDocument();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: statsKeys.daily(7, DAY) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: statsKeys.daily(7, NEXT) });
    expect(vi.mocked(trackManualRecordOverlapBlocked)).toHaveBeenCalledTimes(1);
    expect(saveButton()).toBeDisabled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("그 밖의 실패는 폼을 남기고 다시 시도하게 한다", async () => {
    vi.mocked(createManualRecord).mockRejectedValue(new Error("network"));
    const { onDone } = renderForm();

    fireEvent.click(saveButton());

    expect(await screen.findByText("저장하지 못했어요. 다시 시도해 주세요")).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    expect(startInput()).toHaveValue("09:00");
    expect(onDone).not.toHaveBeenCalled();
  });

  describe("수정", () => {
    // 자정을 넘겨 두 날에 나뉜 한 묶음이다.
    const before = summary(51, iso(DAY, 23), iso(NEXT, 0), {
      source: "MANUAL",
      submissionStartedAt: iso(DAY, 23),
    });
    const after = summary(52, iso(NEXT, 0), iso(NEXT, 1), {
      statDate: NEXT,
      source: "MANUAL",
      submissionStartedAt: iso(DAY, 23),
    });

    it("뒤 조각만 받았어도 묶음 전체 구간과 시작 날짜로 연다", () => {
      renderForm({ mode: { kind: "edit", entry: "records", bundle: [after] }, dateKey: NEXT });

      expect(screen.getByText("3월 4일 화요일")).toBeInTheDocument();
      expect(startInput()).toHaveValue("23:00");
      expect(endInput()).toHaveValue("01:00");
      expect(screen.getByText("다음 날")).toBeInTheDocument();
    });

    it("저장은 묶음 첫 조각 id로 PATCH하고 자기 묶음과는 겹침으로 보지 않는다", async () => {
      vi.mocked(updateManualRecord).mockResolvedValue([
        saved(61, iso(DAY, 23), iso(NEXT, 0)),
        saved(62, iso(NEXT, 0), iso(NEXT, 1)),
      ]);
      const { onDone } = renderForm({
        mode: { kind: "edit", entry: "planner_cell", bundle: [before, after] },
        sessions: [before, after],
      });

      expect(screen.queryByText("이미 기록이 있는 시간이에요")).not.toBeInTheDocument();
      fireEvent.click(saveButton());

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(vi.mocked(updateManualRecord)).toHaveBeenCalledWith(51, {
        startedAt: iso(DAY, 23),
        endedAt: iso(NEXT, 1),
      });
      expect(vi.mocked(trackManualRecordEdit)).toHaveBeenCalledWith({
        entry: "planner_cell",
        durationMin: 120,
        hasSubject: false,
        daysAgo: DAYS_AGO,
      });
    });

    it("삭제는 확인을 거쳐 묶음 전체를 지우고, 길이는 조각 길이의 합이다", async () => {
      vi.mocked(deleteManualRecord).mockResolvedValue(undefined);
      // 겹침을 빼고 저장돼 23:00~23:30과 00:00~01:00으로 남은 묶음. 바깥 구간은 2시간이지만 조각은 1시간 30분이다.
      const trimmed = { ...before, endedAt: iso(DAY, 23, 30) };
      const { onDone } = renderForm({
        mode: { kind: "edit", entry: "records", bundle: [trimmed, after] },
        sessions: [trimmed, after],
      });

      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
      const confirm = await screen.findByRole("alertdialog", { name: "이 기록을 지울까요?" });
      expect(within(confirm).getByRole("button", { name: "취소" })).toBeInTheDocument();
      fireEvent.click(within(confirm).getByRole("button", { name: "지우기" }));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(vi.mocked(deleteManualRecord)).toHaveBeenCalledWith(51);
      expect(vi.mocked(trackManualRecordDelete)).toHaveBeenCalledWith({
        entry: "records",
        durationMin: 90,
        daysAgo: DAYS_AGO,
      });
    });

    it("뒤 조각만 받은 묶음을 지우면 길이는 받은 조각만큼이다", async () => {
      vi.mocked(deleteManualRecord).mockResolvedValue(undefined);
      const { onDone } = renderForm({
        mode: { kind: "edit", entry: "records", bundle: [after] },
        dateKey: NEXT,
        sessions: [after],
      });

      fireEvent.click(screen.getByRole("button", { name: "삭제" }));
      const confirm = await screen.findByRole("alertdialog", { name: "이 기록을 지울까요?" });
      fireEvent.click(within(confirm).getByRole("button", { name: "지우기" }));

      await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
      expect(vi.mocked(deleteManualRecord)).toHaveBeenCalledWith(52);
      expect(vi.mocked(trackManualRecordDelete)).toHaveBeenCalledWith({
        entry: "records",
        durationMin: 60,
        daysAgo: DAYS_AGO,
      });
    });

    it("지운 과목으로 저장된 기록은 그 과목을 고른 채 줄 끝에 흐리게 보여 준다", () => {
      const physics: SubjectRef = { id: 9, name: "물리", colorIndex: 2, deleted: true };
      const withDeleted = summary(71, iso(DAY, 14), iso(DAY, 15), {
        source: "MANUAL",
        submissionStartedAt: iso(DAY, 14),
        subjectSegments: [
          {
            subjectId: 9,
            startedAt: iso(DAY, 14),
            endedAt: iso(DAY, 15),
            studySec: 3600,
            focusSec: 3600,
          },
        ],
      });
      renderForm({
        mode: { kind: "edit", entry: "records", bundle: [withDeleted] },
        subjectRefs: new Map([[9, physics]]),
      });

      const chip = screen.getByRole("button", { name: "물리" });
      expect(chip).toHaveAttribute("aria-pressed", "true");
      expect(chip).toBeDisabled();
      expect(screen.getByRole("button", { name: "과목 없음" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });
  });
});
