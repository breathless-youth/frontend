import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RoomFab } from "../RoomFab";

describe("RoomFab", () => {
  it("누르면 그룹 만들기와 초대코드로 참여 메뉴가 뜨고, 고르면 닫힌다", async () => {
    const user = userEvent.setup();
    const onJoinWithCode = vi.fn();
    render(<RoomFab canCreate onCreate={vi.fn()} onJoinWithCode={onJoinWithCode} />);
    await user.click(screen.getByRole("button", { name: "그룹 만들기와 초대코드로 참여" }));
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    await user.click(screen.getByRole("menuitem", { name: "초대코드로 참여" }));
    expect(onJoinWithCode).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("그룹 만들기를 고르면 넘기고 닫힌다", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<RoomFab canCreate onCreate={onCreate} onJoinWithCode={vi.fn()} defaultOpen />);
    await user.click(screen.getByRole("menuitem", { name: "그룹 만들기" }));
    expect(onCreate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("그룹장인 그룹이 2개면 그룹 만들기가 흐려지고 이유를 보인다", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(<RoomFab canCreate={false} onCreate={onCreate} onJoinWithCode={vi.fn()} defaultOpen />);
    const create = screen.getByRole("menuitem", { name: /그룹 만들기/ });
    expect(create).toHaveAttribute("aria-disabled", "true");
    expect(create).toHaveAccessibleDescription("그룹은 2개까지 만들 수 있어요");
    expect(screen.getByText("그룹은 2개까지 만들 수 있어요")).toBeInTheDocument();
    await user.click(create);
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("덮개를 누르거나 Esc를 누르면 닫힌다", async () => {
    const user = userEvent.setup();
    render(<RoomFab canCreate onCreate={vi.fn()} onJoinWithCode={vi.fn()} defaultOpen />);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();

    await user.click(screen.getByRole("button", { name: "그룹 만들기와 초대코드로 참여" }));
    await user.click(screen.getByRole("dialog", { name: "그룹 메뉴" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("열린 동안에는 같은 자리의 닫기 버튼으로 닫는다", async () => {
    const user = userEvent.setup();
    render(<RoomFab canCreate onCreate={vi.fn()} onJoinWithCode={vi.fn()} defaultOpen />);
    await user.click(screen.getByRole("button", { name: "그룹 메뉴 닫기" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "그룹 만들기와 초대코드로 참여" })).toHaveFocus();
  });

  it("위아래 화살표로 항목을 차례로 옮긴다", async () => {
    const user = userEvent.setup();
    render(<RoomFab canCreate onCreate={vi.fn()} onJoinWithCode={vi.fn()} defaultOpen />);
    expect(screen.getByRole("menu")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "그룹 만들기" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "초대코드로 참여" })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: "그룹 만들기" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: "초대코드로 참여" })).toHaveFocus();
  });
});
