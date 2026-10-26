import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SessionMoreMenu } from "../components/SessionMoreMenu";

function renderMenu(overrides: Partial<Parameters<typeof SessionMoreMenu>[0]> = {}) {
  const props = {
    container: null,
    flipDisabled: false,
    onFlipCamera: vi.fn(),
    onShareInvite: vi.fn(),
    onOpenChange: vi.fn(),
    ...overrides,
  };
  render(<SessionMoreMenu {...props} />);
  return props;
}

describe("SessionMoreMenu", () => {
  it("더보기를 누르면 카메라 전환, 초대코드 공유 순서로 항목이 열린다", async () => {
    const { onOpenChange } = renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["카메라 전환", "초대코드 공유"]);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
  });

  it("초대코드 공유를 넘기지 않으면 누를 수 있는 카메라 전환만 보인다", async () => {
    const onFlipCamera = vi.fn();
    render(<SessionMoreMenu container={null} onFlipCamera={onFlipCamera} />);

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));

    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["카메라 전환"]);
    await userEvent.click(items[0]);
    expect(onFlipCamera).toHaveBeenCalledTimes(1);
  });

  it("메뉴 안 touchmove는 document까지 올라가지 않는다", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "더보기" }));

    const onDocumentTouchMove = vi.fn();
    document.addEventListener("touchmove", onDocumentTouchMove);
    // Radix 스크롤 잠금이 터치 좌표를 읽으므로 좌표를 실어 보낸다.
    const touch = { clientX: 10, clientY: 10 };
    fireEvent.touchMove(screen.getByRole("menuitem", { name: "카메라 전환" }), {
      touches: [touch],
      changedTouches: [touch],
    });
    document.removeEventListener("touchmove", onDocumentTouchMove);
    expect(onDocumentTouchMove).not.toHaveBeenCalled();
  });

  it("flipDisabled면 카메라 전환이 비활성이고 눌러도 전환하지 않는다", async () => {
    const { onFlipCamera } = renderMenu({ flipDisabled: true });

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    const flip = screen.getByRole("menuitem", { name: "카메라 전환" });

    expect(flip).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(flip);
    expect(onFlipCamera).not.toHaveBeenCalled();
  });

  it("항목을 누르면 해당 콜백을 부르고 메뉴가 닫힌다", async () => {
    const { onFlipCamera, onShareInvite } = renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "카메라 전환" }));
    expect(onFlipCamera).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "초대코드 공유" }));
    expect(onShareInvite).toHaveBeenCalledTimes(1);
  });

  it("메뉴 안을 누른 뒤에도 바깥을 한 번 누르면 메뉴가 닫힌다", async () => {
    renderMenu({ flipDisabled: true });

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    fireEvent.pointerDown(screen.getByRole("menuitem", { name: "카메라 전환" }));
    fireEvent.pointerUp(screen.getByRole("menuitem", { name: "카메라 전환" }));
    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("메뉴를 닫으면 포커스가 더보기 버튼으로 돌아온다", async () => {
    renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "더보기" }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "더보기" })).toHaveFocus();
  });

  it("더보기를 누른 채 메뉴 항목 위에서 떼도 항목을 고르지 않는다", () => {
    const { onFlipCamera } = renderMenu();

    // 메뉴가 버튼 자리를 덮으며 열려서 마우스로 짧게 누르면 뗀 지점이 첫 항목이다.
    // jsdom의 PointerEvent 폴백은 button을 싣지 않아 MouseEvent로 만들어 보낸다.
    fireEvent(
      screen.getByRole("button", { name: "더보기" }),
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    fireEvent(
      screen.getByRole("menuitem", { name: "카메라 전환" }),
      new MouseEvent("pointerup", { bubbles: true, button: 0 }),
    );

    expect(onFlipCamera).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("더보기를 짧게 누른 손 뗌의 클릭이 첫 항목에 떨어져도 항목을 고르지 않는다", () => {
    const { onFlipCamera } = renderMenu();

    // Android는 손을 뗀 자리의 요소로 클릭을 보내서 그 클릭이 방금 열린 첫 항목에 떨어진다.
    fireEvent(
      screen.getByRole("button", { name: "더보기" }),
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    const flip = screen.getByRole("menuitem", { name: "카메라 전환" });
    fireEvent(flip, new MouseEvent("pointerup", { bubbles: true, button: 0 }));
    fireEvent(flip, new MouseEvent("click", { bubbles: true, button: 0, detail: 1 }));

    expect(onFlipCamera).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("키보드로도 항목을 고른다", async () => {
    const { onShareInvite } = renderMenu();

    screen.getByRole("button", { name: "더보기" }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(onShareInvite).toHaveBeenCalledTimes(1);
  });

  it("hidden이면 버튼이 탭을 받지 않는다", () => {
    renderMenu({ hidden: true });

    const trigger = screen.getByRole("button", { name: "더보기" });
    expect(trigger).toHaveClass("pointer-events-none", "opacity-0");
    expect(trigger).toHaveAttribute("inert");
  });
});
