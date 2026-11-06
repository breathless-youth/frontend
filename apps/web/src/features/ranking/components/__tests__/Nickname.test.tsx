import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_FOCUS_WEEKLY } from "@/lib/rankingFixtures";

import { interpolateRows } from "../../model/live";
import { AroundList } from "../AroundList";
import { Nickname } from "../Nickname";
import { Podium } from "../Podium";

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

function setHeights(scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
}

const LONG = "합격할때까지달린다아자아자";
const SHOW_FULL = `${LONG} 전체 이름 보기`;

/** 웹뷰 탭처럼 pointerdown 뒤 click을 보낸다. */
function tap(element: Element): void {
  fireEvent.pointerDown(element);
  fireEvent.click(element);
}

/** 화면에 그려진 말풍선 본문. 낭독기용 숨은 사본과 구별하려고 Radix 상태 속성이 있는 쪽을 찾는다. */
function bubble(name: string): HTMLElement | null {
  return screen.queryByText(name, { selector: "[data-state]" });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
  Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
  Reflect.deleteProperty(document, "fonts");
});

describe("Nickname", () => {
  it("잘리지 않았으면 누를 수 없다", () => {
    setWidths(80, 100);
    render(<Nickname name="커피세잔" />);

    expect(screen.getByText("커피세잔")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("잘렸으면 탭으로 전체 이름을 시상대 카드 밖 층에 열고 낭독기와 이어 준다", async () => {
    setWidths(300, 100);
    const view = render(<Nickname name={LONG} />);
    const trigger = screen.getByRole("button", { name: SHOW_FULL });

    tap(trigger);

    const content = await screen.findByText(LONG, { selector: "[data-state]" });
    // 카드의 overflow-hidden에 잘리지 않도록 문서 맨 위 층에 그린다.
    expect(view.container.contains(content)).toBe(false);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
  });

  it("열린 채로 다시 탭하면 닫힌다", async () => {
    setWidths(300, 100);
    render(<Nickname name={LONG} />);
    const trigger = screen.getByRole("button", { name: SHOW_FULL });
    tap(trigger);
    await screen.findByText(LONG, { selector: "[data-state]" });

    tap(trigger);

    expect(bubble(LONG)).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("Escape를 누르면 닫는다", async () => {
    setWidths(300, 100);
    render(<Nickname name={LONG} />);
    tap(screen.getByRole("button", { name: SHOW_FULL }));
    await screen.findByText(LONG, { selector: "[data-state]" });

    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => expect(bubble(LONG)).toBeNull());
  });

  it("바깥을 누르면 닫는다", async () => {
    setWidths(300, 100);
    render(<Nickname name={LONG} />);
    tap(screen.getByRole("button", { name: SHOW_FULL }));
    await screen.findByText(LONG, { selector: "[data-state]" });

    await userEvent.click(document.body);

    await waitFor(() => expect(bubble(LONG)).toBeNull());
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

describe("두 줄 닉네임", () => {
  it("한 줄 폭을 넘어도 두 줄 안에 들어가면 누를 수 없다", () => {
    setWidths(300, 100);
    setHeights(30, 30);
    render(<Nickname name="벼락치기하는 하늘다람쥐" lines={2} />);

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("두 줄을 넘쳐 잘렸으면 눌러서 전체 이름 말풍선을 연다", async () => {
    setWidths(100, 100);
    setHeights(45, 30);
    render(<Nickname name="벼락치기하는 하늘다람쥐" lines={2} />);

    tap(screen.getByRole("button", { name: "벼락치기하는 하늘다람쥐 전체 이름 보기" }));

    expect(
      await screen.findByText("벼락치기하는 하늘다람쥐", { selector: "[data-state]" }),
    ).toBeInTheDocument();
  });

  it("시상대 1~3등은 두 줄까지 보이고 주변 목록은 한 줄에서 자른다", () => {
    setWidths(300, 100);
    setHeights(30, 30);
    render(
      <>
        <Podium board={FIXTURE_FOCUS_WEEKLY} elapsedSec={0} />
        <AroundList type="FOCUS_TIME" rows={interpolateRows(FIXTURE_FOCUS_WEEKLY.around, 0)} />
      </>,
    );

    const [podium, around] = screen.getAllByRole("list");
    expect(within(podium!).queryAllByRole("button", { name: /전체 이름 보기/ })).toHaveLength(0);
    expect(within(around!).getAllByRole("button", { name: /전체 이름 보기/ })).toHaveLength(
      FIXTURE_FOCUS_WEEKLY.around.length,
    );
  });

  it("시상대 닉네임이 두 줄을 넘치면 자리마다 전체 이름을 열 수 있다", () => {
    setWidths(100, 100);
    setHeights(45, 30);
    render(<Podium board={FIXTURE_FOCUS_WEEKLY} elapsedSec={0} />);

    expect(screen.getAllByRole("button", { name: /전체 이름 보기/ })).toHaveLength(3);
  });
});
