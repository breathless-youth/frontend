import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { MultiTimerScreen } from "../components/MultiTimerScreen";

type ScreenProps = Parameters<typeof MultiTimerScreen>[0];

function renderScreen(overrides: Partial<ScreenProps> = {}) {
  const handlers = { onClose: vi.fn(), onPrimary: vi.fn(), onRestart: vi.fn() };
  const props: ScreenProps = {
    open: true,
    kind: "pomodoro",
    container: null,
    returnFocus: () => null,
    primaryLabel: "시작",
    primaryTone: "primary",
    primaryDisabled: false,
    showRestart: false,
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

    expect(screen.getByRole("dialog", { name: "뽀모도로" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("본문")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "뽀모도로 끄기" }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("타이머 화면은 제목과 끄기 이름이 타이머다", () => {
    renderScreen({ kind: "timer" });

    expect(screen.getByRole("dialog", { name: "타이머" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "타이머 끄기" })).toBeInTheDocument();
  });

  it("escape_does_not_close", async () => {
    const { onClose } = renderScreen();

    await userEvent.keyboard("{Escape}");

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "뽀모도로" })).toBeInTheDocument();
  });

  it("화면 밖을 눌러도 닫히지 않는다", () => {
    const { onClose } = renderScreen();

    fireEvent.pointerDown(document.body);
    fireEvent.focusIn(document.body);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("primary_and_restart_buttons", async () => {
    const { onPrimary, onRestart, rerender } = renderScreen();
    expect(screen.queryByRole("button", { name: "처음부터" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "시작" }));
    expect(onPrimary).toHaveBeenCalledOnce();

    rerender({ primaryLabel: "계속", showRestart: true });
    await userEvent.click(screen.getByRole("button", { name: "처음부터" }));
    expect(onRestart).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "계속" })).toBeEnabled();
  });

  it("primary_disabled", async () => {
    const { onPrimary } = renderScreen({ kind: "timer", primaryDisabled: true });

    const primary = screen.getByRole("button", { name: "시작" });
    expect(primary).toBeDisabled();
    fireEvent.click(primary);

    expect(onPrimary).not.toHaveBeenCalled();
  });

  it("contentRef는 화면 본체를 받아 본문 안 시트의 포털 자리가 된다", () => {
    let content: HTMLDivElement | null = null;
    renderScreen({
      contentRef: (node) => {
        content = node;
      },
    });

    expect(content).toBe(screen.getByRole("dialog", { name: "뽀모도로" }));
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
            container={null}
            returnFocus={() => opener.current}
            onClose={() => setOpen(false)}
            primaryLabel="시작"
            primaryTone="primary"
            primaryDisabled={false}
            onPrimary={() => {}}
            showRestart={false}
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
