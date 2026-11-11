import type { AccessorySlot, MascotId } from "@/features/points/types";
import i18n from "@/lib/i18n";

import { GROUP_ROOM_LIMITS } from "./limits";

/**
 * 멤버가 지금 공부하는 곳
 *
 * 다른 곳이 싱글룸인지 다른 그룹인지는 드러내지 않으므로 이 그룹 공부방 밖은 측정 중과 일시정지로만 나눈다.
 */
export type MemberPresence = "this_room" | "studying_elsewhere" | "paused_elsewhere" | "away";

export type DeskTone = "room" | "elsewhere" | "rest";

/** 책상에 앉힐 마스코트와 입은 소품. 그림 주소가 없는 소품은 그릴 수 없어 빼고 담는다. */
export interface DeskMascot {
  id: MascotId;
  accessories: { slot: AccessorySlot; code: string; imageUrl: string }[];
}

export interface DeskMember {
  userId: number;
  nickname: string;
  isOwner: boolean;
  presence: MemberPresence;
  /** 이 그룹이 아니라 앱 전체에서 쌓은 오늘 순공(초). */
  todayStudySec: number;
  /** 공부한 적이 없으면 `null`이다. */
  lastStudiedAt: string | null;
  /**
   * 지금 순공이 쌓이는지 여부
   *
   * 공부방에 있거나 측정 중이어도 일시정지나 휴식 동안에는 순공이 쌓이지 않아 책상 색과 따로 받는다.
   */
  accumulating: boolean;
  /** 서버가 마스코트를 아직 주지 않는 응답에서는 없고, 그때 책상은 사람 그림이다. */
  mascot?: DeskMascot;
}

export type DeskSlot = { kind: "member"; member: DeskMember; tone: DeskTone } | { kind: "empty" };

type MemberSlot = Extract<DeskSlot, { kind: "member" }>;

const TONE_BY_PRESENCE: Record<MemberPresence, DeskTone> = {
  this_room: "room",
  studying_elsewhere: "elsewhere",
  paused_elsewhere: "rest",
  away: "rest",
};

const TONE_ORDER: Record<DeskTone, number> = { room: 0, elsewhere: 1, rest: 2 };

/**
 * 책상 색
 *
 * 카메라를 끄거나 휴식 중이어도 이 그룹 공부방에 있으면 공부방 색이다.
 * 다른 곳에서 일시정지한 멤버는 지금 공부하지 않으므로 쉼 색이다.
 */
export function deskTone(presence: MemberPresence): DeskTone {
  return TONE_BY_PRESENCE[presence];
}

/**
 * 책상 순서와 빈자리
 *
 * 공부방, 다른 곳, 쉼 순서로 놓고 같은 색 안에서는 오늘 순공이 많은 멤버가 앞이다.
 * 색과 시간이 같으면 받은 순서를 지켜야 갱신할 때마다 책상이 자리를 바꾸지 않는다.
 * `Array.prototype.sort`는 안정 정렬이라 비교값이 같으면 받은 순서가 남는다.
 */
export function arrangeDesks(
  members: readonly DeskMember[],
  capacity: number = GROUP_ROOM_LIMITS.maxMembers,
): DeskSlot[] {
  const seated = members
    .map((member): MemberSlot => ({ kind: "member", member, tone: deskTone(member.presence) }))
    .sort(
      (a, b) =>
        TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || b.member.todayStudySec - a.member.todayStudySec,
    )
    .slice(0, capacity);
  const empty = Array.from({ length: capacity - seated.length }, (): DeskSlot => ({
    kind: "empty",
  }));
  return [...seated, ...empty];
}

/** 공부방 색과 다른 곳 색 책상을 더한 수. */
export function studyingCount(members: readonly DeskMember[]): number {
  return members.filter((member) => deskTone(member.presence) !== "rest").length;
}

/**
 * 공부 중인 사람 수 문장
 *
 * 공개 그룹 카드는 멤버 목록 없이 수만 받으므로 문장을 수에서 만든다.
 */
export function studyingCountText(count: number): string {
  return count > 0
    ? i18n.t("group-room:desks.studyingCount", { count })
    : i18n.t("group-room:desks.nobodyStudying");
}

export function roomStatusText(members: readonly DeskMember[]): string {
  return studyingCountText(studyingCount(members));
}

/**
 * 지금 보여 줄 순공(초)
 *
 * 서버 값을 받은 뒤 흐른 초를 순공이 쌓이는 중인 멤버에게만 더한다.
 * 기기 시계가 뒤로 가 흐른 초가 음수여도 서버 값보다 줄여 보이지 않는다.
 */
export function liveSeconds(baseSec: number, accumulating: boolean, elapsedSec: number): number {
  return accumulating ? baseSec + Math.max(0, elapsedSec) : baseSec;
}

/**
 * 이번 주 순위 줄마다 보여 줄 순공(초)
 *
 * 받은 순서를 순위 순서로 본다.
 * 순위는 다시 받을 때만 바뀌므로 올린 값이 바로 위 줄을 넘으면 아래 줄이 더 많은 시간을 보이게 된다.
 * 그래서 랭킹 탭처럼 위 줄 값에서 멈춘다.
 */
export function liveRankSeconds(
  rows: readonly { weeklyStudySec: number; accumulating: boolean }[],
  elapsedSec: number,
): number[] {
  const result: number[] = [];
  for (const row of rows) {
    const raised = liveSeconds(row.weeklyStudySec, row.accumulating, elapsedSec);
    const ceiling = result.at(-1) ?? Number.POSITIVE_INFINITY;
    result.push(Math.min(raised, ceiling));
  }
  return result;
}
