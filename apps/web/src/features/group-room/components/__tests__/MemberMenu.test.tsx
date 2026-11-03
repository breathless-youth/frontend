import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MemberMenu } from "../MemberMenu";

describe("MemberMenu", () => {
  it("메뉴 버튼은 누구의 메뉴인지 알리고 열렸는지 알린다", async () => {
    render(<MemberMenu nickname="수빈" onTransfer={vi.fn()} onKick={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "수빈 메뉴" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(trigger);
    expect(
      screen
        .getAllByRole("menuitem")
        .map((item) => item.getAttribute("aria-label") ?? item.textContent),
    ).toEqual(["그룹장 넘기기", "내보내기"]);
  });

  it("항목을 고르면 닫으면서 넘긴다", async () => {
    const onKick = vi.fn();
    render(<MemberMenu nickname="수빈" onTransfer={vi.fn()} onKick={onKick} defaultOpen />);
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "내보내기" }));
    expect(onKick).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("메뉴 안 touchmove는 document까지 올라가지 않는다", () => {
    render(<MemberMenu nickname="수빈" onTransfer={vi.fn()} onKick={vi.fn()} defaultOpen />);
    const onDocumentTouchMove = vi.fn();
    document.addEventListener("touchmove", onDocumentTouchMove);
    // Radix 스크롤 잠금이 터치 좌표를 읽으므로 좌표를 실어 보낸다.
    const touch = { clientX: 10, clientY: 10 };
    fireEvent.touchMove(screen.getByRole("menu"), { touches: [touch], changedTouches: [touch] });
    fireEvent.touchMove(screen.getByRole("menuitem", { name: "그룹장 넘기기" }), {
      touches: [touch],
      changedTouches: [touch],
    });
    document.removeEventListener("touchmove", onDocumentTouchMove);
    expect(onDocumentTouchMove).not.toHaveBeenCalled();
  });
});
