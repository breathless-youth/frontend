import type {
  BlockListResponse,
  BlockedUser,
  GroupApplicationItem,
  GroupApplicationsResponse,
  GroupApplyState,
  GroupHomeResponse,
  GroupJoinPolicy,
  GroupInviteResponse,
  GroupLimits,
  GroupMemberDesk,
  GroupMemberItem,
  GroupMembersResponse,
  GroupMemberStatus,
  GroupUnavailableReason,
  GroupVisibility,
  MyApplicationItem,
  MyApplicationsResponse,
  MyGroupCard,
  MyGroupsResponse,
  PendingApplicationRef,
  PublicGroupCard,
  PublicGroupDetailResponse,
  StudyCategory,
} from "@focusmakers/types";

/**
 * 그룹 가짜 서버의 견본 데이터
 *
 * 백엔드 그룹 API가 501인 동안 개발 빌드와 그룹 라우트 테스트가 같은 장면을 쓴다.
 * 가짜 서버가 바꾸는 원본은 `GroupMockWorld` 하나이고 응답은 모두 그때그때 이 원본에서 만든다.
 * 그래서 멤버 한 명이 바뀌어도 내 그룹 탭, 공개 그룹 목록, 그룹 홈의 숫자가 함께 맞는다.
 */

export type GroupMockScene = "default" | "empty" | "limits";

/** 앱이 지금 사용자를 알려 주지 않을 때 견본을 보는 나 */
export const GROUP_MOCK_DEFAULT_ME = 1;

/**
 * 견본의 다른 사람 번호가 시작하는 수
 *
 * 개발 서버 계정 번호는 하나씩 늘어나는 작은 수라서 실제 계정이 나로 들어와도 견본 멤버와 겹치지 않게 10억부터 센다.
 */
const SEEDED_USER_ID_BASE = 1_000_000_000;

function seeded(offset: number): number {
  return SEEDED_USER_ID_BASE + offset;
}

export const GROUP_MOCK_LIMITS: GroupLimits = {
  maxGroupsAndApplications: 5,
  maxPendingApplications: 3,
  maxOwnedGroups: 2,
};

const MAX_MEMBERS = 6;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const KICK_COOLDOWN_MS = 3 * DAY_MS;
export const GROUP_MOCK_APPLICATION_TTL_MS = 3 * DAY_MS;

/** 그룹 멤버이고, 들어온 때는 책상 응답에는 없고 멤버 목록에만 나간다. */
export interface MockMember extends Omit<GroupMemberDesk, "owner"> {
  joinedAt: string;
}

export interface MockGroup {
  joinPolicy: GroupJoinPolicy;
  groupId: number;
  name: string;
  visibility: GroupVisibility;
  category: StudyCategory;
  description: string | null;
  ownerId: number;
  /** 들어간 순서 */
  members: MockMember[];
  /** 비공개 그룹에만 있다. */
  inviteCode: string | null;
  /** 다른 사람이 이 그룹에 보낸, 답을 기다리는 신청 */
  applications: GroupApplicationItem[];
  /** 이 그룹에 대한 내 멤버 공부 알림 */
  notifyEnabled: boolean;
}

/** 내가 보낸 신청 */
export interface MockApplication {
  applicationId: number;
  groupId: number;
  appliedAt: string;
  expiresAt: string;
}

/** 가짜 서버가 들고 바꾸는 원본 */
export interface GroupMockWorld {
  /** 견본을 보는 나이고, 그룹을 만들거나 코드로 들어갈 때 내 책상으로도 쓴다. */
  me: Omit<MockMember, "joinedAt">;
  groups: MockGroup[];
  myApplications: MockApplication[];
  /** 내가 내보내진 그룹과 그 시각 */
  kicks: { groupId: number; atMs: number }[];
  blocks: BlockedUser[];
  /** 견본의 순공이 맞는 시각이고, 순공이 쌓이는 멤버는 응답할 때 여기서부터 흐른 시간을 더한다. */
  seededAtMs: number;
}

/**
 * 내가 보는 응답 전부
 *
 * 그룹마다 받는 응답은 그룹 ID를 키로 둔다.
 * 그룹 홈, 멤버 목록, 초대코드는 내가 멤버인 그룹만, 신청 목록은 내가 그룹장인 그룹만 있다.
 */
export interface GroupMockState {
  mine: MyGroupsResponse;
  myApplications: MyApplicationsResponse;
  /** 서버 순서대로 놓은 공개 그룹 전부이고, 쪽으로 나누는 일은 가짜 서버가 한다. */
  publicGroups: PublicGroupCard[];
  publicDetails: Record<number, PublicGroupDetailResponse>;
  homes: Record<number, GroupHomeResponse>;
  members: Record<number, GroupMembersResponse>;
  invites: Record<number, GroupInviteResponse>;
  applications: Record<number, GroupApplicationsResponse>;
  blocks: BlockListResponse;
}

export function isMember(group: MockGroup, userId: number): boolean {
  return group.members.some((member) => member.userId === userId);
}

export function isGroupFull(group: MockGroup): boolean {
  return group.members.length >= MAX_MEMBERS;
}

export function isRecentlyKicked(world: GroupMockWorld, groupId: number, nowMs: number): boolean {
  return world.kicks.some(
    (kick) => kick.groupId === groupId && nowMs - kick.atMs < KICK_COOLDOWN_MS,
  );
}

/** 기한이 지난 신청은 만료 작업이 돌기 전이라도 서버가 보여 주지 않는다. */
function isLive(application: { expiresAt: string }, nowMs: number): boolean {
  return Date.parse(application.expiresAt) > nowMs;
}

function byAppliedAt(a: { appliedAt: string }, b: { appliedAt: string }): number {
  return Date.parse(a.appliedAt) - Date.parse(b.appliedAt);
}

function isStudying(member: MockMember): boolean {
  return member.status === "IN_ROOM" || member.status === "STUDYING";
}

/**
 * 응답 하나의 책상
 *
 * 화면은 받은 순공에 받은 뒤 흐른 시간만 더하므로, 서버처럼 응답하는 때까지 쌓인 순공을 넣어야 다시 받을 때 시계가 뒤로 가지 않는다.
 */
function toDesk(group: MockGroup, member: MockMember, elapsedSec: number): GroupMemberDesk {
  const accrued = member.accumulating ? elapsedSec : 0;
  return {
    userId: member.userId,
    nickname: member.nickname,
    profileImageUrl: member.profileImageUrl,
    owner: member.userId === group.ownerId,
    status: member.status,
    accumulating: member.accumulating,
    todayFocusSec: member.todayFocusSec + accrued,
    weekFocusSec: member.weekFocusSec + accrued,
    lastStudiedAt: member.lastStudiedAt,
  };
}

function toMemberItem(group: MockGroup, member: MockMember): GroupMemberItem {
  return {
    userId: member.userId,
    nickname: member.nickname,
    profileImageUrl: member.profileImageUrl,
    owner: member.userId === group.ownerId,
    joinedAt: member.joinedAt,
    lastStudiedAt: member.lastStudiedAt,
  };
}

function weeklyTotal(group: MockGroup): number {
  return group.members.reduce((sum, member) => sum + member.weekFocusSec, 0);
}

function weeklyAverage(group: MockGroup): number {
  return group.members.length === 0 ? 0 : Math.round(weeklyTotal(group) / group.members.length);
}

function liveGroupApplications(group: MockGroup, nowMs: number): GroupApplicationItem[] {
  return group.applications
    .filter((application) => isLive(application, nowMs))
    .sort(byAppliedAt)
    .map((application) => ({ ...application }));
}

/** 서버 정렬: 다 차지 않은 그룹이 먼저이고, 그 안에서는 주간 합계 순공이 많은 순, 같으면 그룹 ID가 작은 순이다. */
function byServerOrder(a: PublicGroupCard, b: PublicGroupCard): number {
  const fullFirst = Number(a.memberCount >= MAX_MEMBERS) - Number(b.memberCount >= MAX_MEMBERS);
  return fullFirst || b.weeklyTotalFocusSec - a.weeklyTotalFocusSec || a.groupId - b.groupId;
}

interface ApplyView {
  applyState: GroupApplyState;
  unavailableReason: GroupUnavailableReason | null;
  application: PendingApplicationRef | null;
}

/** 서버 설명대로 먼저 맞는 상태 하나와 먼저 맞는 이유 하나를 고른다. */
function applyViewOf(
  world: GroupMockWorld,
  group: MockGroup,
  nowMs: number,
  slotsUsed: number,
  pending: readonly MockApplication[],
): ApplyView {
  if (isMember(group, world.me.userId)) {
    return { applyState: "MEMBER", unavailableReason: null, application: null };
  }
  const mine = pending.find((application) => application.groupId === group.groupId);
  if (group.joinPolicy === "APPROVAL" && mine !== undefined) {
    return {
      applyState: "APPLIED",
      unavailableReason: null,
      application: { applicationId: mine.applicationId, expiresAt: mine.expiresAt },
    };
  }
  if (isGroupFull(group)) {
    return { applyState: "FULL", unavailableReason: null, application: null };
  }
  let reason: GroupUnavailableReason | null = null;
  if (isRecentlyKicked(world, group.groupId, nowMs)) {
    reason = "RECENTLY_KICKED";
  } else if (slotsUsed >= GROUP_MOCK_LIMITS.maxGroupsAndApplications) {
    reason = "GROUP_SLOT_LIMIT";
  } else if (
    group.joinPolicy === "APPROVAL" &&
    pending.length >= GROUP_MOCK_LIMITS.maxPendingApplications
  ) {
    reason = "APPLICATION_LIMIT";
  }
  return reason === null
    ? { applyState: "CAN_APPLY", unavailableReason: null, application: null }
    : { applyState: "UNAVAILABLE", unavailableReason: reason, application: null };
}

/**
 * 원본에서 내가 보는 응답 만들기
 *
 * 응답마다 새 객체를 만들어서 화면 캐시가 원본을 건드리지 못한다.
 */
export function viewGroupWorld(world: GroupMockWorld, nowMs: number): GroupMockState {
  const meId = world.me.userId;
  const elapsedSec = Math.max(0, Math.floor((nowMs - world.seededAtMs) / 1000));
  // 신청한 그룹이 사라지면 서버가 그 신청을 닫으므로 남은 그룹으로 간 신청만 센다.
  const pending = world.myApplications
    .filter(
      (application) =>
        isLive(application, nowMs) &&
        world.groups.some((group) => group.groupId === application.groupId),
    )
    .sort(byAppliedAt);
  // 내 그룹 탭은 내가 들어간 순서다.
  const joined = world.groups
    .filter((group) => isMember(group, meId))
    .map((group) => ({
      group,
      joinedAtMs: Date.parse(group.members.find((member) => member.userId === meId)!.joinedAt),
    }))
    .sort((a, b) => a.joinedAtMs - b.joinedAtMs)
    .map(({ group }) => group);
  const owned = joined.filter((group) => group.ownerId === meId);
  const slotsUsed = joined.length + pending.length;
  const publicGroups = world.groups.filter((group) => group.visibility === "PUBLIC");

  return {
    mine: {
      groups: joined.map((group): MyGroupCard => ({
        groupId: group.groupId,
        name: group.name,
        joinPolicy: group.joinPolicy,
        category: group.category,
        visibility: group.visibility,
        memberCount: group.members.length,
        studyingCount: group.members.filter(isStudying).length,
        owner: group.ownerId === meId,
        newApplicationCount:
          group.ownerId === meId && group.visibility === "PUBLIC" && group.joinPolicy === "APPROVAL"
            ? liveGroupApplications(group, nowMs).length
            : null,
        members: group.members.map((member) => toDesk(group, member, elapsedSec)),
        translation: null,
      })),
      pendingApplicationCount: pending.length,
      ownedGroupCount: owned.length,
      limits: { ...GROUP_MOCK_LIMITS },
    },
    myApplications: {
      applications: pending.map((application): MyApplicationItem => {
        const group = world.groups.find((candidate) => candidate.groupId === application.groupId)!;
        return {
          applicationId: application.applicationId,
          groupId: group.groupId,
          groupName: group.name,
          category: group.category,
          appliedAt: application.appliedAt,
          expiresAt: application.expiresAt,
        };
      }),
    },
    publicGroups: publicGroups
      .map((group): PublicGroupCard => ({
        groupId: group.groupId,
        name: group.name,
        joinPolicy: group.joinPolicy,
        category: group.category,
        memberCount: group.members.length,
        weeklyAverageFocusSec: weeklyAverage(group),
        weeklyTotalFocusSec: weeklyTotal(group),
        studyingCount: group.members.filter(isStudying).length,
        member: isMember(group, meId),
        translation: null,
      }))
      .sort(byServerOrder),
    publicDetails: Object.fromEntries(
      publicGroups.map((group): [number, PublicGroupDetailResponse] => {
        const owner =
          group.members.find((member) => member.userId === group.ownerId) ?? group.members[0]!;
        return [
          group.groupId,
          {
            groupId: group.groupId,
            name: group.name,
            joinPolicy: group.joinPolicy,
            category: group.category,
            description: group.description,
            memberCount: group.members.length,
            owner: {
              userId: owner.userId,
              nickname: owner.nickname,
              profileImageUrl: owner.profileImageUrl,
            },
            weeklyAverageFocusSec: weeklyAverage(group),
            weeklyTotalFocusSec: weeklyTotal(group),
            members: group.members.map((member) => toDesk(group, member, elapsedSec)),
            translation: null,
            ...applyViewOf(world, group, nowMs, slotsUsed, pending),
          },
        ];
      }),
    ),
    homes: Object.fromEntries(
      joined.map((group): [number, GroupHomeResponse] => {
        const isOwner = group.ownerId === meId;
        return [
          group.groupId,
          {
            groupId: group.groupId,
            name: group.name,
            joinPolicy: group.joinPolicy,
            visibility: group.visibility,
            category: group.category,
            description: group.description,
            memberCount: group.members.length,
            myRole: isOwner ? "OWNER" : "MEMBER",
            notifyEnabled: group.notifyEnabled,
            newApplicationCount:
              isOwner && group.visibility === "PUBLIC" && group.joinPolicy === "APPROVAL"
                ? liveGroupApplications(group, nowMs).length
                : null,
            studyingCount: group.members.filter(isStudying).length,
            members: group.members.map((member) => toDesk(group, member, elapsedSec)),
            translation: null,
          },
        ];
      }),
    ),
    members: Object.fromEntries(
      joined.map((group): [number, GroupMembersResponse] => [
        group.groupId,
        { members: group.members.map((member) => toMemberItem(group, member)) },
      ]),
    ),
    invites: Object.fromEntries(
      joined.flatMap((group): [number, GroupInviteResponse][] =>
        group.inviteCode === null ? [] : [[group.groupId, { inviteCode: group.inviteCode }]],
      ),
    ),
    applications: Object.fromEntries(
      owned.map((group): [number, GroupApplicationsResponse] => [
        group.groupId,
        {
          remainingSeats: Math.max(0, MAX_MEMBERS - group.members.length),
          applications: liveGroupApplications(group, nowMs),
        },
      ]),
    ),
    blocks: { blockedUsers: world.blocks.map((blocked) => ({ ...blocked })) },
  };
}

interface Clock {
  ago(ms: number): string;
}

interface PersonSpec {
  userId: number;
  nickname: string;
  status?: GroupMemberStatus;
  todayFocusSec?: number;
  weekFocusSec?: number;
  /** 공부한 적이 없으면 비워 둔다. */
  lastStudiedAgoMs?: number;
}

function profile(t: Clock, spec: PersonSpec): Omit<MockMember, "joinedAt"> {
  const status = spec.status ?? "IDLE";
  return {
    userId: spec.userId,
    nickname: spec.nickname,
    profileImageUrl: null,
    status,
    accumulating: status === "IN_ROOM" || status === "STUDYING",
    todayFocusSec: spec.todayFocusSec ?? 0,
    weekFocusSec: spec.weekFocusSec ?? 0,
    lastStudiedAt: spec.lastStudiedAgoMs === undefined ? null : t.ago(spec.lastStudiedAgoMs),
  };
}

function member(t: Clock, spec: PersonSpec, joinedAgoMs: number): MockMember {
  return { ...profile(t, spec), joinedAt: t.ago(joinedAgoMs) };
}

/** 번호는 앱의 지금 사용자를 따르고 나머지는 장면마다 같다. */
function mePerson(meId: number): PersonSpec {
  return {
    userId: meId,
    nickname: "열공곰",
    todayFocusSec: 4_350,
    weekFocusSec: 45_600,
    lastStudiedAgoMs: 2 * HOUR_MS + 10 * MINUTE_MS,
  };
}

function received(
  t: Clock,
  fields: Pick<GroupApplicationItem, "applicationId" | "userId" | "nickname" | "introduction">,
  appliedAgoMs: number,
): GroupApplicationItem {
  return {
    ...fields,
    profileImageUrl: null,
    appliedAt: t.ago(appliedAgoMs),
    expiresAt: t.ago(appliedAgoMs - GROUP_MOCK_APPLICATION_TTL_MS),
  };
}

function sent(
  t: Clock,
  applicationId: number,
  groupId: number,
  appliedAgoMs: number,
): MockApplication {
  return {
    applicationId,
    groupId,
    appliedAt: t.ago(appliedAgoMs),
    expiresAt: t.ago(appliedAgoMs - GROUP_MOCK_APPLICATION_TTL_MS),
  };
}

// 내 그룹 탭은 들어간 순서라 이 그룹에 들어간 때를 다른 그룹보다 앞에 둔다.
function dawnCivilGroup(t: Clock, me: PersonSpec): MockGroup {
  return {
    groupId: 10,
    name: "새벽 5시 기상 공시반",
    visibility: "PUBLIC",
    joinPolicy: "APPROVAL",
    category: "CIVIL_SERVICE",
    description: "매일 새벽 5시에 일어나서 2시간 이상 공부해요. 9급 행정직 준비생 환영해요.",
    ownerId: me.userId,
    members: [
      member(t, me, 30 * DAY_MS),
      member(
        t,
        {
          userId: seeded(6),
          nickname: "새벽공부러",
          status: "IN_ROOM",
          todayFocusSec: 6_330,
          weekFocusSec: 98_000,
          lastStudiedAgoMs: 0,
        },
        18 * DAY_MS,
      ),
      member(
        t,
        {
          userId: seeded(7),
          nickname: "공시생J",
          status: "STUDYING",
          todayFocusSec: 10_931,
          weekFocusSec: 82_000,
          lastStudiedAgoMs: 0,
        },
        12 * DAY_MS,
      ),
      member(
        t,
        {
          userId: seeded(8),
          nickname: "포동s",
          status: "PAUSED",
          todayFocusSec: 3_000,
          weekFocusSec: 61_000,
          lastStudiedAgoMs: 20 * MINUTE_MS,
        },
        5 * DAY_MS,
      ),
    ],
    inviteCode: null,
    applications: [
      received(
        t,
        {
          applicationId: 41,
          userId: seeded(11),
          nickname: "밤샘토끼",
          introduction: "직장 다니면서 준비해요. 퇴근하고 밤에 주로 공부해요.",
        },
        DAY_MS + 3 * HOUR_MS + 30 * MINUTE_MS,
      ),
      received(
        t,
        {
          applicationId: 42,
          userId: seeded(10),
          nickname: "모카번",
          introduction: "9급 행정직 준비 중이에요. 새벽 5시에 꾸준히 나올게요.",
        },
        10 * MINUTE_MS,
      ),
    ],
    notifyEnabled: false,
  };
}

function eveningClassGroup(t: Clock, me: PersonSpec | null): MockGroup {
  return {
    groupId: 11,
    name: "우리 반 저녁 스터디",
    visibility: "PRIVATE",
    joinPolicy: "APPROVAL",
    category: "SCHOOL_EXAM",
    description: "같은 반 친구들끼리 평일 저녁 7시부터 공부해요.",
    ownerId: seeded(4),
    members: [
      member(
        t,
        {
          userId: seeded(4),
          nickname: "하린",
          weekFocusSec: 9_000,
          lastStudiedAgoMs: 20 * HOUR_MS,
        },
        40 * DAY_MS,
      ),
      member(
        t,
        {
          userId: seeded(2),
          nickname: "수빈",
          todayFocusSec: 2_700,
          weekFocusSec: 14_000,
          lastStudiedAgoMs: 2 * HOUR_MS + 10 * MINUTE_MS,
        },
        35 * DAY_MS,
      ),
      ...(me === null ? [] : [member(t, me, 20 * DAY_MS)]),
      member(
        t,
        { userId: seeded(3), nickname: "도윤", weekFocusSec: 7_200, lastStudiedAgoMs: DAY_MS },
        15 * DAY_MS,
      ),
      member(
        t,
        { userId: seeded(5), nickname: "민준", lastStudiedAgoMs: 16 * DAY_MS },
        10 * DAY_MS,
      ),
    ],
    inviteCode: "K7Q2MX",
    applications: [],
    notifyEnabled: false,
  };
}

function medSchoolGroup(t: Clock, me: PersonSpec | null): MockGroup {
  return {
    groupId: 12,
    name: "의대 가자 2027",
    visibility: "PUBLIC",
    joinPolicy: "APPROVAL",
    category: "CSAT",
    description: "의대 목표 재수생 모여요. 하루 10시간 이상 공부해요.",
    ownerId: seeded(9),
    members: [
      member(
        t,
        {
          userId: seeded(9),
          nickname: "옥수수라떼",
          status: "IN_ROOM",
          todayFocusSec: 7_805,
          weekFocusSec: 120_000,
          lastStudiedAgoMs: 0,
        },
        50 * DAY_MS,
      ),
      member(
        t,
        {
          userId: seeded(14),
          nickname: "의대가즈아",
          status: "STUDYING",
          todayFocusSec: 9_100,
          weekFocusSec: 101_000,
          lastStudiedAgoMs: 0,
        },
        41 * DAY_MS,
      ),
      member(
        t,
        {
          userId: seeded(15),
          nickname: "재수생K",
          todayFocusSec: 1_800,
          weekFocusSec: 76_000,
          lastStudiedAgoMs: 3 * HOUR_MS,
        },
        33 * DAY_MS,
      ),
      member(
        t,
        {
          userId: seeded(16),
          nickname: "수학러",
          weekFocusSec: 52_000,
          lastStudiedAgoMs: 14 * HOUR_MS,
        },
        9 * DAY_MS,
      ),
      ...(me === null ? [] : [member(t, me, 6 * DAY_MS)]),
    ],
    inviteCode: null,
    applications: [],
    notifyEnabled: false,
  };
}

function toeicWeekendGroup(t: Clock, me: PersonSpec | null): MockGroup {
  return {
    groupId: 13,
    name: "토익 900 주말반",
    visibility: "PUBLIC",
    joinPolicy: "APPROVAL",
    category: "LANGUAGE",
    description: "주말마다 모의고사를 한 회씩 풀어요.",
    ownerId: seeded(17),
    members: [
      member(
        t,
        {
          userId: seeded(17),
          nickname: "토익만점가자",
          weekFocusSec: 21_000,
          lastStudiedAgoMs: DAY_MS,
        },
        28 * DAY_MS,
      ),
      member(
        t,
        {
          userId: seeded(18),
          nickname: "리스닝요정",
          weekFocusSec: 9_000,
          lastStudiedAgoMs: 30 * HOUR_MS,
        },
        21 * DAY_MS,
      ),
      member(
        t,
        { userId: seeded(19), nickname: "주말러", lastStudiedAgoMs: 5 * DAY_MS },
        8 * DAY_MS,
      ),
      ...(me === null ? [] : [member(t, me, 3 * DAY_MS)]),
    ],
    inviteCode: null,
    applications: [],
    notifyEnabled: false,
  };
}

function pastPapersGroup(t: Clock, me: PersonSpec): MockGroup {
  return {
    groupId: 14,
    name: "우리끼리 기출 스터디",
    visibility: "PRIVATE",
    joinPolicy: "APPROVAL",
    category: "CERTIFICATE",
    description: null,
    ownerId: me.userId,
    members: [
      member(t, me, 25 * DAY_MS),
      member(
        t,
        {
          userId: seeded(20),
          nickname: "기출장인",
          weekFocusSec: 30_000,
          lastStudiedAgoMs: 5 * HOUR_MS,
        },
        24 * DAY_MS,
      ),
    ],
    inviteCode: "M4PQ7R",
    applications: [],
    notifyEnabled: false,
  };
}

/** 이름, 시험·목표, 소개, 멤버 수, 앞에서부터 지금 공부 중인 멤버 수, 이번 주 평균 시간 */
type CatalogRow = readonly [
  name: string,
  category: StudyCategory,
  description: string | null,
  memberCount: number,
  studyingCount: number,
  weeklyAverageHours: number,
];

// 공개 그룹 목록이 두 쪽이 되도록 이름 있는 공개 그룹 셋에 22개를 더해 25개를 채운다.
// 다 찬 그룹은 마지막 하나이고 서버 정렬에서 맨 뒤로 간다.
const CATALOG: readonly CatalogRow[] = [
  ["수능 D-200 밤샘반", "CSAT", "매일 밤 10시부터 새벽까지 같이 달려요.", 5, 2, 24],
  ["내신 1등급 만들기", "SCHOOL_EXAM", "시험 기간마다 같이 계획을 세워요.", 4, 1, 12],
  ["전공 기말 같이 준비해요", "UNIVERSITY_EXAM", null, 3, 0, 8],
  ["9급 국어 매일 한 회", "CIVIL_SERVICE", "국어 모의고사를 매일 풀어요.", 5, 3, 26],
  ["정보처리기사 실기반", "CERTIFICATE", "하루 2시간씩 실기를 준비해요.", 2, 1, 10],
  ["오픽 IH 목표", "LANGUAGE", null, 3, 0, 5],
  ["상반기 공채 준비", "JOB", "자소서와 인적성을 같이 준비해요.", 4, 2, 18],
  ["회계사 1차 스터디", "PROFESSIONAL", "CPA 1차 준비생 모임이에요.", 5, 2, 32],
  ["아침 6시 기상 인증", "ETC", "일어나자마자 공부를 시작해요.", 4, 1, 9],
  ["재수생 오후반", "CSAT", "오후 1시부터 저녁까지 공부해요.", 3, 1, 21],
  ["수행평가 같이 해요", "SCHOOL_EXAM", null, 2, 0, 3],
  ["공대 전공 스터디", "UNIVERSITY_EXAM", "회로이론을 같이 봐요.", 4, 1, 11],
  ["경찰 공채 필기반", "CIVIL_SERVICE", "경찰 필기 준비생 모여요.", 5, 1, 22],
  ["컴활 1급 한 달 완성", "CERTIFICATE", "한 달 안에 컴활 1급을 따요.", 3, 0, 6],
  ["JLPT N2 주말반", "LANGUAGE", null, 2, 0, 4],
  ["코딩테스트 매일 한 문제", "JOB", "매일 한 문제씩 풀어요.", 5, 2, 14],
  ["변리사 1차 새벽반", "PROFESSIONAL", "새벽 4시에 시작해요.", 3, 1, 28],
  ["퇴근 후 2시간", "ETC", "직장인끼리 퇴근하고 공부해요.", 4, 1, 7],
  ["수학 킬러 문항 정복", "CSAT", "킬러 문항만 모아서 풀어요.", 4, 2, 20],
  ["영어 회화 아침반", "LANGUAGE", null, 2, 1, 2],
  ["노무사 2차 준비", "PROFESSIONAL", "2차 답안을 같이 써 봐요.", 3, 0, 16],
  ["한국사 1급 같이 따요", "CERTIFICATE", "한국사 1급을 목표로 해요.", 6, 1, 15],
];

const CATALOG_FIRST_GROUP_ID = 20;
const CATALOG_FIRST_USER_ID = seeded(200);
const NICKNAME_HEADS = ["새벽", "밤샘", "합격", "열공", "꾸준", "아침", "주말", "오늘도"];
const NICKNAME_TAILS = [
  "토끼",
  "고양이",
  "곰돌이",
  "펭귄",
  "다람쥐",
  "여우",
  "부엉이",
  "거북이",
  "판다",
  "수달",
  "햄스터",
  "강아지",
];

/** 기본 장면에서 내보내진 지 3일이 안 된 공개 그룹이고, 신청할 수 없는 이유를 화면에서 보려고 둔다. */
const KICKED_GROUP_ID = CATALOG_FIRST_GROUP_ID;

function catalogGroups(t: Clock): MockGroup[] {
  let made = 0;
  return CATALOG.map(
    ([name, category, description, memberCount, studyingCount, weeklyAverageHours], index) => {
      const averageSec = weeklyAverageHours * 3_600;
      const middle = (memberCount - 1) / 2;
      const members = Array.from({ length: memberCount }, (_, position) => {
        const order = made;
        made += 1;
        // 평균을 두고 위아래로 고르게 벌려 그룹 평균이 정한 값과 같게 한다.
        const weekFocusSec = Math.round(
          averageSec * (1 + (0.4 * (middle - position)) / Math.max(1, memberCount - 1)),
        );
        const studying = position < studyingCount;
        const head = NICKNAME_HEADS[order % NICKNAME_HEADS.length];
        const tail = NICKNAME_TAILS[Math.floor(order / NICKNAME_HEADS.length)];
        return member(
          t,
          {
            userId: CATALOG_FIRST_USER_ID + order,
            nickname: `${head}${tail}`,
            status: studying ? (position % 2 === 0 ? "IN_ROOM" : "STUDYING") : "IDLE",
            todayFocusSec: studying ? Math.round(weekFocusSec / 5) : 0,
            weekFocusSec,
            lastStudiedAgoMs: studying ? 0 : (position + 1) * 5 * HOUR_MS,
          },
          (40 - position * 6) * DAY_MS + index * HOUR_MS,
        );
      });
      return {
        groupId: CATALOG_FIRST_GROUP_ID + index,
        name,
        visibility: "PUBLIC",
        joinPolicy: index % 3 === 2 ? "OPEN" : "APPROVAL",
        category,
        description,
        ownerId: members[0]!.userId,
        members,
        inviteCode: null,
        applications: [],
        notifyEnabled: false,
      };
    },
  );
}

function seedBlocks(t: Clock): BlockedUser[] {
  return [
    { userId: seeded(12), nickname: "새벽러", profileImageUrl: null, blockedAt: t.ago(5 * DAY_MS) },
    {
      userId: seeded(13),
      nickname: "커피두잔",
      profileImageUrl: null,
      blockedAt: t.ago(2 * DAY_MS),
    },
  ];
}

/**
 * 장면의 원본 만들기
 *
 * 시각은 모두 받은 지금에서 거꾸로 세어 언제 열어도 "2시간 전" 같은 표기가 같게 나온다.
 * 세 장면 모두 비공개 그룹 11이 있어서 `K7Q2MX`로 코드 참여를 해 볼 수 있다.
 * 나는 받은 사용자 번호로 앉혀서 실기기에서도 내 책상이 `나`로 보인다.
 */
export function seedGroupWorld(
  scene: GroupMockScene,
  nowMs: number,
  meId: number = GROUP_MOCK_DEFAULT_ME,
): GroupMockWorld {
  const t: Clock = { ago: (ms) => new Date(nowMs - ms).toISOString() };
  const person = mePerson(meId);
  const me = profile(t, person);
  switch (scene) {
    case "empty":
      return {
        me,
        groups: [eveningClassGroup(t, null)],
        myApplications: [],
        kicks: [],
        blocks: [],
        seededAtMs: nowMs,
      };
    case "limits":
      return {
        me,
        groups: [
          dawnCivilGroup(t, person),
          eveningClassGroup(t, null),
          medSchoolGroup(t, person),
          toeicWeekendGroup(t, person),
          pastPapersGroup(t, person),
          ...catalogGroups(t),
        ],
        myApplications: [sent(t, 31, CATALOG_FIRST_GROUP_ID + 1, 30 * MINUTE_MS)],
        kicks: [],
        blocks: seedBlocks(t),
        seededAtMs: nowMs,
      };
    case "default":
      return {
        me,
        groups: [
          dawnCivilGroup(t, person),
          eveningClassGroup(t, person),
          medSchoolGroup(t, null),
          toeicWeekendGroup(t, null),
          ...catalogGroups(t),
        ],
        myApplications: [sent(t, 31, 12, 30 * MINUTE_MS)],
        kicks: [{ groupId: KICKED_GROUP_ID, atMs: nowMs - DAY_MS }],
        blocks: seedBlocks(t),
        seededAtMs: nowMs,
      };
  }
}

/**
 * 장면의 견본 응답
 *
 * 그룹 라우트 테스트와 응답 변환 테스트가 서버가 줄 모양 그대로의 값으로 쓴다.
 */
export function seedGroupData(
  scene: GroupMockScene,
  nowMs: number,
  meId: number = GROUP_MOCK_DEFAULT_ME,
): GroupMockState {
  return viewGroupWorld(seedGroupWorld(scene, nowMs, meId), nowMs);
}
