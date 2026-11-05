import { GROUP_ROOM_LIMITS } from "./model/limits";
import type {
  ApplicationRequest,
  BlockedUser,
  CategoryOption,
  MyRoomSummary,
  PendingApplication,
  PublicRoomDetail,
  PublicRoomSummary,
  RoomDeskMember,
  RoomFormValues,
  RoomHome,
  RoomMemberRow,
  WeeklyRankRow,
} from "./types";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const APPLICATION_TTL_MS = GROUP_ROOM_LIMITS.applicationTtlDays * DAY_MS;

/** 서버의 카테고리 값은 Swagger가 나온 뒤에 넣으므로 지금은 화면 글자를 값으로 쓴다. */
const CATEGORY_LABELS = [
  "수능",
  "내신",
  "대학 시험",
  "공무원",
  "자격증",
  "어학",
  "취업",
  "전문직",
  "기타",
];

const ME = { userId: 1, nickname: "열공곰" } as const;

function desk(
  fields: Pick<RoomDeskMember, "userId" | "nickname" | "presence"> & Partial<RoomDeskMember>,
): RoomDeskMember {
  return {
    isOwner: false,
    isMe: false,
    todayStudySec: 0,
    lastStudiedAt: null,
    accumulating: false,
    ...fields,
  };
}

/**
 * 개발용 화면 모음과 화면 테스트가 함께 쓰는 고정 데이터
 *
 * 이름과 숫자는 시안을 따르고, 상대 시간 표기가 시안과 같게 나오도록 시각은 받은 지금에서 거꾸로 센다.
 * 시간 단위 경계에서 몇 분씩 떨어뜨려 그리는 순간이 조금 늦어도 표기가 바뀌지 않는다.
 * 같은 사람이 여러 그룹에 나오면 앱 전체 오늘 순공은 같은 값을 쓴다.
 */
export function buildGroupRoomFixtures(now: Date) {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const later = (ms: number) => new Date(now.getTime() + ms).toISOString();
  // 신청은 보낸 때부터 정해진 날수가 지나면 취소되므로 만료 시각을 보낸 시각에서 센다.
  const sentAgo = (ms: number) => ({
    appliedAt: ago(ms),
    expiresAt: later(APPLICATION_TTL_MS - ms),
  });

  const categories: CategoryOption[] = CATEGORY_LABELS.map((label) => ({ value: label, label }));

  const meDesk = desk({
    ...ME,
    isMe: true,
    presence: "away",
    todayStudySec: 4_350,
    lastStudiedAt: ago(2 * HOUR_MS + 10 * MINUTE_MS),
  });

  // 그룹 홈 시안이 새 신청을 받는 그룹장의 화면이라 이 공개 그룹은 내가 그룹장이다.
  const nightOwlDesks: RoomDeskMember[] = [
    desk({
      userId: 2,
      nickname: "새벽러",
      presence: "this_room",
      todayStudySec: 11_560,
      accumulating: true,
    }),
    desk({
      userId: 3,
      nickname: "합격까지",
      presence: "this_room",
      todayStudySec: 10_025,
      accumulating: true,
    }),
    desk({
      userId: 4,
      nickname: "고구마맛탕",
      presence: "studying_elsewhere",
      todayStudySec: 7_100,
      accumulating: true,
    }),
    { ...meDesk, isOwner: true },
    desk({ userId: 5, nickname: "연필깎이", presence: "away", lastStudiedAt: ago(DAY_MS) }),
  ];

  // 멤버 관리 시안이 비공개 그룹 그룹장의 화면이고 내 그룹 카드 시안에서 이 그룹은 아무도 공부하지 않아 모두 쉬는 멤버로 둔다.
  // 쉬는 책상은 오늘 순공이 많은 순이라 시안처럼 내가 맨 앞에 오도록 수빈의 순공을 내 순공보다 적게 둔다.
  const eveningClassDesks: RoomDeskMember[] = [
    // 멤버 관리 시안이 내 마지막으로 온 날을 오늘로 그려 이 그룹에서만 그 시각을 바꾼다.
    { ...meDesk, isOwner: true, lastStudiedAt: ago(20 * MINUTE_MS) },
    desk({
      userId: 6,
      nickname: "수빈",
      presence: "away",
      todayStudySec: 2_700,
      lastStudiedAt: ago(2 * HOUR_MS + 10 * MINUTE_MS),
    }),
    desk({ userId: 7, nickname: "도윤", presence: "away", lastStudiedAt: ago(DAY_MS) }),
    desk({ userId: 8, nickname: "하린", presence: "away", lastStudiedAt: ago(3 * DAY_MS) }),
    desk({ userId: 9, nickname: "민준", presence: "away", lastStudiedAt: ago(16 * DAY_MS) }),
  ];
  // 멤버 목록의 마지막으로 온 날은 그룹 홈 책상과 같은 값이라 같은 그룹 책상에서 만든다.
  const members: RoomMemberRow[] = eveningClassDesks.map(
    ({ userId, nickname, isOwner, isMe, lastStudiedAt }) => ({
      userId,
      nickname,
      imageUrl: null,
      isOwner,
      isMe,
      lastStudiedAt,
    }),
  );

  const cornLatte = desk({
    userId: 10,
    nickname: "옥수수라떼",
    isOwner: true,
    presence: "this_room",
    todayStudySec: 7_805,
    accumulating: true,
  });
  const podong = desk({
    userId: 11,
    nickname: "포동s",
    presence: "away",
    lastStudiedAt: ago(DAY_MS),
  });

  // 옥수수라떼가 이 그룹 공부방에 있어서 새벽 5시 기상 공시반에서는 다른 곳에서 공부 중으로 보인다.
  const morningRollDesks: RoomDeskMember[] = [
    cornLatte,
    meDesk,
    podong,
    desk({
      userId: 12,
      nickname: "커피두잔",
      presence: "away",
      lastStudiedAt: ago(3 * HOUR_MS + 10 * MINUTE_MS),
    }),
  ];

  const dawnCivilDesks: RoomDeskMember[] = [
    { ...cornLatte, presence: "studying_elsewhere" },
    desk({
      userId: 13,
      nickname: "새벽공부러",
      presence: "this_room",
      todayStudySec: 6_330,
      accumulating: true,
    }),
    desk({
      userId: 14,
      nickname: "공시생J",
      presence: "away",
      todayStudySec: 10_931,
      lastStudiedAt: ago(HOUR_MS + 20 * MINUTE_MS),
    }),
    podong,
  ];

  const myRooms: MyRoomSummary[] = [
    {
      roomId: 1,
      name: "수능 D-200 밤샘반",
      categoryLabel: "수능",
      visibility: "public",
      memberCount: 5,
      newRequestCount: 0,
      members: nightOwlDesks,
    },
    {
      roomId: 2,
      name: "우리 반 저녁 스터디",
      categoryLabel: "내신",
      visibility: "private",
      memberCount: 5,
      newRequestCount: 0,
      members: eveningClassDesks,
    },
    {
      roomId: 3,
      name: "공시 아침 7시 출석",
      categoryLabel: "공무원",
      visibility: "public",
      memberCount: 4,
      newRequestCount: 0,
      members: morningRollDesks,
    },
  ];

  const pending: PendingApplication[] = [
    {
      applicationId: 31,
      roomId: 7,
      roomName: "새벽 5시 기상 공시반",
      categoryLabel: "공무원",
      expiresAt: sentAgo(30 * MINUTE_MS).expiresAt,
    },
  ];

  // 목록 화면은 순서를 바꾸지 않고 서버가 준 대로 그리므로 서버처럼 활발한 순으로 두고 자리가 다 찬 그룹을 맨 뒤에 둔다.
  const publicRooms: PublicRoomSummary[] = [
    {
      roomId: 7,
      name: "새벽 5시 기상 공시반",
      categoryLabel: "공무원",
      memberCount: 4,
      weeklyAverageSec: 76_200,
      studyingCount: 2,
      member: false,
    },
    {
      roomId: 8,
      name: "의대 가자 2027",
      categoryLabel: "수능",
      memberCount: 5,
      weeklyAverageSec: 68_520,
      studyingCount: 3,
      member: false,
    },
    {
      roomId: 9,
      name: "토익 900 주말반",
      categoryLabel: "어학",
      memberCount: 3,
      weeklyAverageSec: 34_800,
      studyingCount: 0,
      member: false,
    },
    {
      roomId: 10,
      name: "한국사 1급 같이 따요",
      categoryLabel: "자격증",
      memberCount: 6,
      weeklyAverageSec: 54_300,
      studyingCount: 1,
      member: false,
    },
  ];

  const publicDetail: PublicRoomDetail = {
    roomId: 7,
    name: "새벽 5시 기상 공시반",
    categoryLabel: "공무원",
    memberCount: 4,
    intro:
      "매일 새벽 5시에 일어나서 2시간 이상 공부해요. 9급 행정직 준비생 환영해요. 아침마다 공부방에 들어와 카메라를 켜고, 오전 7시 전까지 각자 정한 과목을 끝내요. 주말에는 편할 때 들어와도 괜찮아요. 일주일에 3일 이상 나오기가 우리 그룹 약속이에요. 오래 안 나오면 그룹장이 자리를 정리할 수 있어요. 같이 꾸준히 해서 올해 꼭 붙어요.",
    ownerNickname: "옥수수라떼",
    ownerImageUrl: null,
    weeklyAverageSec: 76_200,
    members: dawnCivilDesks,
  };

  const requests: ApplicationRequest[] = [
    {
      applicationId: 41,
      nickname: "모카번",
      imageUrl: null,
      ...sentAgo(10 * MINUTE_MS),
      message: "9급 행정직 준비 중이에요. 새벽 5시에 꾸준히 나올게요.",
    },
    {
      applicationId: 42,
      nickname: "밤샘토끼",
      imageUrl: null,
      ...sentAgo(DAY_MS + 3 * HOUR_MS + 30 * MINUTE_MS),
      message: "직장 다니면서 준비해요. 퇴근하고 밤에 주로 공부해요.",
    },
  ];

  const weeklyRanks: WeeklyRankRow[] = [
    {
      userId: 2,
      rank: 1,
      nickname: "새벽러",
      imageUrl: null,
      weeklyStudySec: 78_010,
      accumulating: true,
      isMe: false,
    },
    {
      userId: 3,
      rank: 2,
      nickname: "합격까지",
      imageUrl: null,
      weeklyStudySec: 64_953,
      accumulating: true,
      isMe: false,
    },
    {
      ...ME,
      rank: 3,
      imageUrl: null,
      weeklyStudySec: 45_600,
      accumulating: false,
      isMe: true,
    },
    {
      userId: 4,
      rank: 4,
      nickname: "고구마맛탕",
      imageUrl: null,
      weeklyStudySec: 33_320,
      accumulating: true,
      isMe: false,
    },
    {
      userId: 5,
      rank: 5,
      nickname: "연필깎이",
      imageUrl: null,
      weeklyStudySec: 14_531,
      accumulating: false,
      isMe: false,
    },
  ];

  const roomHome: RoomHome = {
    roomId: 1,
    name: "수능 D-200 밤샘반",
    categoryLabel: "수능",
    visibility: "public",
    role: "owner",
    memberCount: 5,
    intro: "매일 밤 10시부터 새벽까지 같이 달려요. 수능 D-200부터 끝까지 함께해요.",
    members: nightOwlDesks,
    weeklyRanks,
    newRequestCount: 2,
    notifyOn: false,
  };

  // 그룹 만들기와 그룹 설정 시안이 모두 이 그룹을 채운 모습이라 그룹 홈의 값을 쓰고, 카테고리 값은 화면 글자와 같다.
  const roomForm: RoomFormValues = {
    name: roomHome.name,
    visibility: roomHome.visibility,
    category: roomHome.categoryLabel,
    intro: roomHome.intro,
  };

  const blocked: BlockedUser[] = [
    { userId: 2, nickname: "새벽러", imageUrl: null },
    { userId: 12, nickname: "커피두잔", imageUrl: null },
  ];

  return {
    categories,
    myRooms,
    pending,
    publicRooms,
    publicDetail,
    requests,
    roomHome,
    roomHomeQuiet: { ...roomHome, newRequestCount: 0 },
    roomForm,
    members,
    blocked,
    // 그룹 이름 한도 20자와 닉네임 한도 12자를 넓은 한글로 채워 카드와 줄이 밀리는지 본다.
    longest: {
      roomName: "수능만점을향해달리는새벽다섯시기상스터디",
      nickname: "합격할때까지밤새는수험생",
    },
  };
}
