import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { plannerDay, plannerSubject, plannerTask } from "@/test/plannerFixtures";
import { PlannerPlanSubjects, type PlanSubjectActions } from "../PlannerPlanSubjects";
import { plannerPlanModel } from "../plannerPlanModel";

class Pointer extends MouseEvent {
  pointerId = 1;
  isPrimary = true;
  pointerType = "touch";
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("PointerEvent", Pointer);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false })),
  );
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: vi.fn(() => null),
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(options: { mode?: "today" | "past"; deleted?: boolean } = {}) {
  const actions: PlanSubjectActions = {
    addSubject: vi.fn(),
    addTask: vi.fn(),
    task: vi.fn(),
    toggle: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(async () => {}),
  };
  const plan = plannerPlanModel(
    plannerDay({
      subjects: [
        plannerSubject({ tasks: [plannerTask()], deleted: options.deleted ?? false }),
        plannerSubject({ id: 4, name: "영어" }),
        plannerSubject({ id: 5, name: "국어" }),
      ],
    }),
    "2026-11-06",
  );
  const view = render(
    <PlannerPlanSubjects
      subjects={plan.subjects}
      mode={options.mode ?? "today"}
      pending={false}
      actions={actions}
    />,
  );
  const rows = Array.from(view.container.querySelectorAll<HTMLElement>("[data-subject-id]"));
  for (const [index, row] of rows.entries()) {
    vi.spyOn(row, "getBoundingClientRect").mockImplementation(
      () => new DOMRect(20, 100 + Number(row.style.order || index) * 100, 150, 80),
    );
  }
  const first = rows[0]!;
  const title = within(first).getByRole("button", { name: /^수학(?: 0분)?$/ });
  const handle = first;
  const capture = vi.fn();
  const release = vi.fn();
  Object.defineProperties(handle, {
    setPointerCapture: { configurable: true, value: capture },
    hasPointerCapture: { configurable: true, value: () => true },
    releasePointerCapture: { configurable: true, value: release },
  });
  return { ...view, actions, rows, first, title, handle, capture, release };
}

function hold(title: HTMLElement) {
  fireEvent.pointerDown(title, { clientX: 40, clientY: 120 });
  act(() => vi.advanceTimersByTime(480));
}

function move(title: HTMLElement, target: HTMLElement) {
  vi.mocked(document.elementFromPoint).mockReturnValue(target);
  fireEvent.pointerMove(title, { clientX: 70, clientY: 260 });
}

it("잡은 과목이 원래 크기로 손가락을 따라오고 캡처된 DOM은 재삽입하지 않는다", () => {
  const { title, first, rows, container } = mount();
  hold(title);
  move(title, rows[1]!);
  const preview = screen.getByTestId("planner-subject-drag-preview");
  expect(preview.parentElement).toBe(document.body);
  expect(preview).toHaveAttribute("aria-hidden", "true");
  expect(preview).toHaveStyle({ left: "20px", top: "100px", width: "150px" });
  expect(preview).toHaveStyle({ transform: "translate3d(30px, 140px, 0)" });
  expect(first).not.toHaveClass("ring-2", "ring-primary");
  expect(first).toHaveClass("opacity-35");
  expect(Array.from(container.querySelectorAll("[data-subject-id]"))).toEqual(rows);
  expect(first.style.order).toBe("1");
  expect(rows[1]!.style.order).toBe("0");
  expect(screen.getAllByRole("button", { name: "수학" })).toHaveLength(1);
});

it("길게 누르는 동안 포커스를 유지하고 움직이지 않고 손을 떼면 메뉴가 열린다", () => {
  const { title, actions } = mount();
  title.focus();
  hold(title);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(document.activeElement).toBe(title);
  fireEvent.pointerUp(title);
  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(actions.reorder).not.toHaveBeenCalled();
});

it("다른 과목의 가운데를 지나 손을 놓을 때만 바뀐 순서를 한 번 저장한다", async () => {
  const { title, rows, actions } = mount();
  hold(title);
  move(title, rows[1]!);
  expect(actions.reorder).not.toHaveBeenCalled();
  fireEvent.pointerUp(title);
  await act(async () => {});
  expect(actions.reorder).toHaveBeenCalledExactlyOnceWith([4, 3, 5]);
  expect(screen.queryByTestId("planner-subject-drag-preview")).not.toBeInTheDocument();
});

it("시스템이 끌기를 취소하면 미리보기와 임시 순서를 되돌리고 저장하지 않는다", async () => {
  const { title, first, rows, actions } = mount();
  hold(title);
  move(title, rows[1]!);
  fireEvent.pointerCancel(title);
  await act(async () => {});
  expect(actions.reorder).not.toHaveBeenCalled();
  expect(screen.queryByTestId("planner-subject-drag-preview")).not.toBeInTheDocument();
  expect(first).not.toHaveClass("opacity-35");
  expect(first.style.order).toBe("0");
});

it("자식 캡처 인계는 유지하고 자기 캡처를 잃으면 저장 없이 취소한다", async () => {
  const { title, rows, handle, release, actions } = mount();
  hold(title);
  move(title, rows[1]!);
  fireEvent(title, new Pointer("lostpointercapture", { bubbles: true }));
  expect(screen.getByTestId("planner-subject-drag-preview")).toBeInTheDocument();
  expect(release).not.toHaveBeenCalled();
  fireEvent(handle, new Pointer("lostpointercapture", { bubbles: true }));
  await act(async () => {});
  expect(actions.reorder).not.toHaveBeenCalled();
  expect(screen.queryByTestId("planner-subject-drag-preview")).not.toBeInTheDocument();
});

it.each(["escape", "blur", "unmount"])(
  "%s로 끌기를 끝내면 저장하지 않고 캡처를 해제한다",
  async (reason) => {
    const { title, rows, actions, release, unmount } = mount();
    hold(title);
    move(title, rows[1]!);
    if (reason === "escape") fireEvent.keyDown(document, { key: "Escape" });
    else if (reason === "blur") fireEvent(window, new Event("blur"));
    else unmount();
    await act(async () => {});
    expect(actions.reorder).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("planner-subject-drag-preview")).not.toBeInTheDocument();
  },
);

it("원래 순서로 돌아와 놓으면 순서 저장 요청을 보내지 않는다", async () => {
  const { title, rows, actions } = mount();
  hold(title);
  move(title, rows[1]!);
  fireEvent.pointerMove(title, { clientX: 40, clientY: 120 });
  fireEvent.pointerUp(title);
  await act(async () => {});
  expect(actions.reorder).not.toHaveBeenCalled();
});

it("목록 밖에 놓으면 마지막 임시 순서를 저장하지 않는다", async () => {
  const { title, rows, actions } = mount();
  hold(title);
  move(title, rows[1]!);
  vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
  fireEvent.pointerMove(title, { clientX: 320, clientY: 260 });
  fireEvent.pointerUp(title);
  await act(async () => {});
  expect(actions.reorder).not.toHaveBeenCalled();
  expect(screen.queryByTestId("planner-subject-drag-preview")).not.toBeInTheDocument();
});

it("길게 누르기 전에 움직이는 스크롤은 메뉴나 순서 변경으로 처리하지 않는다", () => {
  const { title, actions } = mount();
  fireEvent.pointerDown(title, { clientX: 40, clientY: 120 });
  fireEvent.pointerMove(title, { clientX: 40, clientY: 160 });
  act(() => vi.advanceTimersByTime(600));
  fireEvent.pointerUp(title);
  expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  expect(screen.queryByTestId("planner-subject-drag-preview")).not.toBeInTheDocument();
  expect(actions.reorder).not.toHaveBeenCalled();
});

it("키보드로 여는 과목 메뉴는 그대로 접근할 수 있다", () => {
  const { title } = mount();
  fireEvent.click(title, { detail: 0 });
  expect(screen.getByRole("menu")).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "이름 변경" })).toBeInTheDocument();
});

it.each(["task", "checkbox", "add", "blank"])(
  "%s에서도 과목 영역 전체를 끌고 놓은 뒤에는 클릭을 실행하지 않는다",
  async (part) => {
    const { first, rows, actions } = mount();
    const target =
      part === "task"
        ? within(first).getByRole("button", { name: "수학 3단원" })
        : part === "checkbox"
          ? within(first).getByRole("checkbox", { name: "수학 3단원" })
          : part === "add"
            ? within(first).getByRole("button", { name: "할 일 추가" })
            : first;
    hold(target);
    move(target, rows[1]!);
    expect(screen.getByTestId("planner-subject-drag-preview")).toBeInTheDocument();
    fireEvent.pointerUp(target);
    fireEvent.click(target, { detail: 1 });
    await act(async () => {});
    expect(actions.reorder).toHaveBeenCalledExactlyOnceWith([4, 3, 5]);
    expect(actions.task).not.toHaveBeenCalled();
    expect(actions.toggle).not.toHaveBeenCalled();
    expect(actions.addTask).not.toHaveBeenCalled();
  },
);

it.each(["task", "checkbox"])("%s의 짧은 탭은 원래 동작을 유지한다", (part) => {
  const { first, actions } = mount();
  const target =
    part === "task"
      ? within(first).getByRole("button", { name: "수학 3단원" })
      : within(first).getByRole("checkbox", { name: "수학 3단원" });
  fireEvent.pointerDown(target, { clientX: 40, clientY: 140 });
  fireEvent.pointerUp(target, { clientX: 40, clientY: 140 });
  fireEvent.click(target, { detail: 1 });
  expect(part === "task" ? actions.task : actions.toggle).toHaveBeenCalledOnce();
  expect(actions.reorder).not.toHaveBeenCalled();
});

it("할 일에서 길게 누른 뒤 연 과목 메뉴의 항목도 정상 선택할 수 있다", () => {
  const { first, actions } = mount();
  const target = within(first).getByRole("button", { name: "수학 3단원" });
  hold(target);
  fireEvent.pointerUp(target);
  const rename = screen.getByRole("menuitem", { name: "이름 변경" });
  fireEvent.pointerDown(rename);
  fireEvent.pointerUp(rename);
  fireEvent.click(rename, { detail: 1 });
  expect(actions.rename).toHaveBeenCalledOnce();
  expect(actions.task).not.toHaveBeenCalled();
});

it.each([
  ["past", "task"],
  ["past", "checkbox"],
  ["deleted", "task"],
  ["deleted", "checkbox"],
])("%s 과목 스크롤 취소 뒤 %s 첫 탭을 무시하지 않는다", (kind, part) => {
  const { first, actions } = mount({
    mode: kind === "past" ? "past" : "today",
    deleted: kind === "deleted",
  });
  const target = within(first).getByRole(part === "task" ? "button" : "checkbox", {
    name: "수학 3단원",
  });
  fireEvent.pointerDown(target, { clientX: 40, clientY: 140 });
  fireEvent.pointerMove(target, { clientX: 40, clientY: 180 });
  fireEvent.pointerCancel(target);
  fireEvent.pointerDown(target, { clientX: 40, clientY: 140 });
  fireEvent.pointerUp(target, { clientX: 40, clientY: 140 });
  fireEvent.click(target, { detail: 1 });
  expect(part === "task" ? actions.task : actions.toggle).toHaveBeenCalledOnce();
  expect(actions.reorder).not.toHaveBeenCalled();
});
