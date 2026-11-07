import { MemoryRouter } from "react-router-dom";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";
class Pointer extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType = "touch";
  readonly isPrimary: boolean;
  constructor(type: string, options: PointerEventInit = {}) {
    super(type, options);
    this.pointerId = options.pointerId ?? 1;
    this.isPrimary = options.isPrimary ?? true;
  }
}
beforeEach(() => {
  vi.stubGlobal("PointerEvent", Pointer);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function mount() {
  render(
    <MemoryRouter>
      <PlannerRecordEditor
        day={plannerDay({
          date: "2026-11-04",
          records: [
            plannerRecord({
              startedAt: "2026-11-04T00:13:00Z",
              endedAt: "2026-11-04T00:29:00Z",
              subjectSegments: [],
            }),
          ],
        })}
        subjects={[]}
        onClose={() => {}}
        onSaved={async () => {}}
      />
    </MemoryRouter>,
  );
  const grid = screen.getByLabelText("기록 편집 격자");
  grid.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 600,
    bottom: 768,
    width: 600,
    height: 768,
    toJSON() {},
  });
  fireEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!);
  return grid;
}
const primary = (x: number, y = 140) => ({ pointerId: 1, isPrimary: true, clientX: x, clientY: y });
const secondary = (x: number, y = 140) => ({
  pointerId: 2,
  isPrimary: false,
  clientX: x,
  clientY: y,
});
it.each(["pointerUp", "pointerCancel"] as const)(
  "보조 포인터의 이동과 %s는 진행 중인 시간 드래그를 바꾸거나 끝내지 않는다",
  (ending) => {
    const grid = mount();
    fireEvent.pointerDown(screen.getByRole("button", { name: "끝 시각 조절" }), primary(290));
    fireEvent.pointerMove(grid, primary(310));
    expect(screen.getByLabelText("끝")).toHaveValue("09:31");
    fireEvent.pointerDown(grid, secondary(450));
    fireEvent.pointerMove(grid, secondary(490));
    expect(screen.getByLabelText("끝")).toHaveValue("09:31");
    fireEvent[ending](grid, secondary(490));
    expect(screen.getByLabelText("끝")).toHaveValue("09:31");
    fireEvent.pointerMove(grid, primary(330));
    expect(screen.getByLabelText("끝")).toHaveValue("09:33");
    if (ending === "pointerUp") {
      fireEvent.pointerUp(grid, primary(330));
      expect(screen.getByLabelText("끝")).toHaveValue("09:33");
    } else {
      fireEvent.pointerCancel(grid, primary(330));
      expect(screen.getAllByRole("button", { name: /09:13.*09:29/ }).length).toBeGreaterThan(0);
    }
  },
);
it("보조 포인터가 움직이고 끝나도 첫 포인터의 길게 눌러 생성은 유지한다", async () => {
  const grid = mount();
  vi.useFakeTimers();
  fireEvent.pointerDown(grid, primary(100, 100));
  fireEvent.pointerDown(grid, secondary(400, 100));
  fireEvent.pointerMove(grid, secondary(500, 100));
  fireEvent.pointerCancel(grid, secondary(500, 100));
  await act(async () => vi.advanceTimersByTime(500));
  expect(grid.querySelectorAll("[data-record]")).toHaveLength(2);
  fireEvent.pointerUp(grid, secondary(500, 100));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  fireEvent.pointerMove(grid, primary(200, 100));
  await act(async () => {
    fireEvent.pointerUp(grid, primary(200, 100));
  });
  vi.useRealTimers();
  expect(screen.getByRole("dialog", { name: "어떤 과목을 공부했나요?" })).toBeInTheDocument();
});
