import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { plannerDay, plannerRangeRecord as plannerRecord } from "@/test/plannerFixtures";
import { PlannerRecordEditor } from "../PlannerRecordEditor";

class Pointer extends MouseEvent {
  readonly pointerId = 1;
  readonly pointerType = "touch";
  readonly isPrimary = true;
}
const iso = (time: string) => `2026-11-03T${time}+09:00`;
beforeEach(() => {
  vi.stubGlobal("PointerEvent", Pointer);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  toast.dismiss();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(
  records = [
    plannerRecord({
      key: "visible",
      startedAt: iso("22:00:00"),
      endedAt: iso("22:29:44.190"),
      subjectSegments: [],
    }),
    plannerRecord({
      key: "short",
      startedAt: iso("22:29:49.686"),
      endedAt: iso("22:29:53.341"),
      subjectSegments: [],
    }),
  ],
) {
  const day = plannerDay({ date: "2026-11-03", records });
  render(
    <MemoryRouter>
      <PlannerRecordEditor day={day} subjects={[]} onClose={() => {}} onSaved={async () => {}} />
      <Toaster />
    </MemoryRouter>,
  );
  const grid = screen.getByLabelText("기록 편집 격자");
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 600,
    height: 768,
    right: 600,
    bottom: 768,
    x: 0,
    y: 0,
    toJSON() {},
  });
  return { day, grid };
}
it("같은 분의 서로 다른 부모 중 짧은 기록도 따로 선택하고 실제 길이를 확인한다", () => {
  const { grid } = mount();
  const short = grid.querySelector<HTMLButtonElement>('[data-record="short"]')!;
  expect(Number.parseFloat(short.style.width)).toBeGreaterThan(0);
  fireEvent.click(short);
  expect(screen.getByLabelText("시작")).toHaveValue("22:29");
  expect(screen.getByLabelText("끝")).toHaveValue("22:30");
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("4초");
  expect(screen.getByRole("button", { name: "기록 삭제" })).toBeEnabled();
});

it("05시 경계 기록도 조회 창 안의 블록만 선택하고 밖의 전체 경계를 노출하지 않는다", () => {
  const { grid } = mount([
    plannerRecord({
      key: "crossing",
      startedAt: iso("05:00:00"),
      endedAt: iso("05:30:00"),
      fullStartedAt: iso("04:00:00"),
      fullEndedAt: iso("05:30:00"),
      subjectSegments: [],
    }),
  ]);
  fireEvent.click(grid.querySelector('[data-record="crossing"]')!);
  expect(screen.getByLabelText("시작")).toHaveValue("05:00");
  expect(screen.getByLabelText("끝")).toHaveValue("05:30");
  fireEvent.change(screen.getByLabelText("시작"), { target: { value: "04:59" } });
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  expect(grid.querySelector('[data-record="crossing"]')).toBeInTheDocument();
});

it("같은 분의 다른 부모를 지나 빈 시간으로 늘리면 늘린 만큼만 길이에 더한다", () => {
  const { grid } = mount();
  fireEvent.click(grid.querySelector('[data-record="visible"]')!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "22:36" } });
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("35분 45초");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(grid.querySelector('[data-record="short"]')).toBeInTheDocument();
});

it("역전된 분 범위를 입력하면 화면 안에 이유를 알리고 저장을 막는다", async () => {
  const { grid } = mount();
  fireEvent.click(grid.querySelector('[data-record="visible"]')!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "21:59" } });
  await waitFor(() =>
    expect(document.querySelector("[data-sonner-toast]")).toHaveTextContent(
      "시작과 끝을 다시 확인해 주세요",
    ),
  );
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
});

it("같은 분의 짧은 부모 삭제와 다른 부모 과목 변경을 독립된 범위로 저장한다", async () => {
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: body.operations.map((op: { operationId: string; key: string }) => ({
        operationId: op.operationId,
        key: op.key,
        revision: 1,
        success: true,
        status: 200,
        code: null,
        message: null,
      })),
    });
  });
  vi.stubGlobal("fetch", request);
  const { day, grid } = mount();
  const before = structuredClone(day);
  fireEvent.click(grid.querySelector('[data-record="short"]')!);
  fireEvent.click(screen.getByRole("button", { name: "기록 삭제" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제" }));
  expect(grid.querySelector('[data-record="visible"]')).toBeInTheDocument();
  fireEvent.click(grid.querySelector('[data-record="visible"]')!);
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "22:36" } });
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "과목 없음" }));
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
  expect(body.operations).toMatchObject([
    {
      action: "EDIT_RANGES",
      key: "visible",
      ranges: [
        {
          change: "SUBJECT",
          subjectId: null,
          startedAt: "2026-11-03T13:00:00.000Z",
          endedAt: "2026-11-03T13:30:00.000Z",
        },
        {
          change: "ADD",
          subjectId: null,
          startedAt: "2026-11-03T13:30:00.000Z",
          endedAt: "2026-11-03T13:36:00.000Z",
        },
      ],
    },
    {
      action: "EDIT_RANGES",
      key: "short",
      ranges: [
        {
          change: "DELETE",
          startedAt: "2026-11-03T13:29:00.000Z",
          endedAt: "2026-11-03T13:30:00.000Z",
        },
      ],
    },
  ]);
  expect(day).toEqual(before);
});
