import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SubjectResponse } from "@focusmakers/types";

import type { SubjectsStore } from "../../useSubjects";
import { SubjectPanel } from "../SubjectPanel";
import type { SubjectPanelProps } from "../SubjectPanel";

// jsdom에는 `PointerEvent` 구현이 없다 — 핸들 끌기와 길게 누르기 판정에 쓰는 `isPrimary`를 채운다.
class TestPointerEvent extends MouseEvent {
  readonly isPrimary = true;
  readonly pointerId = 1;
  readonly pointerType = "touch";
}
window.PointerEvent = TestPointerEvent as unknown as typeof PointerEvent;

const MATH: SubjectResponse = {
  id: 3,
  name: "수학",
  colorIndex: 0,
  studySec: 0,
  focusSec: 0,
  tasks: [{ id: 31, name: "3단원 문제풀기", doneAt: null }],
};
const ENGLISH: SubjectResponse = {
  id: 4,
  name: "영어",
  colorIndex: 1,
  studySec: 0,
  focusSec: 0,
  tasks: [{ id: 41, name: "단어 50개", doneAt: null }],
};

function makeStore(
  subjects: SubjectResponse[],
  overrides: Partial<SubjectsStore> = {},
): SubjectsStore {
  return {
    subjects,
    status: "ready",
    reload: vi.fn(),
    addSubject: vi.fn(async () => null),
    renameSubject: vi.fn(),
    removeSubject: vi.fn(),
    addTask: vi.fn(),
    renameTask: vi.fn(),
    toggleTask: vi.fn(),
    removeTask: vi.fn(),
    startReorder: vi.fn(),
    reorderSubject: vi.fn(),
    commitReorder: vi.fn(async () => {}),
    ...overrides,
  } as unknown as SubjectsStore;
}

function renderPanel(overrides: Partial<SubjectPanelProps> = {}) {
  const props: SubjectPanelProps = {
    store: makeStore([MATH, ENGLISH]),
    selection: null,
    onSelect: vi.fn(),
    onRequestClose: vi.fn(),
    paused: false,
    onNotice: vi.fn(),
    liveTotals: new Map(),
    landscape: false,
    timer: <span>01:24:08</span>,
    ...overrides,
  };
  const view = render(<SubjectPanel {...props} />);
  return { ...props, ...view };
}

describe("SubjectPanel 세로", () => {
  it("카드 머리를 눌러도 측정 과목이 바뀌지 않는다", async () => {
    const { onSelect } = renderPanel();
    await userEvent.click(screen.getByText("수학"));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("재생 버튼은 고르고 닫는다", async () => {
    const { onSelect, onRequestClose } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "수학 측정 시작" }));
    expect(onSelect).toHaveBeenCalledWith(3);
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it("측정 중 과목의 정지 버튼은 해제만 하고 닫지 않는다", async () => {
    const { onSelect, onRequestClose } = renderPanel({ selection: 3 });
    await userEvent.click(screen.getByRole("button", { name: "수학 측정 멈추기" }));
    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("동작 줄에 순서 변경과 과목 추가가 있다", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "순서 변경" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /과목 추가/ })).toBeInTheDocument();
  });

  it("과목이 없으면 추천 과목과 과목 추가만 있다", () => {
    renderPanel({ store: makeStore([]) });
    expect(screen.getByRole("list", { name: "추천 과목" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /과목 추가/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "순서 변경" })).not.toBeInTheDocument();
  });

  it("목록을 받는 중이면 동작 줄 버튼이 없다", () => {
    renderPanel({ store: makeStore([], { status: "loading" }) });
    expect(screen.queryByRole("button", { name: /과목 추가/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "순서 변경" })).not.toBeInTheDocument();
  });

  it("할 일 이름은 100자를 넘어도 입력을 받고, 완료·Enter·포커스 이탈로 저장하지 않는다", async () => {
    const store = makeStore([MATH]);
    renderPanel({ store });
    await userEvent.click(screen.getByRole("button", { name: /할 일 추가/ }));
    const input = screen.getByRole("textbox", { name: "새 할 일 이름" });
    expect(input).not.toHaveAttribute("maxlength");

    fireEvent.change(input, { target: { value: "가".repeat(101) } });
    expect(input).toHaveValue("가".repeat(101));
    expect(screen.getByText("101/100")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("100자까지 쓸 수 있어요");
    expect(screen.getByRole("button", { name: "완료" })).toBeDisabled();

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(store.addTask).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "새 할 일 이름" })).toBeInTheDocument();
  });

  it("할 일 이름 글자 수는 한도의 80%부터 보인다", async () => {
    renderPanel({ store: makeStore([MATH]) });
    await userEvent.click(screen.getByRole("button", { name: /할 일 추가/ }));
    const input = screen.getByRole("textbox", { name: "새 할 일 이름" });
    fireEvent.change(input, { target: { value: "가".repeat(79) } });
    expect(screen.queryByText("79/100")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-describedby");
    fireEvent.change(input, { target: { value: "가".repeat(80) } });
    expect(screen.getByText("80/100")).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription("80/100");
  });
});

describe("SubjectPanel 순서 변경 모드", () => {
  it("모드 전에는 핸들이 없다", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "수학 순서 이동" })).not.toBeInTheDocument();
  });

  it("모드에서 핸들만 남고 카드가 접히며 완료로 끝낸다", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "순서 변경" }));

    expect(screen.getByRole("button", { name: "수학 순서 이동" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "3단원 문제풀기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수학 측정 시작" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /할 일 추가/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /과목 추가/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(screen.getByRole("checkbox", { name: "3단원 문제풀기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "수학 순서 이동" })).not.toBeInTheDocument();
  });

  it("핸들을 끌어 놓으면 순서를 저장한다", async () => {
    const store = makeStore([MATH, ENGLISH]);
    renderPanel({ store });
    await userEvent.click(screen.getByRole("button", { name: "순서 변경" }));
    const grip = screen.getByRole("button", { name: "수학 순서 이동" });

    fireEvent.pointerDown(grip);
    fireEvent.pointerUp(grip);

    expect(store.startReorder).toHaveBeenCalled();
    expect(store.commitReorder).toHaveBeenCalled();
  });

  it("모드 밖에서는 과목 머리를 길게 누르면 수정·제거 메뉴가 뜬다", () => {
    renderPanel();
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(screen.getByText("수학"));
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.getByRole("menu")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("모드에서는 과목 머리를 길게 눌러도 메뉴가 뜨지 않는다", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "순서 변경" }));
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(screen.getByText("수학"));
      act(() => {
        vi.advanceTimersByTime(600);
      });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("과목이 모두 사라지면 모드가 끝난다", async () => {
    const { rerender, ...props } = renderPanel();
    await userEvent.click(screen.getByRole("button", { name: "순서 변경" }));

    rerender(<SubjectPanel {...props} store={makeStore([])} />);

    expect(screen.queryByRole("button", { name: "완료" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /과목 추가/ })).toBeInTheDocument();
  });
});

describe("SubjectPanel 할 일", () => {
  it("완료 체크를 누르면 완료로 바꾼다", async () => {
    const store = makeStore([MATH]);
    renderPanel({ store });
    await userEvent.click(screen.getByRole("checkbox", { name: "3단원 문제풀기" }));
    expect(store.toggleTask).toHaveBeenCalledWith(3, 31, true);
  });

  it("새 할 일은 완료 버튼으로 확정한다", async () => {
    const store = makeStore([MATH]);
    renderPanel({ store });
    await userEvent.click(screen.getByRole("button", { name: /할 일 추가/ }));
    await userEvent.type(screen.getByRole("textbox", { name: "새 할 일 이름" }), "오답 정리");
    await userEvent.click(screen.getByRole("button", { name: "완료" }));
    expect(store.addTask).toHaveBeenCalledWith(3, "오답 정리");
  });
});

describe("SubjectPanel 가로", () => {
  it("목록과 상세를 함께 보이고 상세는 측정 중 과목이다", () => {
    renderPanel({ landscape: true, selection: 4 });
    const detail = screen.getByRole("region", { name: "영어 할 일" });
    expect(within(detail).getByRole("checkbox", { name: "단어 50개" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "3단원 문제풀기" })).not.toBeInTheDocument();
  });

  it("줄을 누르면 상세만 바뀌고 측정 과목은 그대로다", async () => {
    const { onSelect } = renderPanel({ landscape: true, selection: 4 });
    await userEvent.click(screen.getByRole("button", { name: /^수학.*순공/ }));
    expect(screen.getByRole("region", { name: "수학 할 일" })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("보는 줄은 aria-current다", async () => {
    renderPanel({ landscape: true, selection: 4 });
    expect(screen.getByRole("button", { name: /^영어.*순공/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: /^수학.*순공/ }));
    expect(screen.getByRole("button", { name: /^수학.*순공/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /^영어.*순공/ })).not.toHaveAttribute("aria-current");
  });

  it("줄의 재생 버튼은 고르고 닫는다", async () => {
    const { onSelect, onRequestClose } = renderPanel({ landscape: true });
    await userEvent.click(screen.getByRole("button", { name: "영어 측정 시작" }));
    expect(onSelect).toHaveBeenCalledWith(4);
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it("순서 변경 중에는 상세를 누를 수 없다", async () => {
    renderPanel({ landscape: true });
    await userEvent.click(screen.getByRole("button", { name: "순서 변경" }));
    expect(screen.getByRole("region", { name: "수학 할 일", hidden: true })).toHaveAttribute(
      "inert",
    );
  });

  it("과목이 없으면 두 열 없이 추천 과목을 보인다", () => {
    renderPanel({ landscape: true, store: makeStore([]) });
    expect(screen.getByRole("list", { name: "추천 과목" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /할 일$/ })).not.toBeInTheDocument();
  });
});

describe("SubjectPanel 시안 맞춤", () => {
  it("이름 편집의 완료는 secondary 버튼이다", async () => {
    renderPanel();
    await userEvent.click(screen.getAllByRole("button", { name: /할 일 추가/ })[0]!);
    // secondary 여부는 Button variant 클래스로만 드러나서 이 테스트에 한해 variant 클래스를 본다.
    expect(screen.getByRole("button", { name: "완료" })).toHaveClass("bg-bg-layer-2");
  });
});
