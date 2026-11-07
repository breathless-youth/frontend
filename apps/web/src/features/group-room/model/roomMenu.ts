import i18n from "@/lib/i18n";

import { GROUP_ROOM_LIMITS } from "./limits";

export type RoomRole = "owner" | "member";

export type RoomVisibility = "public" | "private";

export type RoomMenuItem =
  | { kind: "requests"; label: string; badge: number }
  | { kind: "invite"; label: string }
  | { kind: "manage_members"; label: string }
  | { kind: "view_members"; label: string }
  | { kind: "settings"; label: string }
  | { kind: "view_intro"; label: string }
  | { kind: "leave"; label: string; note: string | null };

const ITEM_LABEL_KEYS = {
  requests: "group-room:roomMenu.item.requests",
  invite: "group-room:roomMenu.item.invite",
  manage_members: "group-room:roomMenu.item.manageMembers",
  view_members: "group-room:roomMenu.item.viewMembers",
  settings: "group-room:roomMenu.item.settings",
  view_intro: "group-room:roomMenu.item.viewIntro",
  leave: "group-room:roomMenu.item.leave",
} as const satisfies Record<RoomMenuItem["kind"], string>;

function itemLabel(kind: RoomMenuItem["kind"]): string {
  return i18n.t(ITEM_LABEL_KEYS[kind]);
}

export interface ConfirmDialogCopy {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  /** 멤버가 그룹에서 빠지는 일은 되돌리기 어려워 `danger`로 경고한다. */
  confirmTone: "primary" | "danger";
}

export type LeaveDialog =
  | { kind: "must_transfer"; copy: ConfirmDialogCopy }
  | { kind: "confirm_leave"; copy: ConfirmDialogCopy };

/**
 * 나가기 전에 그룹장을 넘겨야 하는 조건
 *
 * 혼자 남은 그룹장은 바로 나갈 수 있어서 다른 멤버가 있을 때만 넘겨야 한다.
 * 메뉴 안내와 나가기 확인 창이 같은 판단을 써야 메뉴가 말한 대로 창이 뜬다.
 */
function mustTransferBeforeLeave(role: RoomRole, otherMemberCount: number): boolean {
  return role === "owner" && otherMemberCount > 0;
}

/**
 * 나를 뺀 멤버 수
 *
 * 그룹 메뉴의 나가기 안내와 나가기 확인 창이 같은 수로 판단해야 메뉴가 말한 대로 창이 뜬다.
 * 멤버 수를 받기 전에 0이 와도 음수가 되지 않게 0에서 멈춘다.
 */
export function otherMemberCount(memberCount: number): number {
  return Math.max(0, memberCount - 1);
}

/**
 * 그룹 메뉴 항목
 *
 * 비공개 그룹은 멤버도 초대할 수 있어 누구에게나 초대하기가 맨 위에 온다.
 * 공개 그룹에는 초대코드가 없고 그룹장만 신청을 받으므로 그룹장에게만 신청 확인이 맨 위에 온다.
 */
export function roomMenuItems(input: {
  role: RoomRole;
  visibility: RoomVisibility;
  newRequestCount: number;
  otherMemberCount: number;
}): RoomMenuItem[] {
  const { role, visibility, newRequestCount, otherMemberCount } = input;
  const leave: RoomMenuItem = {
    kind: "leave",
    label: itemLabel("leave"),
    note: mustTransferBeforeLeave(role, otherMemberCount)
      ? i18n.t("group-room:roomMenu.item.leaveNote")
      : null,
  };
  if (role === "owner") {
    const first: RoomMenuItem =
      visibility === "public"
        ? { kind: "requests", label: itemLabel("requests"), badge: newRequestCount }
        : { kind: "invite", label: itemLabel("invite") };
    return [
      first,
      { kind: "manage_members", label: itemLabel("manage_members") },
      { kind: "settings", label: itemLabel("settings") },
      leave,
    ];
  }
  const memberItems: RoomMenuItem[] = [
    { kind: "view_intro", label: itemLabel("view_intro") },
    { kind: "view_members", label: itemLabel("view_members") },
    leave,
  ];
  return visibility === "private"
    ? [{ kind: "invite", label: itemLabel("invite") }, ...memberItems]
    : memberItems;
}

/**
 * 그룹 나가기 확인 창
 *
 * 다른 멤버가 있는 그룹장은 나갈 수 없어서 나가기 대신 멤버 관리로 가는 창을 띄운다.
 */
export function leaveRoomDialog(input: {
  role: RoomRole;
  visibility: RoomVisibility;
  otherMemberCount: number;
}): LeaveDialog {
  const { role, visibility, otherMemberCount } = input;
  if (mustTransferBeforeLeave(role, otherMemberCount)) {
    return {
      kind: "must_transfer",
      copy: {
        title: i18n.t("group-room:roomMenu.mustTransfer.title"),
        description: i18n.t("group-room:roomMenu.mustTransfer.description"),
        cancelLabel: i18n.t("common:actions.close"),
        confirmLabel: i18n.t("group-room:roomMenu.mustTransfer.confirm"),
        confirmTone: "primary",
      },
    };
  }
  return {
    kind: "confirm_leave",
    copy: {
      title: i18n.t("group-room:roomMenu.confirmLeave.title"),
      description: leaveDescription(role, visibility),
      cancelLabel: i18n.t("common:actions.cancel"),
      confirmLabel: i18n.t("group-room:roomMenu.confirmLeave.confirm"),
      confirmTone: "danger",
    },
  };
}

function leaveDescription(role: RoomRole, visibility: RoomVisibility): string {
  // 넘기라는 창을 지나 여기까지 온 그룹장은 혼자 남은 그룹장이라 나가면 그룹이 사라진다.
  if (role === "owner") {
    return i18n.t("group-room:roomMenu.confirmLeave.soleOwner");
  }
  return visibility === "public"
    ? i18n.t("group-room:roomMenu.confirmLeave.publicMember")
    : i18n.t("group-room:roomMenu.confirmLeave.privateMember");
}

export function transferOwnerDialog(nickname: string): ConfirmDialogCopy {
  return {
    title: i18n.t("group-room:roomMenu.transferOwner.title", { nickname }),
    description: i18n.t("group-room:roomMenu.transferOwner.description"),
    cancelLabel: i18n.t("common:actions.cancel"),
    confirmLabel: i18n.t("group-room:roomMenu.transferOwner.confirm"),
    confirmTone: "primary",
  };
}

/**
 * 멤버 내보내기 확인 창
 *
 * 멤버 관리와 공부방 어디서 내보내도 같은 문구를 쓰고 창 모양만 다르다.
 */
export function kickMemberDialog(nickname: string): ConfirmDialogCopy {
  return {
    title: i18n.t("group-room:roomMenu.kickMember.title", { nickname }),
    description: i18n.t("group-room:roomMenu.kickMember.description", {
      nickname,
      count: GROUP_ROOM_LIMITS.kickCooldownDays,
    }),
    cancelLabel: i18n.t("common:actions.cancel"),
    confirmLabel: i18n.t("group-room:roomMenu.kickMember.confirm"),
    confirmTone: "danger",
  };
}

/**
 * 비공개 그룹에서 멤버를 내보낸 직후 그룹장에게 띄우는 토스트 문장
 *
 * 내보낼 때 서버가 초대코드와 링크를 새로 만들어 예전 코드로는 다시 들어올 수 없다.
 * 내보내기 확인 창 문구는 바꾸지 않고 내보낸 뒤 이 토스트로만 알린다.
 */
export function inviteCodeRenewedCopy(): string {
  return i18n.t("group-room:roomMenu.inviteCodeRenewed");
}
