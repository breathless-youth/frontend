import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import type { SubjectResponse } from "@focusmakers/types";

import i18n from "@/lib/i18n";

import type { SubjectsStore } from "../../useSubjects";
import { SessionPage } from "../SessionPage";
import { SessionPageHeaderTime } from "../SessionTimer";
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

function renderPanel(overrides: Partial<SubjectPanelProps> = {}, options: RenderOptions = {}) {
  const props: SubjectPanelProps = {
    store: makeStore([MATH, ENGLISH]),
    selection: null,
    onSelect: vi.fn(),
    onRequestClose: vi.fn(),
    paused: false,
    onNotice: vi.fn(),
    liveTotals: new Map(),
    landscape: false,
    ...overrides,
  };
  const view = render(<SubjectPanel {...props} />, options);
  return { ...props, ...view };
}

/**
 * 열린 과목 페이지 래퍼
 *
 * 아래 줄의 알림 자리는 페이지가 열린 동안에만 생긴다.
 * 제목은 렌더할 때 카탈로그에서 읽어 언어를 바꾼 테스트에서도 화면과 같은 제목이 된다.
 */
function openPage(landscape: boolean, headerExtras?: ReactNode) {
  return function Page({ children }: { children: ReactNode }) {
    return (
      <SessionPage
        open
        onOpenChange={vi.fn()}
        container={null}
        returnFocus={() => null}
        title={i18n.t("study-session:subjectSheet.title")}
        headerExtras={headerExtras}
        landscape={landscape}
      >
        {children}
      </SessionPage>
    );
  };
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

  it("할 일 이름은 15자를 넘어도 입력을 받고, 완료·Enter·포커스 이탈로 저장하지 않는다", async () => {
    const store = makeStore([MATH]);
    renderPanel({ store });
    await userEvent.click(screen.getByRole("button", { name: /할 일 추가/ }));
    const input = screen.getByRole("textbox", { name: "새 할 일 이름" });
    expect(input).not.toHaveAttribute("maxlength");

    fireEvent.change(input, { target: { value: "가".repeat(16) } });
    expect(input).toHaveValue("가".repeat(16));
    expect(screen.getByText("16/15")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("15자까지 쓸 수 있어요");
    expect(screen.getByRole("button", { name: "완료" })).toBeDisabled();

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(store.addTask).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "새 할 일 이름" })).toBeInTheDocument();
  });

  it("과목 이름은 12자를 넘으면 완료가 꺼지고 저장되지 않는다", async () => {
    const store = makeStore([MATH]);
    renderPanel({ store });
    await userEvent.click(screen.getByRole("button", { name: /과목 추가/ }));
    const input = screen.getByRole("textbox", { name: "새 과목 이름" });

    fireEvent.change(input, { target: { value: "가".repeat(13) } });
    expect(input).toHaveValue("가".repeat(13));
    expect(screen.getByText("13/12")).toHaveClass("text-state-distract-text");
    expect(screen.getByRole("alert")).toHaveTextContent("12자까지 쓸 수 있어요");
    expect(screen.getByRole("button", { name: "완료" })).toBeDisabled();

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(store.addSubject).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "새 과목 이름" })).toBeInTheDocument();
  });

  it("한도보다 긴 기존 과목 이름의 이름 변경을 열고 그대로 완료를 누르면 닫히고 renameSubject가 불리지 않는다", async () => {
    const longName = "가".repeat(13);
    const store = makeStore([{ ...MATH, name: longName }]);
    renderPanel({ store });
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(screen.getByText(longName));
      act(() => {
        vi.advanceTimersByTime(600);
      });
    } finally {
      vi.useRealTimers();
    }
    await userEvent.click(screen.getByRole("menuitem", { name: "수정" }));
    const input = screen.getByRole("textbox", { name: "과목 이름" });
    expect(input).toHaveValue(longName);

    const done = screen.getByRole("button", { name: "완료" });
    expect(done).toBeEnabled();
    await userEvent.click(done);
    expect(screen.queryByRole("textbox", { name: "과목 이름" })).not.toBeInTheDocument();
    expect(store.renameSubject).not.toHaveBeenCalled();
  });

  it("할 일 이름 글자 수는 한도의 80%부터 보인다", async () => {
    renderPanel({ store: makeStore([MATH]) });
    await userEvent.click(screen.getByRole("button", { name: /할 일 추가/ }));
    const input = screen.getByRole("textbox", { name: "새 할 일 이름" });
    fireEvent.change(input, { target: { value: "가".repeat(11) } });
    expect(screen.queryByText("11/15")).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-describedby");
    fireEvent.change(input, { target: { value: "가".repeat(12) } });
    expect(screen.getByText("12/15")).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription("12/15");
  });
});

describe("SubjectPanel 아래 줄", () => {
  it.each([
    { label: "세로", landscape: false },
    { label: "가로", landscape: true },
  ])("타이머 없이도 아래 줄의 버튼이 남는다 ($label)", ({ landscape }) => {
    renderPanel({ landscape }, { wrapper: openPage(landscape) });
    const page = screen.getByRole("dialog", { name: "과목" });
    expect(within(page).getByRole("button", { name: "순서 변경" })).toBeInTheDocument();
    expect(within(page).getByRole("button", { name: /과목 추가/ })).toBeInTheDocument();
    expect(within(page).getByRole("region", { name: "화면 알림" })).toBeInTheDocument();
    expect(screen.queryByText(/^순공시간 /)).toBeNull();
  });
});

describe("SubjectPanel 과목 색 점", () => {
  it("과목 이름 앞에 그 과목의 색 점을 둔다", () => {
    renderPanel({
      store: makeStore([
        { ...MATH, colorIndex: 3 },
        { ...ENGLISH, colorIndex: 7 },
      ]),
    });
    for (const [name, color] of [
      ["수학", "var(--subject-3)"],
      ["영어", "var(--subject-7)"],
    ] as const) {
      const label = screen.getByText(name);
      const dot = within(label.closest<HTMLElement>("[data-subject-id]")!).getByTestId(
        "subject-color-dot",
      );
      expect(dot).toHaveStyle({ backgroundColor: color });
      expect(label.previousElementSibling).toBe(dot);
    }
  });

  it("20 이상인 색 번호는 팔레트를 한 바퀴 돈다", () => {
    renderPanel({ store: makeStore([{ ...ENGLISH, colorIndex: 23 }]) });
    expect(screen.getByTestId("subject-color-dot")).toHaveStyle({
      backgroundColor: "var(--subject-3)",
    });
  });

  it("점은 낭독하지 않는다", () => {
    renderPanel({ store: makeStore([{ ...MATH, colorIndex: 3 }]) });
    expect(screen.getByTestId("subject-color-dot")).toHaveAttribute("aria-hidden", "true");
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

/** 길게 눌러 수정·제거 메뉴를 연다. */
function longPress(element: HTMLElement) {
  vi.useFakeTimers();
  try {
    fireEvent.pointerDown(element);
    act(() => {
      vi.advanceTimersByTime(600);
    });
  } finally {
    vi.useRealTimers();
  }
}

describe("SubjectPanel 이름 입력칸 포커스", () => {
  it.each([
    {
      label: "과목 추가",
      name: "새 과목 이름",
      open: () => userEvent.click(screen.getByRole("button", { name: /과목 추가/ })),
    },
    {
      label: "할 일 추가",
      name: "새 할 일 이름",
      open: () => userEvent.click(screen.getAllByRole("button", { name: /할 일 추가/ })[0]!),
    },
    {
      label: "이름 수정",
      name: "과목 이름",
      open: async () => {
        longPress(screen.getByText("수학"));
        await userEvent.click(screen.getByRole("menuitem", { name: "수정" }));
      },
    },
  ])("$label: 열린 입력칸은 문서를 끌어 올리지 않고 포커스를 받는다", async ({ name, open }) => {
    const focus = vi.spyOn(HTMLInputElement.prototype, "focus");
    onTestFinished(() => focus.mockRestore());
    renderPanel();

    await open();

    expect(screen.getByRole("textbox", { name })).toHaveFocus();
    // iOS는 키보드를 올리며 포커스를 받은 입력칸 쪽으로 문서를 끌어 올려서 머리 줄이 앱의 상태 막대와 뒤로 가기 밑으로 들어간다.
    // autoFocus는 옵션 없이 focus()를 부르므로 옵션을 준 호출 하나만 있어야 한다.
    expect(focus.mock.calls).toEqual([[{ preventScroll: true }]]);
  });
});

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-A235N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";

function stubUserAgent(userAgent: string) {
  const spy = vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  onTestFinished(() => spy.mockRestore());
}

type FakeViewport = EventTarget & { height: number; offsetTop: number };

/**
 * 가상 키보드가 보이는 영역을 줄이는 화면
 *
 * 키보드 높이를 재는 훅이 입력칸이 열릴 때 구독하므로 입력칸을 열기 전에 만든다.
 */
function fakeViewport(windowHeight: number, visibleHeight: number): FakeViewport {
  const viewport = new EventTarget() as FakeViewport;
  viewport.height = visibleHeight;
  viewport.offsetTop = 0;
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", windowHeight);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return viewport;
}

/** 키보드가 오르내려 보이는 영역의 높이가 바뀐 것을 알린다. */
function resizeViewport(viewport: FakeViewport, visibleHeight: number) {
  act(() => {
    viewport.height = visibleHeight;
    viewport.dispatchEvent(new Event("resize"));
  });
}

describe("SubjectPanel iPhone 이름 입력칸", () => {
  async function openNewSubjectEditor() {
    await userEvent.click(screen.getByRole("button", { name: /과목 추가/ }));
    return screen.getByRole("textbox", { name: "새 과목 이름" });
  }

  it("iPhone은 과목 추가를 눌러도 입력칸에 포커스를 주지 않아 입력칸을 눌러야 키보드가 뜬다", async () => {
    stubUserAgent(IPHONE_UA);
    const focus = vi.spyOn(HTMLInputElement.prototype, "focus");
    onTestFinished(() => focus.mockRestore());
    renderPanel();

    const input = await openNewSubjectEditor();

    expect(input).not.toHaveFocus();
    expect(focus).not.toHaveBeenCalled();
  });

  it("iPhone에서 입력칸을 누르면 기본 동작을 막고 문서를 끌어 올리지 않게 포커스를 준다", async () => {
    stubUserAgent(IPHONE_UA);
    renderPanel();
    const input = await openNewSubjectEditor();
    const focus = vi.spyOn(input, "focus");

    // fireEvent는 누름의 기본 동작이 막혔을 때 false를 돌려준다.
    expect(fireEvent.mouseDown(input)).toBe(false);

    expect(focus.mock.calls).toEqual([[{ preventScroll: true }]]);
    expect(input).toHaveFocus();
  });

  it("Android는 과목 추가를 누르면 입력칸에 바로 포커스를 준다", async () => {
    stubUserAgent(ANDROID_UA);
    const focus = vi.spyOn(HTMLInputElement.prototype, "focus");
    onTestFinished(() => focus.mockRestore());
    renderPanel();

    const input = await openNewSubjectEditor();

    expect(input).toHaveFocus();
    expect(focus.mock.calls).toEqual([[{ preventScroll: true }]]);
  });

  it("키보드가 올라와 있는 동안만 그 높이만큼 목록 끝을 비운다", async () => {
    const viewport = fakeViewport(874, 874);
    renderPanel();
    const input = await openNewSubjectEditor();
    // 입력칸을 감싼 줄의 바깥 상자가 입력칸 줄, 글자 수, 빈 칸을 차례로 담는다.
    const editor = input.parentElement!.parentElement!;
    const spacer = () => editor.querySelector<HTMLElement>(":scope > [aria-hidden='true']");
    expect(spacer()).toBeNull();

    resizeViewport(viewport, 538);
    expect(spacer()).toHaveStyle({ height: "336px" });

    resizeViewport(viewport, 874);
    expect(spacer()).toBeNull();
  });
});

describe("SubjectPanel 가려진 입력칸", () => {
  const LIST = { top: 100, bottom: 500 };
  const EDITOR_HEIGHT = 80;
  const COUNT_ROW_HEIGHT = 24;
  const NEW_SUBJECT = '[aria-label="새 과목 이름"]';

  function rectOf(top: number, bottom: number): DOMRect {
    return {
      top,
      bottom,
      y: top,
      height: bottom - top,
      left: 0,
      right: 320,
      x: 0,
      width: 320,
      toJSON: () => ({}),
    };
  }

  const scrollLists = () => [...document.querySelectorAll<HTMLElement>("[data-scroll-list]")];

  /**
   * 스크롤 목록과 입력칸의 가짜 배치
   *
   * jsdom에는 배치가 없어 모든 요소의 자리가 0이라 두 요소의 자리를 직접 정해 준다.
   * 목록을 스크롤하면 입력칸이 그만큼 움직이게 해서, 맞춘 뒤 입력칸이 목록 안에 들어왔는지 볼 수 있다.
   */
  function layOut({
    list,
    editor,
    editorTop,
    scrolled,
  }: {
    list: HTMLElement;
    /** 입력칸의 aria-label을 고르는 선택자. */
    editor: string;
    /** 목록이 `scrolled`만큼 스크롤된 때의 입력칸 윗변. */
    editorTop: number;
    scrolled: number;
  }) {
    list.scrollTop = scrolled;
    const layout = vi
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        if (this === list) return rectOf(LIST.top, LIST.bottom);
        if (this.matches(editor) || this.querySelector(editor) !== null) {
          const top = editorTop - (list.scrollTop - scrolled);
          const countRow =
            document.querySelector('[data-slot="char-count"]') === null ? 0 : COUNT_ROW_HEIGHT;
          return rectOf(top, top + EDITOR_HEIGHT + countRow);
        }
        return rectOf(0, 0);
      });
    onTestFinished(() => layout.mockRestore());
  }

  async function openNewSubject() {
    await userEvent.click(screen.getByRole("button", { name: /과목 추가/ }));
    return screen.getByRole("textbox", { name: "새 과목 이름" }).getBoundingClientRect();
  }

  it.each([
    { label: "세로", landscape: false },
    { label: "가로", landscape: true },
  ])("목록 아래로 가려졌으면 그 목록만 스크롤해 보이게 한다 ($label)", async ({ landscape }) => {
    // 문서까지 스크롤할 수 있는 두 호출은 쓰지 않아야 한다.
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    onTestFinished(() => {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
      scrollTo.mockRestore();
    });
    renderPanel({ landscape });
    const [list] = scrollLists();
    layOut({ list: list!, editor: NEW_SUBJECT, editorTop: 520, scrolled: 0 });

    const editor = await openNewSubject();

    expect(list!.scrollTop).toBeGreaterThan(0);
    expect(editor.top).toBeGreaterThanOrEqual(LIST.top);
    expect(editor.bottom).toBeLessThanOrEqual(LIST.bottom);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("목록 위로 가려졌으면 목록을 올려 보이게 한다", async () => {
    renderPanel();
    const [list] = scrollLists();
    layOut({ list: list!, editor: NEW_SUBJECT, editorTop: 80, scrolled: 300 });

    const editor = await openNewSubject();

    expect(list!.scrollTop).toBeLessThan(300);
    expect(editor.top).toBeGreaterThanOrEqual(LIST.top);
    expect(editor.bottom).toBeLessThanOrEqual(LIST.bottom);
  });

  it("이미 보이면 목록을 스크롤하지 않는다", async () => {
    renderPanel();
    const [list] = scrollLists();
    layOut({ list: list!, editor: NEW_SUBJECT, editorTop: 200, scrolled: 0 });

    await openNewSubject();

    expect(list!.scrollTop).toBe(0);
  });

  it("글자 수 줄이 생겨 입력칸이 길어지면 다시 맞춰서 아래가 잘리지 않게 한다", async () => {
    renderPanel();
    const [list] = scrollLists();
    // 열릴 때는 목록 아래 끝에 맞는 자리라 스크롤이 필요 없다.
    layOut({ list: list!, editor: NEW_SUBJECT, editorTop: 408, scrolled: 0 });
    await openNewSubject();
    expect(list!.scrollTop).toBe(0);

    const input = screen.getByRole("textbox", { name: "새 과목 이름" });
    fireEvent.change(input, { target: { value: "가".repeat(10) } });

    expect(screen.getByText("10/12")).toBeInTheDocument();
    expect(list!.scrollTop).toBeGreaterThan(0);
    expect(input.getBoundingClientRect().bottom).toBeLessThanOrEqual(LIST.bottom);
  });

  it("가로에서 할 일 이름을 고치면 과목 목록이 아니라 할 일 목록이 스크롤한다", async () => {
    renderPanel({ landscape: true });
    const [subjectList, taskList] = scrollLists();
    layOut({
      list: taskList!,
      editor: '[aria-label="할 일 이름"]',
      editorTop: 520,
      scrolled: 0,
    });

    longPress(screen.getByText("3단원 문제풀기"));
    await userEvent.click(screen.getByRole("menuitem", { name: "수정" }));

    expect(taskList!.scrollTop).toBeGreaterThan(0);
    expect(subjectList!.scrollTop).toBe(0);
  });

  it("키보드가 올라오면 목록 안에서는 보이던 입력칸도 키보드 위로 올려 문서는 밀지 않는다", async () => {
    const viewport = fakeViewport(600, 600);
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    onTestFinished(() => scrollBy.mockRestore());
    renderPanel();
    const [list] = scrollLists();
    // 목록(100~500px) 안에서는 다 보이지만 키보드가 오르면 윗면이 300px인 키보드에 가리는 자리다.
    layOut({ list: list!, editor: NEW_SUBJECT, editorTop: 250, scrolled: 0 });
    await openNewSubject();
    expect(list!.scrollTop).toBe(0);

    resizeViewport(viewport, 300);

    // 입력칸 아랫변은 330px이라 여백 8px을 더하면 키보드 윗면보다 38px 아래다.
    expect(list!.scrollTop).toBe(38);
    const input = screen.getByRole("textbox", { name: "새 과목 이름" });
    expect(input.getBoundingClientRect().bottom + 8).toBeLessThanOrEqual(300);
    expect(scrollBy).not.toHaveBeenCalled();
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

  it("과목 줄과 할 일 칸 제목 모두 이름 앞에 색 점을 둔다", () => {
    renderPanel({
      landscape: true,
      selection: 4,
      store: makeStore([MATH, { ...ENGLISH, colorIndex: 5 }]),
    });
    const detail = screen.getByRole("region", { name: "영어 할 일" });
    const row = screen.getByRole("button", { name: /^영어.*순공/ });
    for (const place of [detail, row]) {
      const dot = within(place).getByTestId("subject-color-dot");
      expect(dot).toHaveStyle({ backgroundColor: "var(--subject-5)" });
      expect(within(place).getByText("영어").previousElementSibling).toBe(dot);
    }
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

describe("과목 페이지 영어 화면", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  /** 화면 글자와 aria-label을 함께 모은다. 스크린리더가 읽는 이름도 영어여야 한다. */
  function visibleText(container: HTMLElement): string {
    const labels = [...container.querySelectorAll("[aria-label]")].map((el) =>
      el.getAttribute("aria-label"),
    );
    return [container.textContent, ...labels].join("\n");
  }

  it.each([
    { label: "세로", landscape: false },
    { label: "가로", landscape: true },
  ])("영어로 바꾸면 머리 시간과 과목 목록에 한글이 남지 않는다 ($label)", async ({ landscape }) => {
    await i18n.changeLanguage("en");
    renderPanel(
      {
        landscape,
        selection: MATH.id,
        // 과목과 할 일 이름은 사용자가 쓴 값이라 번역하지 않으므로 영어 이름을 둔다.
        store: makeStore([
          { ...MATH, name: "Math", tasks: [{ id: 31, name: "Chapter 3 problems", doneAt: null }] },
          { ...ENGLISH, name: "English", tasks: [{ id: 41, name: "50 words", doneAt: null }] },
        ]),
      },
      { wrapper: openPage(landscape, <SessionPageHeaderTime focusSec={2538} />) },
    );
    const page = screen.getByRole("dialog", { name: "Subject" });
    expect(within(page).getByText(/^Focus time /)).toHaveTextContent(
      "Focus time 42 minutes 18 seconds",
    );
    expect(visibleText(page)).not.toMatch(/[가-힣]/);
  });
});
