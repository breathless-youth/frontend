import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

import { roomMenuItems } from "../../model/roomMenu";
import { RoomMenu } from "../RoomMenu";

const ownerPublicItems = roomMenuItems({
  role: "owner",
  visibility: "public",
  newRequestCount: 2,
  otherMemberCount: 4,
});

function MenuWithLeaveDialog() {
  const [leaving, setLeaving] = useState(false);
  return (
    <>
      <RoomMenu
        items={ownerPublicItems}
        onSelect={(kind) => {
          if (kind === "leave") setLeaving(true);
        }}
      />
      <ConfirmDialog
        open={leaving}
        title="이 그룹에서 나갈까요?"
        cancelLabel="취소"
        confirmLabel="나가기"
        onCancel={() => setLeaving(false)}
        onConfirm={() => setLeaving(false)}
      />
    </>
  );
}

describe("RoomMenu", () => {
  it("그룹 메뉴 버튼은 메뉴가 열렸는지 알린다", async () => {
    render(<RoomMenu items={ownerPublicItems} onSelect={vi.fn()} />);
    const trigger = screen.getByRole("button", { name: "그룹 메뉴" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.setup().click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "그룹 메뉴", hidden: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("새 신청 수를 신청 확인 옆에 두고, 그룹 나가기 아래 안내는 설명으로 읽힌다", () => {
    render(<RoomMenu items={ownerPublicItems} onSelect={vi.fn()} defaultOpen />);
    expect(screen.getByRole("menuitem", { name: /신청 확인/ })).toHaveTextContent("2");
    expect(screen.getByRole("menuitem", { name: "그룹 나가기" })).toHaveAccessibleDescription(
      "그룹장을 넘긴 뒤에 나갈 수 있어요",
    );
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("새 신청이 없으면 신청 확인 옆에 숫자를 두지 않는다", () => {
    const items = roomMenuItems({
      role: "owner",
      visibility: "public",
      newRequestCount: 0,
      otherMemberCount: 4,
    });
    render(<RoomMenu items={items} onSelect={vi.fn()} defaultOpen />);
    expect(screen.getByRole("menuitem", { name: "신청 확인" }).textContent).toBe("신청 확인");
  });

  it("비공개 그룹 멤버에게는 초대하기, 멤버 보기, 그룹 나가기를 안내 없이 둔다", () => {
    const items = roomMenuItems({
      role: "member",
      visibility: "private",
      newRequestCount: 0,
      otherMemberCount: 4,
    });
    render(<RoomMenu items={items} onSelect={vi.fn()} defaultOpen />);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "초대하기",
      "그룹 소개 보기",
      "멤버 보기",
      "그룹 나가기",
    ]);
    expect(screen.getByRole("menuitem", { name: "그룹 나가기" })).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("항목을 고르면 그 종류를 넘기고 닫는다", async () => {
    const onSelect = vi.fn();
    render(<RoomMenu items={ownerPublicItems} onSelect={onSelect} defaultOpen />);
    await userEvent.setup().click(screen.getByRole("menuitem", { name: "멤버 관리" }));
    expect(onSelect).toHaveBeenCalledWith("manage_members");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("메뉴에서 연 확인 창을 닫으면 포커스가 그룹 메뉴 버튼으로 돌아온다", async () => {
    const user = userEvent.setup();
    render(<MenuWithLeaveDialog />);
    await user.click(screen.getByRole("button", { name: "그룹 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "그룹 나가기" }));
    await user.click(await screen.findByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "그룹 메뉴" })).toHaveFocus());
  });

  it("메뉴 안 touchmove는 document까지 올라가지 않는다", () => {
    render(<RoomMenu items={ownerPublicItems} onSelect={vi.fn()} defaultOpen />);
    const onDocumentTouchMove = vi.fn();
    document.addEventListener("touchmove", onDocumentTouchMove);
    // Radix 스크롤 잠금이 터치 좌표를 읽으므로 좌표를 실어 보낸다.
    const touch = { clientX: 10, clientY: 10 };
    fireEvent.touchMove(screen.getByRole("menu"), { touches: [touch], changedTouches: [touch] });
    fireEvent.touchMove(screen.getByRole("menuitem", { name: "그룹 설정" }), {
      touches: [touch],
      changedTouches: [touch],
    });
    document.removeEventListener("touchmove", onDocumentTouchMove);
    expect(onDocumentTouchMove).not.toHaveBeenCalled();
  });
});
