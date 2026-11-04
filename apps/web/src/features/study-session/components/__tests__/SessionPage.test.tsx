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

  describe("가장자리 스와이프", () => {
    // 세션 페이지가 쓰는 스크롤 잠금은 touchstart의 changedTouches를 읽는다.
    function fingers(...points: { clientX: number; clientY: number }[]) {
      return { touches: points, changedTouches: points };
    }

    function swipe(
      target: Element,
      from: { clientX: number; clientY: number },
      to: { clientX: number; clientY: number },
    ) {
      fireEvent.touchStart(target, fingers(from));
      fireEvent.touchMove(target, fingers(to));
    }

    it("왼쪽 가장자리에서 오른쪽으로 밀면 닫고 더 밀어도 한 번만 닫는다", () => {
      const { onOpenChange } = renderPage({ closeOnEdgeSwipe: true });
      const page = screen.getByRole("dialog");
      swipe(page, { clientX: 8, clientY: 300 }, { clientX: 80, clientY: 304 });
      fireEvent.touchMove(page, fingers({ clientX: 160, clientY: 304 }));
      expect(onOpenChange).toHaveBeenCalledOnce();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("켜지 않으면 닫지 않는다", () => {
      const { onOpenChange } = renderPage();
      swipe(
        screen.getByRole("dialog"),
        { clientX: 8, clientY: 300 },
        { clientX: 80, clientY: 304 },
      );
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("가장자리 밖에서 시작했거나 짧게 밀면 닫지 않는다", () => {
      const { onOpenChange } = renderPage({ closeOnEdgeSwipe: true });
      const page = screen.getByRole("dialog");
      swipe(page, { clientX: 120, clientY: 300 }, { clientX: 260, clientY: 300 });
      swipe(page, { clientX: 8, clientY: 300 }, { clientX: 30, clientY: 300 });
      fireEvent.touchEnd(page, fingers());
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("세로 스크롤로 시작한 손가락은 나중에 옆으로 가도 닫지 않는다", () => {
      const { onOpenChange } = renderPage({ closeOnEdgeSwipe: true });
      const page = screen.getByRole("dialog");
      swipe(page, { clientX: 8, clientY: 300 }, { clientX: 12, clientY: 360 });
      fireEvent.touchMove(page, fingers({ clientX: 120, clientY: 360 }));
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("두 손가락이나 도중에 취소된 터치는 닫지 않는다", () => {
      const { onOpenChange } = renderPage({ closeOnEdgeSwipe: true });
      const page = screen.getByRole("dialog");
      const finger = { clientX: 8, clientY: 300 };
      fireEvent.touchStart(page, fingers(finger, { clientX: 200, clientY: 300 }));
      fireEvent.touchMove(page, fingers({ clientX: 80, clientY: 300 }));
      fireEvent.touchStart(page, fingers(finger));
      fireEvent.touchCancel(page, fingers());
      fireEvent.touchMove(page, fingers({ clientX: 80, clientY: 300 }));
      expect(onOpenChange).not.toHaveBeenCalled();
    });

    it("슬라이더와 글자 입력에서 시작한 끌기는 닫지 않는다", () => {
      const { onOpenChange } = renderPage({ closeOnEdgeSwipe: true });
      for (const control of [
        screen.getByRole("slider", { name: "음량" }),
        screen.getByRole("textbox", { name: "이름" }),
      ]) {
        swipe(control, { clientX: 8, clientY: 300 }, { clientX: 80, clientY: 300 });
      }
      expect(onOpenChange).not.toHaveBeenCalled();
    });
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

  it("왼쪽에 둘 것이 false뿐이면 빈 아래 줄을 그리지 않는다", () => {
    const { container } = render(<SessionPageFooter landscape leading={false} />);
    expect(container.firstElementChild).toBeEmptyDOMElement();
  });
});
