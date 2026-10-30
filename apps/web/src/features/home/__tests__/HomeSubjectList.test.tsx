import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PlannerSubjectItem } from "@/features/planner/subjectItems";
import { subjectColorVar } from "@/features/records/recordsTimetable";
import { LONG_PRESS_MS } from "@/features/study-session/subjectInteractions";

import { HomeSubjectList, type HomeTaskStore } from "../HomeSubjectList";
import type { SubjectCompletion } from "../subjectCompletion";

// jsdom에는 PointerEvent가 없어 스와이프·길게 누르기 판정에 쓰는 좌표와 isPrimary를 채운다.
class TestPointerEvent extends MouseEvent {
  readonly isPrimary = true;
  readonly pointerId = 1;
  readonly pointerType = "touch";
}
window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;

const item = (overrides: Partial<PlannerSubjectItem>): PlannerSubjectItem => ({
  subjectId: 1,
  name: "국어",
  colorIndex: 0,
  focusSec: 9600,
  tasks: [],
  live: true,
  ...overrides,
});

const TASKS = [
  { id: 11, name: "비문학 기출", done: false, live: true },
  { id: 12, name: "문법 개념", done: false, live: true },
  { id: 13, name: "오답 노트", done: true, live: true },
];

const ITEMS = [
  item({ tasks: TASKS }),
  item({ subjectId: 2, name: "수학", colorIndex: 3, focusSec: 0 }),
  item({ subjectId: 9, name: "한국사", colorIndex: 5, focusSec: 600, live: false }),
];

function fakeStore(): HomeTaskStore {
  return {
    addTask: vi.fn(() => Promise.resolve()),
    toggleTask: vi.fn(() => Promise.resolve()),
    renameTask: vi.fn(() => Promise.resolve()),
    removeTask: vi.fn(() => Promise.resolve()),
  };
}

function renderList(
  overrides: Partial<Parameters<typeof HomeSubjectList>[0]> = {},
): Parameters<typeof HomeSubjectList>[0] {
  const props = {
    items: ITEMS,
    isToday: true,
    onPlay: vi.fn(),
    store: fakeStore(),
    completion: null,
    onManualRecord: vi.fn(),
    onNotice: vi.fn(),
    ...overrides,
  };
  render(<HomeSubjectList {...props} />);
  return props;
}

function card(name: string) {
  return screen.getByRole("button", { name: new RegExp(`^${name}(?! 공부 시작)`) });
}

function row(name: string) {
  return within(screen.getByRole("list", { name: "과목" }))
    .getAllByRole("listitem")
    .find((element) => within(element).queryByText(name, { exact: true }) !== null)!;
}

/** 카드를 왼쪽(음수)이나 오른쪽(양수)으로 민다. */
function swipe(element: HTMLElement, dx: number) {
  fireEvent.pointerDown(element, { clientX: 200, clientY: 100 });
  fireEvent.pointerMove(element, { clientX: 200 + dx / 2, clientY: 101 });
  fireEvent.pointerMove(element, { clientX: 200 + dx, clientY: 101 });
  fireEvent.pointerUp(element, { clientX: 200 + dx, clientY: 101 });
}

async function longPress(element: HTMLElement) {
  fireEvent.pointerDown(element, { clientX: 120, clientY: 100 });
  await act(() => new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40)));
  fireEvent.pointerUp(element, { clientX: 120, clientY: 100 });
}

describe("HomeSubjectList — 과목 줄", () => {
  it("오늘은 과목마다 재생 버튼과 그날 순공을 보이고, 누르면 그 과목을 알린다", () => {
    const { onPlay } = renderList();

    expect(within(row("국어")).getByText("순공")).toBeInTheDocument();
    expect(within(row("국어")).getByText("2시간 40분")).toBeInTheDocument();
    expect(within(row("수학")).getByText("0분")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "수학 공부 시작" }));
    expect(onPlay).toHaveBeenCalledWith(2);
  });

  it("재생 버튼은 과목 색으로 그리고, 글리프는 보조기기에 읽히지 않아 이름만 읽힌다", () => {
    renderList();

    const button = screen.getByRole("button", { name: "수학 공부 시작" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.style.color).toBe(subjectColorVar(3));
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("오늘이어도 삭제한 과목에는 재생 버튼이 없고, 직접 입력을 누르면 열지 않고 알린다", async () => {
    const { onManualRecord, onNotice } = renderList();

    expect(screen.queryByRole("button", { name: "한국사 공부 시작" })).not.toBeInTheDocument();
    swipe(row("한국사").querySelector<HTMLElement>("[data-swipe-surface]")!, -150);
    await userEvent.click(within(row("한국사")).getByRole("button", { name: "직접 입력" }));

    expect(onNotice).toHaveBeenCalledWith("이미 삭제된 과목이에요");
    expect(onManualRecord).not.toHaveBeenCalled();
    expect(row("한국사")).not.toHaveAttribute("data-swipe-open");
  });

  it("지난 날에는 재생 버튼이 없다", () => {
    renderList({ isToday: false });

    expect(screen.queryByRole("button", { name: /공부 시작/ })).not.toBeInTheDocument();
    expect(screen.getByText("2시간 40분")).toBeInTheDocument();
  });

  it("할 일이 있으면 이름 아래에 완료 수와 전체 수를 보이고, 없으면 보이지 않는다", () => {
    renderList();

    expect(within(row("국어")).getByText("1/3")).toBeInTheDocument();
    expect(within(row("국어")).getByText("할 일 3개 중 1개 완료")).toBeInTheDocument();
    expect(within(row("수학")).queryByText(/\d\/\d/)).toBeNull();
  });
});

describe("HomeSubjectList — 할 일 펼침", () => {
  it("카드를 누르면 할 일이 펼쳐지고 다시 누르면 접힌다", async () => {
    renderList();

    expect(card("국어")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("checkbox", { name: "비문학 기출" })).toBeNull();

    await userEvent.click(card("국어"));
    expect(card("국어")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("checkbox", { name: "비문학 기출" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "오답 노트" })).toBeChecked();

    await userEvent.click(card("국어"));
    expect(screen.queryByRole("checkbox", { name: "비문학 기출" })).toBeNull();
  });

  it("오늘 할 일을 누르면 완료를 바꾼다", async () => {
    const { store } = renderList();
    await userEvent.click(card("국어"));

    await userEvent.click(screen.getByRole("checkbox", { name: "비문학 기출" }));
    expect(store.toggleTask).toHaveBeenCalledWith(1, 11, true);
    await userEvent.click(screen.getByRole("checkbox", { name: "오답 노트" }));
    expect(store.toggleTask).toHaveBeenCalledWith(1, 13, false);
  });

  it("할 일 추가를 누르면 입력이 열리고 Enter로 그 과목에 만든다", async () => {
    const { store } = renderList();
    await userEvent.click(card("수학"));

    await userEvent.click(screen.getByRole("button", { name: "할 일 추가" }));
    await userEvent.type(screen.getByRole("textbox", { name: "새 할 일 이름" }), "미적분{Enter}");

    expect(store.addTask).toHaveBeenCalledWith(2, "미적분");
  });

  it("할 일이 30개면 추가하지 않고 알린다", async () => {
    const full = Array.from({ length: 30 }, (_, index) => ({
      id: 100 + index,
      name: `할 일 ${String(index)}`,
      done: false,
      live: true,
    }));
    const { onNotice } = renderList({ items: [item({ tasks: full })] });
    await userEvent.click(card("국어"));

    await userEvent.click(screen.getByRole("button", { name: "할 일 추가" }));

    expect(onNotice).toHaveBeenCalledWith("할 일은 과목마다 최대 30개까지 만들 수 있어요");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("할 일을 길게 누르면 이름 변경·삭제 메뉴가 뜬다", async () => {
    const { store } = renderList();
    await userEvent.click(card("국어"));

    await longPress(screen.getByRole("checkbox", { name: "문법 개념" }).parentElement!);
    expect(store.toggleTask).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("menuitem", { name: "삭제" }));
    expect(store.removeTask).toHaveBeenCalledWith(1, 12);

    await longPress(screen.getByRole("checkbox", { name: "비문학 기출" }).parentElement!);
    await userEvent.click(await screen.findByRole("menuitem", { name: "이름 변경" }));
    const input = screen.getByRole("textbox", { name: "할 일 이름" });
    await userEvent.clear(input);
    await userEvent.type(input, "독서 기출{Enter}");
    expect(store.renameTask).toHaveBeenCalledWith(1, 11, "독서 기출");
  });

  it("지난 날에는 할 일을 볼 수만 있다", async () => {
    // 지난 날 카드에는 그날 완료한 할 일만 실린다.
    const { store } = renderList({
      isToday: false,
      items: [item({ tasks: TASKS.filter((task) => task.done) })],
    });
    await userEvent.click(card("국어"));

    const check = screen.getByRole("checkbox", { name: "오답 노트" });
    expect(check).toBeDisabled();
    await userEvent.click(check);
    expect(store.toggleTask).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "할 일 추가" })).toBeNull();
  });

  it("펼침 버튼 이름은 과목 이름과 할 일이고, 할 일 수와 순공은 설명으로 읽힌다", async () => {
    renderList();
    const button = screen.getByRole("button", { name: "국어 할 일" });

    expect(button).toHaveAccessibleDescription(/할 일 3개 중 1개 완료.*순공.*2시간 40분/);
    await userEvent.click(button);
    const block = document.getElementById(button.getAttribute("aria-controls")!);
    expect(block).toContainElement(screen.getByRole("checkbox", { name: "비문학 기출" }));
  });

  it("펼친 오늘 카드가 할 일 없는 지난 날 카드가 되면 빈 할 일 칸을 그리지 않는다", async () => {
    const props = {
      items: [item({ subjectId: 2, name: "수학" })],
      isToday: true,
      onPlay: vi.fn(),
      store: fakeStore(),
      completion: null,
      onManualRecord: vi.fn(),
      onNotice: vi.fn(),
    };
    const { rerender } = render(<HomeSubjectList {...props} />);
    const button = screen.getByRole("button", { name: "수학 할 일" });
    await userEvent.click(button);
    const blockId = button.getAttribute("aria-controls")!;
    expect(document.getElementById(blockId)).not.toBeNull();

    rerender(<HomeSubjectList {...props} isToday={false} />);

    expect(document.getElementById(blockId)).toBeNull();
  });

  it("지난 날 할 일이 없는 카드는 펼치지 않고, 이름과 순공만 읽히는 포커스 자리를 둔다", async () => {
    renderList({ isToday: false });
    const head = screen.getByRole("button", { name: "수학" });

    expect(head).not.toHaveAttribute("aria-expanded");
    expect(head).toHaveAccessibleDescription(/순공.*0분/);
    await userEvent.click(head);
    expect(screen.queryByRole("button", { name: "할 일 추가" })).toBeNull();
  });
});

describe("HomeSubjectList — 스와이프", () => {
  it("왼쪽으로 밀면 직접 입력이 드러나고 누르면 그 과목을 알린다", async () => {
    const { onManualRecord } = renderList();
    const surface = row("수학").querySelector<HTMLElement>("[data-swipe-surface]")!;

    swipe(surface, -150);
    expect(row("수학")).toHaveAttribute("data-swipe-open", "left");
    // 민 손을 뗀 클릭은 카드를 펼치지 않는다.
    expect(card("수학")).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(within(row("수학")).getByRole("button", { name: "직접 입력" }));
    expect(onManualRecord).toHaveBeenCalledWith(2);
  });

  it("세로로 움직이면 열리지 않고, 다른 카드를 밀면 앞 카드는 닫힌다", () => {
    renderList();
    const korean = row("국어").querySelector<HTMLElement>("[data-swipe-surface]")!;
    const math = row("수학").querySelector<HTMLElement>("[data-swipe-surface]")!;

    fireEvent.pointerDown(korean, { clientX: 200, clientY: 100 });
    fireEvent.pointerMove(korean, { clientX: 190, clientY: 160 });
    fireEvent.pointerUp(korean, { clientX: 190, clientY: 160 });
    expect(row("국어")).not.toHaveAttribute("data-swipe-open");

    swipe(korean, -150);
    swipe(math, -150);
    expect(row("국어")).not.toHaveAttribute("data-swipe-open");
    expect(row("수학")).toHaveAttribute("data-swipe-open", "left");
  });

  it("열린 카드 밖을 누르면 닫힌다", () => {
    renderList();
    swipe(row("수학").querySelector<HTMLElement>("[data-swipe-surface]")!, -150);

    fireEvent.pointerDown(document.body);

    expect(row("수학")).not.toHaveAttribute("data-swipe-open");
  });

  it("화면 왼쪽 끝에서 시작한 밀기는 앱의 뒤로 가기 몫이라 받지 않는다", () => {
    renderList();
    const surface = row("수학").querySelector<HTMLElement>("[data-swipe-surface]")!;

    fireEvent.pointerDown(surface, { clientX: 10, clientY: 100 });
    fireEvent.pointerMove(surface, { clientX: 150, clientY: 101 });
    fireEvent.pointerUp(surface, { clientX: 150, clientY: 101 });

    expect(row("수학")).not.toHaveAttribute("data-swipe-open");
  });

  it("키보드로 직접 입력에 가면 카드가 열린다", () => {
    renderList();

    act(() => {
      within(row("수학")).getByRole("button", { name: "직접 입력" }).focus();
    });

    expect(row("수학")).toHaveAttribute("data-swipe-open", "left");
  });

  it("닫힌 카드의 동작은 Tab 순서에 없고, 카드에서 왼쪽 화살표로 열어 첫 동작에 포커스를 준다", async () => {
    renderList();
    const manual = within(row("수학")).getByRole("button", { name: "직접 입력" });
    expect(manual).toHaveAttribute("tabindex", "-1");

    act(() => screen.getByRole("button", { name: "수학 공부 시작" }).focus());
    await userEvent.keyboard("{ArrowLeft}");

    expect(row("수학")).toHaveAttribute("data-swipe-open", "left");
    expect(manual).toHaveFocus();
    expect(manual).toHaveAttribute("tabindex", "0");
  });

  it("Escape를 누르면 열린 카드가 닫히고 포커스가 카드로 돌아온다", async () => {
    renderList();
    swipe(row("수학").querySelector<HTMLElement>("[data-swipe-surface]")!, -150);
    act(() => within(row("수학")).getByRole("button", { name: "직접 입력" }).focus());

    await userEvent.keyboard("{Escape}");

    expect(row("수학")).not.toHaveAttribute("data-swipe-open");
    expect(screen.getByRole("button", { name: "수학 공부 시작" })).toHaveFocus();
  });

  it("지난 날 할 일이 없는 카드도 키보드로 직접 입력을 열고 Escape로 닫는다", async () => {
    const { onManualRecord } = renderList({ isToday: false });
    const head = screen.getByRole("button", { name: "수학" });

    act(() => head.focus());
    await userEvent.keyboard("{ArrowLeft}");
    const manual = within(row("수학")).getByRole("button", { name: "직접 입력" });
    expect(row("수학")).toHaveAttribute("data-swipe-open", "left");
    expect(manual).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(row("수학")).not.toHaveAttribute("data-swipe-open");
    expect(head).toHaveFocus();

    await userEvent.keyboard("{ArrowLeft}{Enter}");
    expect(onManualRecord).toHaveBeenCalledWith(2);
  });

  it("완료한 카드는 키보드로 완료 취소를 열고 Escape로 닫는다", async () => {
    const completion: SubjectCompletion = {
      isDone: (subjectId) => subjectId === 2,
      setDone: vi.fn(),
    };
    renderList({ isToday: false, completion });
    const head = screen.getByRole("button", { name: "수학" });

    act(() => head.focus());
    await userEvent.keyboard("{ArrowRight}");
    const undo = within(row("수학")).getByRole("button", { name: "완료 취소" });
    expect(row("수학")).toHaveAttribute("data-swipe-open", "right");
    expect(undo).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(row("수학")).not.toHaveAttribute("data-swipe-open");
    expect(head).toHaveFocus();

    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(completion.setDone).toHaveBeenCalledWith(2, false);
  });

  it("과목 완료 어댑터가 없으면 완료 버튼이 없고 오른쪽으로 밀어도 열리지 않는다", () => {
    renderList();

    expect(screen.queryByRole("button", { name: "완료 표시" })).toBeNull();
    expect(screen.queryByRole("button", { name: "완료 취소" })).toBeNull();
    swipe(row("수학").querySelector<HTMLElement>("[data-swipe-surface]")!, 150);
    expect(row("수학")).not.toHaveAttribute("data-swipe-open");
  });

  it("과목 완료 어댑터가 있으면 완료 표시와 완료 취소를 그 어댑터로 보낸다", async () => {
    const completion: SubjectCompletion = {
      isDone: (subjectId) => subjectId === 1,
      setDone: vi.fn(),
    };
    renderList({ completion });

    // 완료한 과목은 재생 대신 완료 표시가 보이고 오른쪽으로 밀어 취소한다.
    expect(screen.queryByRole("button", { name: "국어 공부 시작" })).toBeNull();
    swipe(row("국어").querySelector<HTMLElement>("[data-swipe-surface]")!, 150);
    expect(row("국어")).toHaveAttribute("data-swipe-open", "right");
    await userEvent.click(within(row("국어")).getByRole("button", { name: "완료 취소" }));
    expect(completion.setDone).toHaveBeenCalledWith(1, false);

    swipe(row("수학").querySelector<HTMLElement>("[data-swipe-surface]")!, -150);
    await userEvent.click(within(row("수학")).getByRole("button", { name: "완료 표시" }));
    expect(completion.setDone).toHaveBeenCalledWith(2, true);
    expect(within(row("국어")).queryByRole("button", { name: "완료 표시" })).toBeNull();
  });
});
