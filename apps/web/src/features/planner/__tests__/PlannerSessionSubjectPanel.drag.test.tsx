import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SubjectsStore } from "@/features/study-session/useSubjects";
import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { PlannerSessionSubjectPanel } from "../PlannerSessionSubjectPanel";

class Pointer extends MouseEvent {
  pointerId = 1;
  isPrimary = true;
  pointerType = "touch";
}
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T10:00:00Z"));
  vi.stubGlobal("PointerEvent", Pointer);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => null),
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function mount(landscape = false) {
  const subjects = [
    plannerSubject({ tasks: [plannerTask()] }),
    plannerSubject({ id: 4, name: "영어" }),
  ];
  const writes: { path: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      if (init?.method && init.method !== "GET") {
        writes.push({ path: String(input), body: JSON.parse(String(init.body)) });
        return new Response(null, { status: 204 });
      }
      return Response.json(plannerDay({ date: "2026-11-05", subjects }));
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const selected = vi.fn();
  const view = render(
    <QueryClientProvider client={client}>
      <PlannerSessionSubjectPanel
        userId={7}
        store={{ subjects, status: "ready", reload: vi.fn() } as unknown as SubjectsStore}
        selection={3}
        onSelect={selected}
        onRequestClose={() => {}}
        paused={false}
        onNotice={() => {}}
        liveTotals={new Map()}
        landscape={landscape}
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(
      view.container.querySelectorAll("[data-session-subject-list] [data-subject-id]"),
    ).toHaveLength(2),
  );
  const rows = Array.from(view.container.querySelectorAll<HTMLElement>("[data-subject-id]"));
  const first = rows[0]!;
  const head =
    first.querySelector<HTMLElement>("[data-session-subject-head]") ??
    within(first).getByText("수학");
  for (const [index, row] of rows.entries()) {
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(20, 100 + Number(row.style.order || index) * 100, 150, 80),
    );
    Object.defineProperties(row, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: () => true },
      releasePointerCapture: { configurable: true, value: vi.fn() },
    });
  }
  return { ...view, rows, first, head, writes, selected };
}
function hold(head: HTMLElement) {
  vi.useFakeTimers();
  fireEvent.pointerDown(head, { clientX: 40, clientY: 120 });
  act(() => vi.advanceTimersByTime(480));
}
function move(head: HTMLElement, target: HTMLElement) {
  vi.mocked(document.elementFromPoint).mockReturnValue(target);
  fireEvent.pointerMove(head, { clientX: 70, clientY: 260 });
}
it.each([false, true])(
  "가로=%s: 순서 변경 대신 왼쪽 할 일 추가로 입력 시트를 연다",
  async (landscape) => {
    await mount(landscape);
    expect(screen.queryByRole("button", { name: "순서 변경" })).not.toBeInTheDocument();
    const buttons = screen.getAllByRole("button", { name: /할 일 추가/ });
    fireEvent.click(buttons.at(-1)!);
    expect(await screen.findByRole("textbox", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수학", pressed: true })).toBeInTheDocument();
  },
);
it.each([false, true])(
  "가로=%s: 머리를 잡아 끌면 고스트가 따라오고 원본 DOM은 유지하며 바뀐 순서만 저장한다",
  async (landscape) => {
    const { head, first, rows, writes, container } = await mount(landscape);
    hold(head);
    move(head, rows[1]!);
    expect(screen.getByTestId("session-subject-drag-preview")).toHaveStyle({
      transform: "translate3d(30px, 140px, 0)",
    });
    expect(screen.getByTestId("session-subject-drag-preview")).toHaveClass("fixed");
    expect(Array.from(container.querySelectorAll("[data-subject-id]"))).toEqual(rows);
    expect(first.style.order).toBe("1");
    fireEvent.pointerUp(head);
    await act(async () => {});
    expect(writes).toHaveLength(1);
    expect(writes[0]?.body).toEqual({ subjectIds: [4, 3] });
  },
);
it.each(["cancel", "capture", "blur", "outside"])(
  "%s 취소는 순서를 저장하지 않는다",
  async (reason) => {
    const { head, first, rows, writes } = await mount();
    hold(head);
    move(head, rows[1]!);
    if (reason === "cancel") fireEvent.pointerCancel(head);
    else if (reason === "capture")
      fireEvent(first, new Pointer("lostpointercapture", { bubbles: true }));
    else if (reason === "blur") fireEvent(window, new Event("blur"));
    else {
      vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
      fireEvent.pointerMove(head, { clientX: 400, clientY: 400 });
      fireEvent.pointerUp(head);
    }
    await act(async () => {});
    expect(writes).toEqual([]);
    expect(screen.queryByTestId("session-subject-drag-preview")).not.toBeInTheDocument();
    expect(first.style.order).toBe("0");
  },
);
it("움직이지 않고 길게 누른 메뉴는 이름변경/삭제만 제공하며 순서를 저장하지 않는다", async () => {
  const { head, writes } = await mount();
  hold(head);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  fireEvent.pointerUp(head);
  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(within(screen.getByRole("menu")).queryByText("할 일 추가")).not.toBeInTheDocument();
  expect(writes).toEqual([]);
});

it("과목 짧은 탭은 측정 선택을 유지하고 길게 잡기 전 스크롤은 선택·정렬하지 않는다", async () => {
  const { first, selected, writes } = await mount();
  const button = within(first).getByRole("button", { name: /측정 멈추기/ });
  fireEvent.pointerDown(button, { clientX: 40, clientY: 120 });
  fireEvent.pointerUp(button);
  fireEvent.click(button, { detail: 1 });
  expect(selected).toHaveBeenCalledExactlyOnceWith(null);
  selected.mockClear();
  fireEvent.pointerDown(button, { clientX: 40, clientY: 120 });
  fireEvent.pointerMove(button, { clientX: 40, clientY: 150 });
  fireEvent.pointerUp(button);
  fireEvent.click(button, { detail: 1 });
  expect(selected).not.toHaveBeenCalled();
  expect(writes).toEqual([]);
});
it("끌어서 원래 순서로 돌아온 경우 저장하지 않는다", async () => {
  const { head, first, rows, writes } = await mount();
  hold(head);
  move(head, rows[1]!);
  vi.mocked(document.elementFromPoint).mockReturnValue(rows[1]!);
  fireEvent.pointerMove(head, { clientX: 40, clientY: 120 });
  fireEvent.pointerUp(head);
  await act(async () => {});
  expect(writes).toEqual([]);
  expect(first.style.order).toBe("0");
});

it("가로에서 보는 과목을 바꿔도 측정은 유지하고 그 과목으로 할 일을 추가한다", async () => {
  const { rows, selected } = await mount(true);
  const title = within(rows[1]!).getByText("영어");
  fireEvent.pointerDown(title, { clientX: 40, clientY: 220 });
  fireEvent.pointerUp(title);
  fireEvent.click(title, { detail: 1 });
  expect(selected).not.toHaveBeenCalled();
  const add = screen.getAllByRole("button", { name: /할 일 추가/ }).at(-1)!;
  fireEvent.click(add);
  await screen.findByRole("textbox", {}, { timeout: 5000 });
  expect(screen.getByRole("button", { name: "영어", pressed: true })).toBeInTheDocument();
});

it("끌기 취소 후 다음 재생 버튼 터치를 삼키지 않는다", async () => {
  const { head, rows, selected } = await mount(true);
  hold(head);
  move(head, rows[1]!);
  fireEvent.pointerCancel(head);
  const play = within(rows[0]!).getByRole("button", { name: /수학.*멈추기/ });
  fireEvent.pointerDown(play);
  fireEvent.pointerUp(play);
  fireEvent.click(play, { detail: 1 });
  expect(selected).toHaveBeenCalledExactlyOnceWith(null);
});

it("두 번째 손가락의 이동·놓기·취소는 잡고 있는 첫 손가락의 끌기를 끝내지 않는다", async () => {
  const { head, rows, writes } = await mount();
  hold(head);
  move(head, rows[1]!);
  for (const type of ["pointermove", "pointerup", "pointercancel", "lostpointercapture"]) {
    const event = new Pointer(type, { bubbles: true, clientX: 200, clientY: 400 });
    Object.defineProperty(event, "pointerId", { value: 2 });
    fireEvent(type === "lostpointercapture" ? rows[0]! : head, event);
    expect(screen.getByTestId("session-subject-drag-preview")).toHaveStyle({
      transform: "translate3d(30px, 140px, 0)",
    });
  }
  expect(writes).toEqual([]);
  fireEvent.pointerCancel(head);
});

it("세션 바깥 body의 끌기 미리보기에도 과목 카드 면과 선택링의 세션 색을 넘긴다", async () => {
  const { head, rows } = await mount();
  hold(head);
  move(head, rows[1]!);
  const preview = screen.getByTestId("session-subject-drag-preview");
  expect(preview.style.getPropertyValue("--session-sheet-surface")).toBe(
    "rgba(255, 255, 255, 0.06)",
  );
  expect(preview.style.getPropertyValue("--session-sheet-selected-card-ring")).not.toBe("");
  fireEvent.pointerCancel(head);
});

it("길게 누르기 전에 카드 밖으로 이동해 손을 떼면 타이머가 남지 않는다", async () => {
  const { head } = await mount();
  vi.useFakeTimers();
  fireEvent.pointerDown(head, { clientX: 40, clientY: 120 });
  fireEvent.pointerMove(document.body, { clientX: 380, clientY: 700 });
  fireEvent.pointerUp(document.body, { clientX: 380, clientY: 700 });
  act(() => vi.advanceTimersByTime(550));
  fireEvent.pointerMove(head, { clientX: 50, clientY: 140 });
  expect(screen.queryByTestId("session-subject-drag-preview")).not.toBeInTheDocument();
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
});
