import type { GroupVisibility, MyGroupCard } from "@focusmakers/types";

import { setGroupRoomCount, trackGroupRoomJoined, trackGroupRoomLeft } from "@/lib/amplitude";

import { toRoomVisibility } from "./fromApi";

/**
 * 내 그룹 목록 차이로 세는 가입과 내보내짐
 *
 * 신청 수락과 내보내기는 다른 사람이 해서 이 기기는 그 순간을 모른다.
 * 그래서 내 그룹 탭 응답의 그룹 번호를 사용자마다 기억해 두고 다음 응답과 비교한다.
 * 이 기기에서 만들거나 코드로 들어가거나 나간 그룹은 그 화면이 이미 보냈으므로 표시를 남겨 비교에서 뺀다.
 */

/** 이 기기에서 바꾼 내 멤버 상태 */
export interface LocalMembershipChange {
  kind: "created" | "joined_by_code" | "left";
  groupId: number;
}

export interface MembershipObservation {
  /** 이 기기가 하지 않았는데 새로 생긴 공개 그룹이고, 그룹장이 신청을 받아 준 것이다. */
  joined: Array<{ groupId: number; visibility: GroupVisibility }>;
  /** 이 기기가 나가지 않았는데 사라진 그룹이고, 그룹장이 나를 내보낸 것이다. */
  kicked: number[];
  /** 들어간 그룹 수가 지난 응답과 다르고, 처음 본 목록도 바뀐 것으로 본다. */
  countChanged: boolean;
}

/** 표시가 가리키는 쪽이고 멤버가 된 일은 `in`, 멤버가 아니게 된 일은 `out`이다. */
type PendingSide = "in" | "out";

interface MembershipMemory {
  /** 마지막으로 본 내 그룹 번호이고 아직 한 번도 보지 못했으면 null이다. */
  groupIds: number[] | null;
  /** 이 기기에서 한 일 중 아직 목록에 반영되지 않은 것이고 그룹마다 마지막 일 하나만 둔다. */
  pending: Array<[number, PendingSide]>;
}

const STORAGE_KEY_PREFIX = "focusmakers.groupMembership.v1.";

/**
 * 남겨 둘 표시의 최대 개수
 *
 * 목록에 끝내 나타나지 않는 그룹의 표시는 반영되지 않아 남는데, 그룹 한도가 작아 보통 몇 개뿐이라 넉넉하게 막아 둔다.
 */
const MAX_PENDING_MARKS = 20;

function storageKey(userId: number): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function nothingObserved(): MembershipObservation {
  return { joined: [], kicked: [], countChanged: false };
}

function isGroupId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isPendingEntry(value: unknown): value is [number, PendingSide] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    isGroupId(value[0]) &&
    (value[1] === "in" || value[1] === "out")
  );
}

function isMembershipMemory(value: unknown): value is MembershipMemory {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { groupIds, pending } = value as Record<string, unknown>;
  return (
    (groupIds === null || (Array.isArray(groupIds) && groupIds.every(isGroupId))) &&
    Array.isArray(pending) &&
    pending.every(isPendingEntry)
  );
}

/**
 * 기억 읽기
 *
 * 저장소가 막혀 읽지 못하면 예외를 그대로 넘겨 부른 쪽이 아무것도 세지 않게 한다.
 * 망가진 값은 처음 보는 것처럼 다시 시작한다.
 */
function readMemory(userId: number): MembershipMemory {
  const raw = localStorage.getItem(storageKey(userId));
  if (raw !== null) {
    try {
      const value: unknown = JSON.parse(raw);
      if (isMembershipMemory(value)) {
        return value;
      }
    } catch {
      // 아래의 처음 상태로 다시 시작한다.
    }
  }
  return { groupIds: null, pending: [] };
}

function writeMemory(userId: number, memory: MembershipMemory): void {
  localStorage.setItem(storageKey(userId), JSON.stringify(memory));
}

/**
 * 이 기기에서 바꾼 멤버 상태 표시
 *
 * 만들기, 코드 참여, 나가기는 그 화면이 이벤트를 보내서 다음 목록 비교가 같은 일을 신청 가입이나 내보내짐으로 다시 세지 않게 표시를 남긴다.
 * 내 그룹을 다시 받기 전에 불러야 그 응답이 표시보다 먼저 비교되지 않는다.
 * 같은 그룹에 한 일이 이어지면 마지막 일만 남기고, 표시는 최근 것부터 정한 개수까지만 둔다.
 */
export function markLocalMembership(userId: number, change: LocalMembershipChange): void {
  try {
    const memory = readMemory(userId);
    const side: PendingSide = change.kind === "left" ? "out" : "in";
    const pending: Array<[number, PendingSide]> = [
      ...memory.pending.filter(([groupId]) => groupId !== change.groupId),
      [change.groupId, side],
    ];
    writeMemory(userId, {
      groupIds: memory.groupIds,
      pending: pending.slice(-MAX_PENDING_MARKS),
    });
  } catch {
    // 저장소를 쓸 수 없으면 목록 비교도 아무것도 세지 않아서 표시가 없어도 두 번 세지 않는다.
  }
}

/**
 * 내 그룹 목록 비교
 *
 * 지난 목록에 없던 그룹은 신청 가입, 지난 목록에서 사라진 그룹은 내보내짐으로 보고 이 기기에서 한 일의 표시가 있는 그룹은 뺀다.
 * 신청은 공개 그룹에만 할 수 있어서 표시 없이 생긴 비공개 그룹은 가입으로 세지 않고 기억만 한다.
 * 목록에 반영된 표시는 비교에 한 번 쓰고 뺀다.
 * 받아 둔 목록이 표시보다 오래돼 아직 반영되지 않은 표시는 남겨 다음 응답에서 쓴다.
 * 처음 본 목록은 앞 목록이 없어 기억만 한다.
 * 저장소를 읽거나 쓰지 못하면 다음 응답이 같은 차이를 다시 셀 수 있어서 아무것도 세지 않는다.
 */
export function observeMyGroups(
  userId: number,
  groups: readonly MyGroupCard[],
): MembershipObservation {
  try {
    const memory = readMemory(userId);
    const ids = groups.map((group) => group.groupId);
    const previous = memory.groupIds;
    const pendingSide = new Map(memory.pending);
    const joined =
      previous === null
        ? []
        : groups
            .filter(
              (group) =>
                group.visibility === "PUBLIC" &&
                !previous.includes(group.groupId) &&
                pendingSide.get(group.groupId) !== "in",
            )
            .map((group) => ({ groupId: group.groupId, visibility: group.visibility }));
    const kicked =
      previous === null
        ? []
        : previous.filter(
            (groupId) => !ids.includes(groupId) && pendingSide.get(groupId) !== "out",
          );
    writeMemory(userId, {
      groupIds: ids,
      pending: memory.pending.filter(([groupId, side]) =>
        side === "in" ? !ids.includes(groupId) : ids.includes(groupId),
      ),
    });
    return { joined, kicked, countChanged: previous === null || previous.length !== ids.length };
  } catch {
    return nothingObserved();
  }
}

/**
 * 내 그룹 응답으로 가입, 내보내짐, 들어간 그룹 수 보내기
 *
 * 그룹 탭이 내 그룹 응답을 받을 때마다 부른다.
 * 공개 여부는 응답의 값을 이벤트 값으로 바꿔 싣는다.
 */
export function reportMembershipChanges(userId: number, groups: readonly MyGroupCard[]): void {
  const { joined, kicked, countChanged } = observeMyGroups(userId, groups);
  for (const group of joined) {
    trackGroupRoomJoined({ via: "application", visibility: toRoomVisibility(group.visibility) });
  }
  kicked.forEach(() => trackGroupRoomLeft("kicked"));
  if (countChanged) {
    setGroupRoomCount(groups.length);
  }
}
