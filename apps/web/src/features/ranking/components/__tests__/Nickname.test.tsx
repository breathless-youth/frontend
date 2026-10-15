import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Nickname } from "../Nickname";

/**
 * observe하자마자 한 번 부르는 ResizeObserver
 *
 * 첫 측정을 흉내 낸다.
 */
class ImmediateResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe() {
    this.callback([], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

function setWidths(scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => clientWidth,
  });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(document, "fonts");
});

describe("Nickname", () => {
  it("잘리지 않았으면 누를 수 없다", () => {
    setWidths(80, 100);
    render(<Nickname name="커피세잔" />);

    expect(screen.getByText("커피세잔")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("잘렸으면 눌러서 전체 이름 말풍선을 연다", async () => {
    setWidths(300, 100);
    render(<Nickname name="합격할때까지달린다아자아자" />);

    await userEvent.click(
      screen.getByRole("button", { name: "합격할때까지달린다아자아자 전체 이름 보기" }),
    );

    expect(screen.getByRole("tooltip")).toHaveTextContent("합격할때까지달린다아자아자");
  });

  it("바깥을 누르면 닫는다", async () => {
    setWidths(300, 100);
    render(<Nickname name="합격할때까지달린다아자아자" />);
    await userEvent.click(screen.getByRole("button"));

    await userEvent.click(document.body);

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("글꼴 로딩이 끝나 잘리면 누를 수 있다", () => {
    const fonts = new EventTarget();
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    setWidths(80, 100);
    render(<Nickname name="합격할때까지달린다아자아자" />);

    setWidths(300, 100);
    act(() => {
      fonts.dispatchEvent(new Event("loadingdone"));
    });

    expect(
      screen.getByRole("button", { name: "합격할때까지달린다아자아자 전체 이름 보기" }),
    ).toBeInTheDocument();
  });
});
