import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MultiTimerScreen } from "../components/MultiTimerScreen";

type ScreenProps = Parameters<typeof MultiTimerScreen>[0];

function renderScreen(overrides: Partial<ScreenProps> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onPrimary: vi.fn(),
    onRestart: vi.fn(),
    onSwitchKind: vi.fn(),
  };
  const props: ScreenProps = {
    open: true,
    kind: "pomodoro",
    kindLocked: false,
    container: null,
    returnFocus: () => null,
    primaryLabel: "시작",
    primaryDisabled: false,
    restartDisabled: true,
    children: <p>본문</p>,
    ...handlers,
    ...overrides,
  };
  const view = render(<MultiTimerScreen {...props} />);
  return {
    ...handlers,
    rerender: (next: Partial<ScreenProps>) =>
      view.rerender(<MultiTimerScreen {...props} {...next} />),
  };
}

describe("MultiTimerScreen", () => {
  it("renders_title_and_close", async () => {
    const { onClose } = renderScreen();

    expect(screen.getByRole("dialog", { name: "타이머" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("본문")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "타이머 끄기" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("뽀모도로 모드여도 제목과 끄기 이름은 타이머다", () => {
    renderScreen({ kind: "pomodoro" });

    expect(screen.getByRole("dialog", { name: "타이머" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "타이머 끄기" })).toBeInTheDocument();
  });

  it("타이머 종류 토글은 지금 모드를 고른 상태로 보이고 다른 칸을 누르면 바꾼다", async () => {
    const { onSwitchKind } = renderScreen({ kind: "pomodoro" });

    const toggle = screen.getByRole("tablist", { name: "타이머 종류" });
    expect(
      within(toggle)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["기본", "뽀모도로"]);
    expect(within(toggle).getByRole("tab", { name: "뽀모도로" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(within(toggle).getByRole("tab", { name: "기본" }));

    expect(onSwitchKind).toHaveBeenCalledWith("timer");
  });

  it("모드가 진행 중이면 다른 칸은 막히고 지금 칸은 그대로 보인다", () => {
    renderScreen({ kind: "timer", kindLocked: true });

    expect(screen.getByRole("tab", { name: "뽀모도로" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "기본" })).toBeEnabled();
  });

  it("escape_does_not_close", async () => {
    const { onClose } = renderScreen();

    await userEvent.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "타이머" })).toBeInTheDocument();
  });

  it("화면 밖을 눌러도 닫히지 않는다", () => {
    const { onClose } = renderScreen();

    fireEvent.pointerDown(document.body);
    fireEvent.focusIn(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("시작 전에는 처음부터가 막혀 있고 시작한 뒤에는 누를 수 있다", async () => {
    const { onPrimary, onRestart, rerender } = renderScreen();
    const restart = screen.getByRole("button", { name: "처음부터" });
    expect(restart).toBeDisabled();
    fireEvent.click(restart);
    expect(onRestart).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(onPrimary).toHaveBeenCalledOnce();

    rerender({ primaryLabel: "일시정지", restartDisabled: false });
    await userEvent.click(screen.getByRole("button", { name: "처음부터" }));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it.each([
    ["시작", "icon-play"],
    ["일시정지", "icon-pause"],
    ["계속", "icon-play"],
  ] as const)("%s 버튼은 %s 아이콘을 그린다", (primaryLabel, icon) => {
    renderScreen({ primaryLabel, restartDisabled: false });

    const primary = screen.getByRole("button", { name: primaryLabel });
    expect(within(primary).getByTestId(icon)).toBeInTheDocument();
  });

  it("primary_disabled", async () => {
    const { onPrimary } = renderScreen({ kind: "timer", primaryDisabled: true });

    const primary = screen.getByRole("button", { name: "시작" });
    expect(primary).toBeDisabled();
    fireEvent.click(primary);

    expect(onPrimary).not.toHaveBeenCalled();
  });

  it("페이지 안 touchmove는 document까지 올라가지 않는다", () => {
    renderScreen();
    const onDocumentTouchMove = vi.fn();
    document.addEventListener("touchmove", onDocumentTouchMove);

    fireEvent.touchMove(screen.getByText("본문"));

    document.removeEventListener("touchmove", onDocumentTouchMove);
    expect(onDocumentTouchMove).not.toHaveBeenCalled();
  });

  it("닫히면 returnFocus가 돌려준 요소로 포커스가 간다", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      const opener = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={opener} type="button">
            타이머 열기
          </button>
          <MultiTimerScreen
            open={open}
            kind="timer"
            kindLocked={false}
            onSwitchKind={() => {}}
            container={null}
            returnFocus={() => opener.current}
            onClose={() => setOpen(false)}
            primaryLabel="시작"
            primaryDisabled={false}
            onPrimary={() => {}}
            restartDisabled
            onRestart={() => {}}
          >
            본문
          </MultiTimerScreen>
        </>
      );
    }
    render(<Harness />);

    await userEvent.click(screen.getByRole("button", { name: "타이머 끄기" }));

    expect(screen.getByRole("button", { name: "타이머 열기" })).toHaveFocus();
  });
});
