import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PcContactButton } from "../PcContactButton";

const HREF = "/contact/chat?appVersion=1";

function renderLink() {
  render(<PcContactButton href={HREF} />);
  return screen.getByRole("link", { name: "문의 새 창에서 열려요" });
}

beforeEach(() => {
  // 바탕화면 왼쪽 위가 (0, 25)이고 크기가 1440×875인 화면
  vi.stubGlobal("screen", { availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PcContactButton", () => {
  it("팝업이 막혀도 새 탭으로 열리도록 상담 주소 링크로 남는다", () => {
    const link = renderLink();

    expect(link).toHaveAttribute("href", HREF);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener");
  });

  it("누르면 화면 오른쪽 아래에 작은 상담 창을 띄우고 링크 이동은 막는다", () => {
    const popup = { focus: vi.fn() };
    const open = vi.fn(() => popup);
    vi.stubGlobal("open", open);
    const link = renderLink();

    const followed = fireEvent.click(link);

    // 문의 창은 다른 창 그룹으로 떨어져 창 이름과 연 창을 볼 수 없어 주소의 표시로 알린다.
    expect(open).toHaveBeenCalledExactlyOnceWith(
      `${HREF}&popup=1`,
      "_blank",
      "popup,width=480,height=680,left=936,top=196",
    );
    expect(popup.focus).toHaveBeenCalled();
    expect(followed).toBe(false);
  });

  it("브라우저가 팝업을 막으면 링크 기본 동작으로 새 탭을 연다", () => {
    vi.stubGlobal(
      "open",
      vi.fn(() => null),
    );
    const link = renderLink();

    expect(fireEvent.click(link)).toBe(true);
  });

  it("보조 키를 누른 채 누르면 팝업 없이 브라우저가 고른 대로 연다", () => {
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const link = renderLink();

    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
    expect(fireEvent.click(link, { shiftKey: true })).toBe(true);
    expect(open).not.toHaveBeenCalled();
  });
});
