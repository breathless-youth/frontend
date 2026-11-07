import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { plannerTask } from "@/test/plannerFixtures";
import { PlannerCarryoverDialog } from "../PlannerCarryoverDialog";

afterEach(cleanup);
const tasks = [
  plannerTask({
    key: "t:1",
    name: "아주 긴 기존 할 일 이름도 줄이지 않고 전체를 표시해서 읽을 수 있어요",
    date: "2026-11-04",
  }),
  plannerTask({ key: "t:2", name: "영어 듣기", date: "2026-11-03" }),
];
it("종료 애니메이션이 있어도 다른 안내 전에는 즉시 숨기고 선택은 유지한다", async () => {
  const readStyle = window.getComputedStyle.bind(window);
  const styleSpy = vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = readStyle(element, pseudo);
    if (!["open", "closed"].includes(element.getAttribute("data-state") ?? "")) return style;
    return new Proxy(style, {
      get(target, property) {
        if (property === "animationName") {
          return element.getAttribute("data-state") === "open" ? "dialog-enter" : "dialog-exit";
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
  try {
    const save = vi.fn().mockResolvedValue(undefined);
    const defer = vi.fn();
    const { rerender } = render(
      <PlannerCarryoverDialog open tasks={tasks} onConfirm={save} onDefer={defer} />,
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "영어 듣기" }));
    rerender(
      <PlannerCarryoverDialog open={false} tasks={tasks} onConfirm={save} onDefer={defer} />,
    );
    expect(screen.queryByRole("dialog", { hidden: true })).toBeNull();
    expect(document.querySelectorAll('[data-state="closed"]')).toHaveLength(0);
    expect(defer).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    rerender(<PlannerCarryoverDialog open tasks={tasks} onConfirm={save} onDefer={defer} />);
    expect(screen.getByRole("checkbox", { name: "영어 듣기" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "1개 가져오기" }));
    expect(save).toHaveBeenCalledWith(["t:1"]);
  } finally {
    styleSpy.mockRestore();
  }
});

it("결과가 불확실하면 선택과 다른 처리를 막고 재시도만 제공한다", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<PlannerCarryoverDialog tasks={tasks} uncertain onConfirm={save} onDefer={() => {}} />);
  expect(screen.getAllByRole("checkbox").every((box) => box.hasAttribute("disabled"))).toBe(true);
  expect(screen.getByRole("button", { name: "그냥 둘게요" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(save).toHaveBeenCalledWith(["t:1", "t:2"]);
});
it("날짜별 전체 선택으로 열리고 체크를 풀면 선택한 할 일만 가져온다", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<PlannerCarryoverDialog tasks={tasks} onConfirm={save} onDefer={() => {}} />);
  expect(
    screen.getAllByRole("checkbox").every((box) => box.getAttribute("data-state") === "checked"),
  ).toBe(true);
  expect(screen.getByText("11월 4일")).toBeInTheDocument();
  expect(screen.getByText(tasks[0]!.name)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("checkbox", { name: "영어 듣기" }));
  expect(screen.getByRole("button", { name: "전체 선택" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "1개 가져오기" }));
  expect(save).toHaveBeenCalledWith(["t:1"]);
});
it("전체 해제와 전체 선택을 바꾸고 그냥 둘게요는 빈 선택으로 처리한다", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<PlannerCarryoverDialog tasks={tasks} onConfirm={save} onDefer={() => {}} />);
  await userEvent.click(screen.getByRole("button", { name: "전체 해제" }));
  expect(screen.getByRole("button", { name: "0개 가져오기" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "전체 선택" }));
  expect(screen.getByRole("button", { name: "2개 가져오기" })).toBeEnabled();
  await userEvent.click(screen.getByRole("button", { name: "그냥 둘게요" }));
  expect(save).toHaveBeenCalledWith([]);
});
it("저장 실패 때 선택과 목록을 보존하고 재시도하며 중복 POST를 막는다", async () => {
  let rejectSave = (_error: Error) => {};
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    )
    .mockResolvedValue(undefined);
  render(<PlannerCarryoverDialog tasks={tasks} onConfirm={save} onDefer={() => {}} />);
  await userEvent.click(screen.getByRole("checkbox", { name: "영어 듣기" }));
  const bring = screen.getByRole("button", { name: "1개 가져오기" });
  fireEvent.click(bring);
  fireEvent.click(bring);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "그냥 둘게요" })).toBeDisabled();
  await act(async () => rejectSave(new Error("limit")));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(screen.getByRole("checkbox", { name: "영어 듣기" })).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "1개 가져오기" }));
  expect(save).toHaveBeenLastCalledWith(["t:1"]);
});
it("Escape는 서버의 영구 무시를 실행하지 않고 이번 접속만 미룬다", async () => {
  const save = vi.fn(),
    defer = vi.fn();
  render(<PlannerCarryoverDialog tasks={tasks} onConfirm={save} onDefer={defer} />);
  await userEvent.keyboard("{Escape}");
  expect(defer).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
});

it("과목 이름을 표시하고 없는 과목은 식별자 대신 기본 문구를 쓴다", () => {
  render(
    <PlannerCarryoverDialog
      tasks={[tasks[0]!, { ...tasks[1]!, subjectId: 99 }]}
      subjects={[{ id: 3, name: "수학", colorIndex: 2, studySec: 0, focusSec: 0, tasks: [] }]}
      onConfirm={async () => {}}
      onDefer={() => {}}
    />,
  );
  expect(screen.getByText("수학")).toBeInTheDocument();
  expect(screen.getByText("과목 없음")).toBeInTheDocument();
  expect(screen.queryByText("99")).not.toBeInTheDocument();
});
