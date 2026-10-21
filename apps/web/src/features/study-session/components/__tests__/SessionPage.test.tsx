import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SessionPage, SessionPageFooter } from "../SessionPage";
import { SessionPageTimer } from "../SessionTimer";

function renderPage(overrides: Partial<Parameters<typeof SessionPage>[0]> = {}) {
  const onOpenChange = vi.fn();
  render(
    <SessionPage
      open
      onOpenChange={onOpenChange}
      container={null}
      returnFocus={() => null}
      title="과목"
      landscape={false}
      {...overrides}
    >
      <input aria-label="이름" />
      <input aria-label="음량" type="range" />
    </SessionPage>,
  );
  return { onOpenChange };
}

describe("SessionPage", () => {
  it("제목이 대화상자 이름이고 aria-modal을 단다", () => {
    renderPage();
    expect(screen.getByRole("dialog", { name: "과목" })).toHaveAttribute("aria-modal", "true");
  });

  it("뒤로 가기와 Escape로 닫는다", async () => {
    const { onOpenChange } = renderPage();
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    onOpenChange.mockClear();
    await userEvent.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("글자 입력 안의 Escape는 페이지를 닫지 않고 슬라이더 위의 Escape는 닫는다", () => {
    const { onOpenChange } = renderPage();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "이름" }), { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("slider", { name: "음량" }), { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("닫히면 returnFocus가 돌려준 요소로 포커스가 간다", async () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      const opener = useRef<HTMLButtonElement>(null);
      return (
        <>
          <button ref={opener} type="button">
            과목 열기
          </button>
          <SessionPage
            open={open}
            onOpenChange={setOpen}
            container={null}
            returnFocus={() => opener.current}
            title="과목"
            landscape={false}
          >
            본문
          </SessionPage>
        </>
      );
    }
    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(screen.getByRole("button", { name: "과목 열기" })).toHaveFocus();
  });

  it("페이지 안 touchmove는 document까지 올라가지 않는다", () => {
    renderPage();
    const onDocumentTouchMove = vi.fn();
    document.addEventListener("touchmove", onDocumentTouchMove);
    fireEvent.touchMove(screen.getByRole("dialog"));
    document.removeEventListener("touchmove", onDocumentTouchMove);
    expect(onDocumentTouchMove).not.toHaveBeenCalled();
  });

  it("headerExtras를 헤더에 보인다", () => {
    renderPage({ headerExtras: <button type="button">안내</button> });
    expect(screen.getByRole("button", { name: "안내" })).toBeInTheDocument();
  });
});

describe("SessionPageFooter · SessionPageTimer", () => {
  it("동작과 순공 타이머를 함께 보인다", () => {
    render(
      <SessionPageFooter
        landscape={false}
        actions={<button type="button">과목 추가</button>}
        timer={<SessionPageTimer focusSec={5048} />}
      />,
    );
    expect(screen.getByRole("button", { name: "과목 추가" })).toBeInTheDocument();
    expect(screen.getByText("01:24:08")).toBeInTheDocument();
    expect(screen.getByText(/순공시간/)).toBeInTheDocument();
  });
});
