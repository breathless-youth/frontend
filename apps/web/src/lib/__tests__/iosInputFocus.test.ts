import { fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { focusWithoutScrollOnPress, isIosWeb, revealAboveKeyboard } from "../iosInputFocus";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; SM-A235N; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36";

/** iPhone 17 세로 화면의 높이(pt) */
const VIEWPORT_HEIGHT = 874;

/** 아랫변이 `bottom`(px)에 있는 입력 줄 */
function rowWithBottom(bottom: number): HTMLElement {
  const row = document.createElement("div");
  vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 0, y: bottom - 48, width: 390, height: 48 }),
  );
  return row;
}

function stubViewportHeight(height = VIEWPORT_HEIGHT) {
  vi.stubGlobal("innerHeight", height);
}

function stubWindowScrollBy() {
  // jsdom은 scrollBy를 구현하지 않아 호출마다 오류를 내므로 아무것도 하지 않는 구현으로 바꾼다.
  return vi.spyOn(window, "scrollBy").mockImplementation(() => {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isIosWeb", () => {
  it("iPhone의 웹뷰는 iOS다", () => {
    vi.stubGlobal("navigator", { userAgent: IPHONE_UA, maxTouchPoints: 5 });
    expect(isIosWeb()).toBe(true);
  });

  it("데스크톱 모드로 열린 iPad는 맥과 같은 UA에 멀티터치라 iOS다", () => {
    vi.stubGlobal("navigator", { userAgent: MAC_UA, maxTouchPoints: 5 });
    expect(isIosWeb()).toBe(true);
  });

  it("Android는 iOS가 아니다", () => {
    vi.stubGlobal("navigator", { userAgent: ANDROID_UA, maxTouchPoints: 5 });
    expect(isIosWeb()).toBe(false);
  });

  it("터치가 없는 맥 데스크톱은 iOS가 아니다", () => {
    vi.stubGlobal("navigator", { userAgent: MAC_UA, maxTouchPoints: 0 });
    expect(isIosWeb()).toBe(false);
  });

  it("navigator가 없으면 iOS가 아니다", () => {
    vi.stubGlobal("navigator", undefined);
    expect(isIosWeb()).toBe(false);
  });
});

describe("focusWithoutScrollOnPress", () => {
  function renderField() {
    render(
      createElement("input", { "aria-label": "이름", onMouseDown: focusWithoutScrollOnPress }),
    );
    return screen.getByRole("textbox", { name: "이름" });
  }

  it("포커스가 없는 입력칸을 누르면 기본 동작을 막고 문서를 움직이지 않게 포커스를 준다", () => {
    const field = renderField();
    const focus = vi.spyOn(field, "focus");

    // fireEvent는 기본 동작이 막혔을 때 false를 돌려준다.
    expect(fireEvent.mouseDown(field)).toBe(false);

    expect(focus.mock.calls).toEqual([[{ preventScroll: true }]]);
    expect(field).toHaveFocus();
  });

  it("이미 포커스가 있는 입력칸의 누름은 커서를 옮기는 누름이라 그대로 둔다", () => {
    const field = renderField();
    field.focus();
    const focus = vi.spyOn(field, "focus");

    expect(fireEvent.mouseDown(field)).toBe(true);

    expect(focus).not.toHaveBeenCalled();
    expect(field).toHaveFocus();
  });
});

describe("revealAboveKeyboard", () => {
  /** 스크롤 목록 안에 있는 입력 줄 */
  function rowInList(bottom: number) {
    const list = document.createElement("div");
    list.setAttribute("data-scroll-list", "");
    const row = rowWithBottom(bottom);
    list.append(row);
    return { list, row };
  }

  it("키보드가 없으면 아무것도 하지 않는다", () => {
    stubViewportHeight();
    const scrollBy = stubWindowScrollBy();
    const { list, row } = rowInList(900);

    revealAboveKeyboard(row, 0);

    expect(list.scrollTop).toBe(0);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("키보드에 가린 입력 줄은 가까운 스크롤 목록을 가려진 만큼 스크롤해 키보드 위로 올린다", () => {
    stubViewportHeight();
    const scrollBy = stubWindowScrollBy();
    const { list, row } = rowInList(560);
    list.scrollTop = 20;

    revealAboveKeyboard(row, 367);

    // 키보드 윗면은 874 - 367 = 507pt이고 입력 줄 아랫변은 560pt라 여백 8pt를 더해 61pt를 올린다.
    expect(list.scrollTop).toBe(81);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("스크롤 목록이 겹쳐 있으면 가장 가까운 목록만 스크롤한다", () => {
    stubViewportHeight();
    const { list: inner, row } = rowInList(560);
    const outer = document.createElement("div");
    outer.setAttribute("data-scroll-list", "");
    outer.append(inner);

    revealAboveKeyboard(row, 367);

    expect(inner.scrollTop).toBe(61);
    expect(outer.scrollTop).toBe(0);
  });

  it.each([480, 499])(
    "입력 줄 아랫변이 %ipt로 여백을 두고도 키보드 위에 보이면 스크롤하지 않는다",
    (bottom) => {
      stubViewportHeight();
      const { list, row } = rowInList(bottom);

      revealAboveKeyboard(row, 367);

      expect(list.scrollTop).toBe(0);
    },
  );

  it("스크롤 목록이 없으면 문서도 밀지 않고 아무것도 하지 않는다", () => {
    stubViewportHeight();
    const scrollBy = stubWindowScrollBy();

    revealAboveKeyboard(rowWithBottom(560), 367);

    // 키보드가 떠 있는 동안 문서를 밀면 iOS는 보이는 영역만 움직여 고정된 머리 줄이 화면 위로 밀려난다.
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
