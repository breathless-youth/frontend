import { afterEach, beforeEach, describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";

import { joinPolicyText } from "../joinPolicy";
import { ApiError } from "@/lib/api";
import { groupErrorCopy } from "../../groupErrorCopy";
import { contactBlockedCopy } from "../contactCheck";
import { nameTakenCopy } from "../nameCheck";
import { studyingCountText } from "../desks";
import type { ApplyBlockReason, JoinBlockReason } from "../limits";
import { applyBlockCopy, createRoomLimitCopy, joinBlockCopy, memberCountText } from "../limits";
import type { ConfirmDialogCopy } from "../roomMenu";
import {
  inviteCodeRenewedCopy,
  kickMemberDialog,
  leaveRoomDialog,
  roomMenuItems,
  transferOwnerDialog,
} from "../roomMenu";
import { appliedAtText, formatHoursMinutes, lastStudiedText, remainingText } from "../timeText";

/** 한국 시간 2026년 11월 2일 오전 10시. */
const NOW = new Date("2026-11-02T10:00:00+09:00");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const later = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const APPLY_REASONS: ApplyBlockReason[] = [
  "kicked_recently",
  "rooms_and_applications_full",
  "pending_applications_full",
];
const JOIN_REASONS: JoinBlockReason[] = [
  "room_full",
  "kicked_recently",
  "rooms_and_applications_full",
  "invalid_code",
];

const dialogTexts = (copy: ConfirmDialogCopy) => [
  copy.title,
  copy.description,
  copy.cancelLabel,
  copy.confirmLabel,
];

/** 그룹 모델이 만드는 문장을 경우마다 하나씩 모은다. */
function everyCopy(): string[] {
  const texts: (string | null)[] = [
    contactBlockedCopy(),
    joinPolicyText("approval"),
    joinPolicyText("open"),
    ...(
      [
        "whoCanJoin",
        "settingsLabel",
        "pendingLoss",
        "join",
        "full",
        "openError",
        "approvalRequiredError",
      ] as const
    ).map((key) => i18n.t(`group-room:joinPolicy.${key}`, { count: 3 })),
    groupErrorCopy("apply", new ApiError("x", 409, "GROUP_JOIN_OPEN")),
    groupErrorCopy("join_public", new ApiError("x", 409, "GROUP_JOIN_APPROVAL_REQUIRED")),
    nameTakenCopy(),
    createRoomLimitCopy(),
    inviteCodeRenewedCopy(),
    memberCountText(4),
    studyingCountText(2),
    studyingCountText(0),
    ...APPLY_REASONS.map(applyBlockCopy),
    ...JOIN_REASONS.map(joinBlockCopy),
    ...dialogTexts(transferOwnerDialog("Mina")),
    ...dialogTexts(kickMemberDialog("Mina")),
    formatHoursMinutes(76_200),
    formatHoursMinutes(3_600),
    formatHoursMinutes(600),
    lastStudiedText(ago(30 * MIN), NOW),
    lastStudiedText(ago(2 * HOUR), NOW),
    lastStudiedText("2026-11-01T23:50:00+09:00", NOW),
    lastStudiedText("2026-10-30T12:00:00+09:00", NOW),
    appliedAtText(ago(10 * MIN), NOW),
    appliedAtText(ago(3 * HOUR), NOW),
    appliedAtText("2026-11-01T20:00:00+09:00", NOW),
    appliedAtText("2026-10-31T20:00:00+09:00", NOW),
    remainingText(later(2 * DAY + 23 * HOUR + 30 * MIN), NOW),
    remainingText(later(2 * DAY), NOW),
    remainingText(later(23 * HOUR), NOW),
    remainingText(later(59 * MIN), NOW),
  ];
  for (const role of ["owner", "member"] as const) {
    for (const visibility of ["public", "private"] as const) {
      for (const otherMemberCount of [0, 3]) {
        for (const item of roomMenuItems({
          role,
          visibility,
          newRequestCount: 2,
          otherMemberCount,
        })) {
          texts.push(item.label, item.kind === "leave" ? item.note : null);
        }
        texts.push(...dialogTexts(leaveRoomDialog({ role, visibility, otherMemberCount }).copy));
      }
    }
  }
  return texts.filter((text): text is string => text !== null);
}

// 모듈을 불러온 뒤에 언어를 바꾸므로 문구를 모듈을 읽을 때가 아니라 부를 때 고르는지도 함께 확인한다.
describe("영어 화면의 그룹 모델 문구", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("어떤 경우의 문장에도 한글이 없다", () => {
    for (const text of everyCopy()) {
      expect(text).not.toMatch(/[가-힣]/);
    }
  });

  it("그룹과 신청을 합친 5개 한도는 신청과 코드 참여가 같은 영어 문장을 쓴다", () => {
    expect(applyBlockCopy("rooms_and_applications_full")).toBe("Up to 5 groups and requests");
    expect(joinBlockCopy("rooms_and_applications_full")).toBe("Up to 5 groups and requests");
  });

  it("시간 길이는 영어 단위로 적는다", () => {
    expect(formatHoursMinutes(76_200)).toBe("21h 10m");
    expect(formatHoursMinutes(3_600)).toBe("1h");
    expect(remainingText(later(2 * DAY + 23 * HOUR + 30 * MIN), NOW)).toBe("2d 23h");
    expect(remainingText(later(30_000), NOW)).toBe("1m");
  });

  it("지난 때는 영어 말 순서로 적고 하나일 때는 단수를 쓴다", () => {
    expect(lastStudiedText(ago(2 * HOUR), NOW)).toBe("2 hours ago");
    expect(lastStudiedText(ago(HOUR + 5 * MIN), NOW)).toBe("1 hour ago");
    expect(lastStudiedText("2026-11-01T23:50:00+09:00", NOW)).toBe("Yesterday");
    expect(appliedAtText(ago(10 * MIN), NOW)).toBe("Requested just now");
    expect(appliedAtText(ago(3 * HOUR), NOW)).toBe("Requested 3 hours ago");
  });

  it("내보내기 창은 닉네임과 다시 들어올 수 없는 일수를 넣는다", () => {
    expect(kickMemberDialog("Mina")).toEqual({
      title: "Remove Mina?",
      description: "Mina can't rejoin for 3 days",
      cancelLabel: "Cancel",
      confirmLabel: "Remove",
      confirmTone: "danger",
    });
  });
});
