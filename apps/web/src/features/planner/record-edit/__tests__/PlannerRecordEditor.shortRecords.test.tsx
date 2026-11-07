import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
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
it("분 올림으로 같은 시각이 되는 짧은 기록도 격자에서 골라 지울 수 있다", () => {
  const { grid } = mount();
  const short = within(grid).getByRole("button", { name: /22:30.*22:30/ });
  expect(Number.parseFloat(short.style.width)).toBeGreaterThan(0);
  fireEvent.click(short);
  expect(screen.getByRole("button", { name: "시작 시각 조절" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "끝 시각 조절" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "기록 삭제" })).toBeEnabled();
});
it("05시 밖에서 시작한 기록을 창 시작까지 줄이면 현재 격자에서 사라진다", () => {
  const { grid } = mount([
    plannerRecord({
      key: "crossing",
      source: "MANUAL",
      startedAt: iso("05:00:00"),
      endedAt: iso("05:30:00"),
      fullStartedAt: iso("04:00:00"),
      fullEndedAt: iso("05:30:00"),
      subjectSegments: [],
    }),
  ]);
  fireEvent.click(within(grid).getByRole("button", { name: /04:00.*05:30/ }));
  fireEvent.pointerDown(screen.getByRole("button", { name: "끝 시각 조절" }), {
    clientX: 300,
    clientY: 24,
  });
  fireEvent.pointerMove(grid, { clientX: 0, clientY: 24 });
  fireEvent.pointerUp(grid, { clientX: 0, clientY: 24 });
  expect(screen.getByLabelText("끝")).toHaveValue("05:00");
  expect(grid.querySelectorAll("[data-record]")).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "끝 시각 조절" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
});
it("옆의 짧은 기록 때문에 확장을 거절해도 손을 놓은 뒤 안내가 남고 줄이기는 된다", async () => {
  const { grid } = mount();
  fireEvent.click(within(grid).getByRole("button", { name: /22:00.*22:30/ }));
  fireEvent.pointerDown(screen.getByRole("button", { name: "끝 시각 조절" }), {
    clientX: 300,
    clientY: 568,
  });
  fireEvent.pointerMove(grid, { clientX: 360, clientY: 568 });
  fireEvent.pointerUp(grid, { clientX: 360, clientY: 568 });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(await screen.findByText("다른 기록과 겹치지 않게 골라 주세요")).toBeVisible();
  expect(screen.getByLabelText("끝")).toHaveValue("22:30");
  expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  fireEvent.pointerDown(screen.getByRole("button", { name: "끝 시각 조절" }), {
    clientX: 300,
    clientY: 568,
  });
  fireEvent.pointerMove(grid, { clientX: 250, clientY: 568 });
  fireEvent.pointerUp(grid, { clientX: 250, clientY: 568 });
  expect(screen.getByLabelText("끝")).toHaveValue("22:25");
});
it("직접 시각 입력이 거절되면 격자 아래 오류까지 스크롤하지 않아도 안내한다", async () => {
  const { grid } = mount();
  fireEvent.click(within(grid).getByRole("button", { name: /22:00.*22:30/ }));
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "22:36" } });
  await waitFor(() =>
    expect(document.querySelector("[data-sonner-toast]")).toHaveTextContent(
      "다른 기록과 겹치지 않게 골라 주세요",
    ),
  );
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
});
it("짧은 기록 삭제 뒤 확장하면 삭제를 먼저 보내고 원본 시각은 건드리지 않는다", async () => {
  const request = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: body.operations.map((operation: { operationId: string; key: string }) => ({
        operationId: operation.operationId,
        key: operation.key,
        success: true,
        status: 200,
        code: null,
        message: null,
      })),
    });
  });
  vi.stubGlobal("fetch", request);
  const { day, grid } = mount();
  const before = JSON.stringify(day);
  fireEvent.click(within(grid).getByRole("button", { name: /22:30.*22:30/ }));
  fireEvent.click(screen.getByRole("button", { name: "기록 삭제" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "삭제" }));
  fireEvent.click(within(grid).getByRole("button", { name: /22:00.*22:30/ }));
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "22:36" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
  expect(body.operations).toMatchObject([
    { action: "DELETE", key: "short" },
    {
      action: "UPDATE",
      key: "visible",
      startedAt: iso("22:00:00"),
      endedAt: "2026-11-03T13:36:00.000Z",
    },
  ]);
  expect(JSON.stringify(day)).toBe(before);
});
