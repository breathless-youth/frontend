import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlannerRecordEditor } from "../PlannerRecordEditor";
import { plannerDay, plannerRecord } from "@/test/plannerFixtures";

class Pointer extends MouseEvent {
  readonly pointerId = 1;
  readonly pointerType = "touch";
  readonly isPrimary = true;
}
let client: QueryClient;
const request = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal("PointerEvent", Pointer);
  vi.stubGlobal("fetch", request);
  request.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount() {
  const close = vi.fn();
  render(
    <QueryClientProvider client={client}>
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
          subjects={[{ id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] }]}
          onClose={close}
          onSaved={async () => {}}
          onDateChange={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const grid = screen.getByLabelText("기록 편집 격자");
  grid.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 600,
    height: 672,
    right: 600,
    bottom: 672,
    x: 0,
    y: 0,
    toJSON() {},
  });
  select();
  return { close, grid };
}
function select() {
  fireEvent.click(screen.getAllByRole("button", { name: /09:13.*09:29/ })[0]!, { detail: 1 });
}
function down(target: Element, x = 400, y = 80) {
  fireEvent.pointerDown(target, { clientX: x, clientY: y });
}
function up(target: Element, x = 400, y = 80) {
  fireEvent.pointerUp(target, { clientX: x, clientY: y });
}
function outsideTap() {
  const target = screen.getByRole("heading", { name: "기록 고치기" });
  down(target);
  up(target);
}

it("바깥 탭은 마지막 유효 초안을 보존하고 불완전 입력 오류만 걷으며 저장하지 않는다", async () => {
  const { close } = mount();
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:30" } });
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "" } });
  expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  outsideTap();
  expect(screen.queryByRole("region", { name: "선택한 기록" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  expect(request).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  request.mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    return Response.json({
      results: body.operations.map((op: { operationId: string }) => ({
        operationId: op.operationId,
        success: true,
        key: "c:updated",
        status: 200,
        code: null,
        message: null,
      })),
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(JSON.parse(String(request.mock.calls[0]![1]?.body))).toMatchObject({
    operations: [{ action: "UPDATE", endedAt: "2026-11-04T00:30:00.000Z" }],
  });
});
it("Escape는 패널만 닫고 편집기와 초안을 유지한다", () => {
  const { close } = mount();
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:30" } });
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("region", { name: "선택한 기록" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /09:13.*09:30/ }).length).toBeGreaterThan(0);
  expect(close).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
it("기록 선택과 시간 손잡이 드래그는 패널을 닫지 않는다", () => {
  const { grid } = mount();
  const record = within(grid).getByRole("button", { name: /09:13.*09:29/ });
  down(record, 200, 122);
  up(record, 200, 122);
  fireEvent.click(record, { detail: 1 });
  const end = screen.getByRole("button", { name: "끝 시각 조절" });
  down(end, 290, 122);
  fireEvent.pointerMove(grid, { clientX: 310, clientY: 122 });
  up(grid, 310, 122);
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("09:31");
  expect(request).not.toHaveBeenCalled();
});
it("시간표 스크롤과 길게 눌러 새 기록 만들기는 바깥 탭 닫기가 아니다", () => {
  const { grid } = mount();
  down(grid, 50, 150);
  fireEvent.pointerMove(grid, { clientX: 50, clientY: 180 });
  up(grid, 50, 180);
  expect(screen.getByRole("region", { name: "선택한 기록" })).toBeInTheDocument();
  vi.useFakeTimers();
  down(grid, 50, 150);
  act(() => vi.advanceTimersByTime(500));
  fireEvent.pointerMove(grid, { clientX: 100, clientY: 150 });
  up(grid, 100, 150);
  vi.useRealTimers();
  const dialog = screen.getByRole("dialog", { name: "어떤 과목을 공부했나요?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "수학" }));
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("수학");
  expect(request).not.toHaveBeenCalled();
});
it("과목 시트에서 선택하고 닫아도 선택한 기록은 남는다", () => {
  mount();
  const panel = screen.getByRole("region", { name: "선택한 기록" });
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  expect(panel).not.toBeVisible();
  const dialog = screen.getByRole("dialog", { name: "어떤 과목을 공부했나요?" });
  const math = within(dialog).getByRole("button", { name: "수학" });
  down(math);
  up(math);
  fireEvent.click(math);
  expect(panel).toBeVisible();
  expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveTextContent("수학");
  expect(request).not.toHaveBeenCalled();
});
it("과목 시트를 취소하면 숨긴 패널과 입력 초안이 다시 나타난다", async () => {
  mount();
  const panel = screen.getByRole("region", { name: "선택한 기록" });
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:30" } });
  fireEvent.click(screen.getByRole("button", { name: "과목 바꾸기" }));
  expect(panel).not.toBeVisible();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(panel).toBeVisible();
  expect(screen.getByLabelText("끝")).toHaveValue("09:30");
  expect(request).not.toHaveBeenCalled();
});
it("삭제 말풍선 바깥 닫기와 Escape는 아래 선택 패널까지 닫지 않는다", async () => {
  mount();
  const panel = screen.getByRole("region", { name: "선택한 기록" });
  fireEvent.click(screen.getByRole("button", { name: "기록 삭제" }));
  const dialog = screen.getByRole("alertdialog", { name: "이 기록을 삭제할까요?" });
  down(dialog);
  up(dialog);
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(panel).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "기록 삭제" }));
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  expect(panel).toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
it("날짜 시트와 변경 버리기 확인이 열린 동안 아래 패널을 보호한다", async () => {
  mount();
  const panel = screen.getByRole("region", { name: "선택한 기록" });
  fireEvent.click(screen.getByRole("button", { name: "날짜 고르기" }));
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(panel).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:30" } });
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  const confirm = screen.getByRole("alertdialog");
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(confirm).not.toBeInTheDocument());
  expect(panel).toBeInTheDocument();
});
it("저장 응답 대기 중에는 바깥 탭과 Escape를 무시한다", () => {
  mount();
  request.mockReturnValue(new Promise(() => {}));
  fireEvent.change(screen.getByLabelText("끝"), { target: { value: "09:30" } });
  fireEvent.click(screen.getByRole("button", { name: "저장" }));
  outsideTap();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("region", { name: "선택한 기록" })).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(1);
});
it.each(["keyboard", "drag"])(
  "%s 조작에도 내용 높이를 유지하며 노치 53px와 본문 여백 22px를 보호한다",
  (method) => {
    vi.stubGlobal("innerHeight", 844);
    const { grid } = mount();
    const body = grid.parentElement!.parentElement!;
    body.style.paddingTop = "2px";
    body.style.paddingBottom = "20px";
    const rect = (top: number, height: number) => ({
      x: 0,
      y: top,
      left: 0,
      right: 390,
      width: 390,
      top,
      bottom: top + height,
      height,
      toJSON() {},
    });
    vi.spyOn(screen.getByRole("main"), "getBoundingClientRect").mockReturnValue(rect(0, 844));
    vi.spyOn(body, "getBoundingClientRect").mockReturnValue(rect(105, 439));
    vi.spyOn(
      screen.getByRole("region", { name: "선택한 기록" }),
      "getBoundingClientRect",
    ).mockReturnValue(rect(544, 300));
    act(() => window.dispatchEvent(new Event("resize")));
    const bar = screen.getByRole("button", { name: "기록 패널 닫기" });
    if (method === "keyboard") fireEvent.keyDown(bar, { key: "End" });
    else {
      down(bar, 200, 544);
      fireEvent.pointerMove(bar, { clientX: 200, clientY: -300 });
      up(bar, 200, -300);
    }
    expect(screen.getByRole("region", { name: "선택한 기록" })).toHaveStyle({ maxHeight: "717px" });
    expect(screen.getByRole("region", { name: "선택한 기록" }).style.height).toBe("");
  },
);

it("키보드가 레이아웃 높이를 유지해도 패널 하단을 보이는 경계로 올리고 복원한다", () => {
  vi.stubGlobal("innerHeight", 844);
  const viewport = Object.assign(new EventTarget(), { height: 844, offsetTop: 0 });
  vi.stubGlobal("visualViewport", viewport);
  const { grid } = mount();
  const main = screen.getByRole("main");
  const body = grid.parentElement!.parentElement!;
  body.style.paddingTop = "2px";
  body.style.paddingBottom = "20px";
  const rect = (top: number, height: number) => ({
    x: 0,
    y: top,
    left: 0,
    right: 390,
    width: 390,
    top,
    bottom: top + height,
    height,
    toJSON() {},
  });
  vi.spyOn(main, "getBoundingClientRect").mockReturnValue(rect(0, 844));
  vi.spyOn(body, "getBoundingClientRect").mockReturnValue(rect(105, 439));
  const bar = screen.getByRole("button", { name: "기록 패널 닫기" });
  for (const [height, offsetTop, expectedBottom] of [
    [400, 0, 400],
    [400, 60, 460],
    [844, 0, 844],
  ]) {
    act(() => {
      Object.assign(viewport, { height, offsetTop });
      viewport.dispatchEvent(new Event(offsetTop ? "scroll" : "resize"));
    });
    // The dock is the last flex child: bottom padding is the space below its footer.
    const dockBottom = 844 - (parseFloat(getComputedStyle(main).paddingBottom) || 0);
    expect(dockBottom).toBe(expectedBottom);
    fireEvent.keyDown(bar, { key: "End" });
    expect(
      parseFloat(screen.getByRole("region", { name: "선택한 기록" }).style.maxHeight),
    ).toBeLessThanOrEqual(expectedBottom! - 127);
    expect(screen.getByLabelText("끝")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "완료" })).toBeEnabled();
  }
  expect(request).not.toHaveBeenCalled();
});
