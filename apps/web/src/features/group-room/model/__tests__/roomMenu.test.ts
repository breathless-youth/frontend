import { describe, expect, it } from "vitest";

import {
  INVITE_CODE_RENEWED_COPY,
  kickMemberDialog,
  leaveRoomDialog,
  roomMenuItems,
  transferOwnerDialog,
} from "../roomMenu";

const kinds = (items: ReturnType<typeof roomMenuItems>) => items.map((item) => item.kind);

describe("roomMenuItems", () => {
  it("공개 그룹 그룹장은 신청 확인, 멤버 관리, 그룹 설정, 그룹 나가기다", () => {
    const items = roomMenuItems({
      role: "owner",
      visibility: "public",
      newRequestCount: 2,
      otherMemberCount: 4,
    });
    expect(kinds(items)).toEqual(["requests", "manage_members", "settings", "leave"]);
    expect(items[0]).toEqual({ kind: "requests", label: "신청 확인", badge: 2 });
    expect(items[3]).toEqual({
      kind: "leave",
      label: "그룹 나가기",
      note: "그룹장을 넘긴 뒤에 나갈 수 있어요",
    });
  });

  it("비공개 그룹 그룹장은 신청 확인 대신 초대하기가 맨 위다", () => {
    expect(
      kinds(
        roomMenuItems({
          role: "owner",
          visibility: "private",
          newRequestCount: 0,
          otherMemberCount: 2,
        }),
      ),
    ).toEqual(["invite", "manage_members", "settings", "leave"]);
  });

  it("혼자 남은 그룹장의 그룹 나가기에는 안내가 없다", () => {
    const items = roomMenuItems({
      role: "owner",
      visibility: "public",
      newRequestCount: 0,
      otherMemberCount: 0,
    });
    expect(items.at(-1)).toEqual({ kind: "leave", label: "그룹 나가기", note: null });
  });

  it("멤버는 멤버 보기와 그룹 나가기이고 비공개 그룹이면 초대하기가 앞에 온다", () => {
    expect(
      kinds(
        roomMenuItems({
          role: "member",
          visibility: "public",
          newRequestCount: 0,
          otherMemberCount: 3,
        }),
      ),
    ).toEqual(["view_members", "leave"]);
    expect(
      kinds(
        roomMenuItems({
          role: "member",
          visibility: "private",
          newRequestCount: 0,
          otherMemberCount: 3,
        }),
      ),
    ).toEqual(["invite", "view_members", "leave"]);
  });

  it("멤버의 그룹 나가기에는 다른 멤버가 있어도 안내가 없다", () => {
    const items = roomMenuItems({
      role: "member",
      visibility: "public",
      newRequestCount: 0,
      otherMemberCount: 3,
    });
    expect(items.at(-1)).toEqual({ kind: "leave", label: "그룹 나가기", note: null });
  });
});

describe("leaveRoomDialog", () => {
  it("다른 멤버가 있는 그룹장은 넘기라는 창이다", () => {
    expect(leaveRoomDialog({ role: "owner", visibility: "public", otherMemberCount: 3 })).toEqual({
      kind: "must_transfer",
      copy: {
        title: "그룹장을 넘겨야 나갈 수 있어요",
        description: "멤버 관리에서 그룹장을 먼저 넘겨 주세요",
        cancelLabel: "닫기",
        confirmLabel: "멤버 관리",
        confirmTone: "primary",
      },
    });
  });

  it("혼자 남은 그룹장은 그룹이 사라진다고 알린다", () => {
    const dialog = leaveRoomDialog({ role: "owner", visibility: "private", otherMemberCount: 0 });
    expect(dialog.kind).toBe("confirm_leave");
    expect(dialog.copy.description).toBe("그룹에서 나가게 된다면 이 그룹이 사라져요");
    expect(dialog.copy.confirmTone).toBe("danger");
  });

  it("멤버는 그룹 종류에 따라 다시 들어오는 길을 알린다", () => {
    expect(
      leaveRoomDialog({ role: "member", visibility: "public", otherMemberCount: 2 }).copy,
    ).toEqual({
      title: "이 그룹에서 나갈까요?",
      description: "그룹에 다시 들어오려면 새로 신청해야 해요",
      cancelLabel: "취소",
      confirmLabel: "나가기",
      confirmTone: "danger",
    });
    expect(
      leaveRoomDialog({ role: "member", visibility: "private", otherMemberCount: 2 }).copy
        .description,
    ).toBe("그룹에 다시 들어오려면 다시 초대받아야 해요");
  });
});

describe("그룹장 넘기기와 내보내기", () => {
  it("닉네임 뒤 님은 붙여 쓴다", () => {
    expect(transferOwnerDialog("수빈")).toEqual({
      title: "수빈님에게 그룹장을 넘길까요?",
      description: "더 이상 그룹장 역할을 할 수 없어요",
      cancelLabel: "취소",
      confirmLabel: "넘기기",
      confirmTone: "primary",
    });
    expect(kickMemberDialog("민준")).toEqual({
      title: "민준님을 내보낼까요?",
      description: "민준님은 3일 동안 다시 들어올 수 없어요",
      cancelLabel: "취소",
      confirmLabel: "내보내기",
      confirmTone: "danger",
    });
  });

  it("비공개 그룹에서 내보낸 뒤 그룹장에게 초대코드가 바뀐 것을 알린다", () => {
    expect(INVITE_CODE_RENEWED_COPY).toBe("초대코드가 새로 바뀌었어요");
  });
});
