export type RoomRole = "owner" | "member";

export type RoomVisibility = "public" | "private";

export type RoomMenuItem =
  | { kind: "requests"; label: "신청 확인"; badge: number }
  | { kind: "invite"; label: "초대하기" }
  | { kind: "manage_members"; label: "멤버 관리" }
  | { kind: "view_members"; label: "멤버 보기" }
  | { kind: "settings"; label: "그룹 설정" }
  | { kind: "leave"; label: "그룹 나가기"; note: string | null };

export interface ConfirmDialogCopy {
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  /** 내보내기와 나가기처럼 멤버가 그룹에서 빠지는 일은 빨간 버튼이다. */
  confirmTone: "primary" | "danger";
}

export type LeaveDialog =
  | { kind: "must_transfer"; copy: ConfirmDialogCopy }
  | { kind: "confirm_leave"; copy: ConfirmDialogCopy };

/**
 * 그룹장이 나가기 전에 그룹장을 넘겨야 하는지
 *
 * 혼자 남은 그룹장은 바로 나갈 수 있어서 다른 멤버가 있을 때만 넘겨야 한다.
 * 메뉴 안내와 나가기 확인 창이 같은 판단을 써야 메뉴가 말한 대로 창이 뜬다.
 */
function mustTransferBeforeLeave(role: RoomRole, otherMemberCount: number): boolean {
  return role === "owner" && otherMemberCount > 0;
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
    label: "그룹 나가기",
    note: mustTransferBeforeLeave(role, otherMemberCount)
      ? "그룹장을 넘긴 뒤에 나갈 수 있어요"
      : null,
  };
  if (role === "owner") {
    const first: RoomMenuItem =
      visibility === "public"
        ? { kind: "requests", label: "신청 확인", badge: newRequestCount }
        : { kind: "invite", label: "초대하기" };
    return [
      first,
      { kind: "manage_members", label: "멤버 관리" },
      { kind: "settings", label: "그룹 설정" },
      leave,
    ];
  }
  const memberItems: RoomMenuItem[] = [{ kind: "view_members", label: "멤버 보기" }, leave];
  return visibility === "private"
    ? [{ kind: "invite", label: "초대하기" }, ...memberItems]
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
        title: "그룹장을 넘겨야 나갈 수 있어요",
        description: "멤버 관리에서 그룹장을 먼저 넘겨 주세요",
        cancelLabel: "닫기",
        confirmLabel: "멤버 관리",
        confirmTone: "primary",
      },
    };
  }
  return {
    kind: "confirm_leave",
    copy: {
      title: "이 그룹에서 나갈까요?",
      description: leaveDescription(role, visibility),
      cancelLabel: "취소",
      confirmLabel: "나가기",
      confirmTone: "danger",
    },
  };
}

function leaveDescription(role: RoomRole, visibility: RoomVisibility): string {
  // 넘기라는 창을 지나 여기까지 온 그룹장은 혼자 남은 그룹장이라 나가면 그룹이 사라진다.
  if (role === "owner") {
    return "그룹에서 나가게 된다면 이 그룹이 사라져요";
  }
  return visibility === "public"
    ? "그룹에 다시 들어오려면 새로 신청해야 해요"
    : "그룹에 다시 들어오려면 다시 초대받아야 해요";
}

export function transferOwnerDialog(nickname: string): ConfirmDialogCopy {
  return {
    title: `${nickname}님에게 그룹장을 넘길까요?`,
    description: "더 이상 그룹장 역할을 할 수 없어요",
    cancelLabel: "취소",
    confirmLabel: "넘기기",
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
    title: `${nickname}님을 내보낼까요?`,
    description: `${nickname}님은 3일 동안 다시 들어올 수 없어요`,
    cancelLabel: "취소",
    confirmLabel: "내보내기",
    confirmTone: "danger",
  };
}

/**
 * 비공개 그룹에서 멤버를 내보낸 직후 그룹장에게 띄우는 토스트 문장
 *
 * 내보낼 때 서버가 초대코드와 링크를 새로 만들어 예전 코드로는 다시 들어올 수 없다.
 * 내보내기 확인 창 문구는 바꾸지 않고 내보낸 뒤 이 토스트로만 알린다.
 */
export const INVITE_CODE_RENEWED_COPY = "초대코드가 새로 바뀌었어요";
