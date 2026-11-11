import { type ComponentType, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DeskFigure } from "@/features/group-room/components/DeskFigure";
import { LazyPendingApplicationsSheet } from "@/features/group-room/components/lazyPendingApplicationsSheet";
import { buildGroupRoomFixtures } from "@/features/group-room/fixtures";
import { joinPolicyText } from "@/features/group-room/model/joinPolicy";
import type { RoomJoinPolicy } from "@/features/group-room/model/joinPolicy";
import { joinBlockCopy, myRoomsTabCount } from "@/features/group-room/model/limits";
import {
  type ConfirmDialogCopy,
  inviteCodeRenewedCopy,
  kickMemberDialog,
  leaveRoomDialog,
  otherMemberCount,
  transferOwnerDialog,
} from "@/features/group-room/model/roomMenu";
import { ApplyScreen } from "@/features/group-room/screens/ApplyScreen";
import { BlockListScreen } from "@/features/group-room/screens/BlockListScreen";
import { InviteCodeEntryScreen } from "@/features/group-room/screens/InviteCodeEntryScreen";
import { MembersScreen } from "@/features/group-room/screens/MembersScreen";
import { PublicRoomDetailScreen } from "@/features/group-room/screens/PublicRoomDetailScreen";
import { ReportApplicationScreen } from "@/features/group-room/screens/ReportApplicationScreen";
import { ReportMemberScreen } from "@/features/group-room/screens/ReportMemberScreen";
import { RequestsScreen } from "@/features/group-room/screens/RequestsScreen";
import { RoomFormScreen } from "@/features/group-room/screens/RoomFormScreen";
import { RoomHomeScreen } from "@/features/group-room/screens/RoomHomeScreen";
import { SocialHomeScreen } from "@/features/group-room/screens/SocialHomeScreen";
import type {
  ApplyState,
  MyRoomSummary,
  PendingApplication,
  PublicRoomSummary,
  RoomHome,
  RoomMemberRow,
  SocialTab,
} from "@/features/group-room/types";
import { SessionConfirmDialog } from "@/features/study-session/components/SessionConfirmDialog";
import { sessionSurfaceStyle } from "@/features/study-session/sessionTheme";
import { showToast } from "@/lib/toast";

/** 자정 무렵에 열어도 `2시간 전` 같은 표기가 `어제`로 바뀌지 않게 모든 화면이 한국 시간 오전 10시를 지금으로 쓴다. */
const GALLERY_NOW = new Date("2026-11-02T10:00:00+09:00");
const fixtures = buildGroupRoomFixtures(GALLERY_NOW);

const INVITE_CODE = "K7Q2M9";
const RENEWED_INVITE_CODE = "R4W8XN";
const KICKED_NICKNAME = "민준";

function noop() {}

// 번역 안내 줄을 고정 데이터로 보려고 서버가 영어로 번역해 보낸 모습을 흉내 낸다.
const TRANSLATED_NAMES: Record<number, string> = {
  7: "5 a.m. Civil Service Club",
  8: "Med School 2027",
  10: "Korean History Level 1 Together",
};
const translatedPublicRooms = fixtures.publicRooms.map((room) => ({
  ...room,
  translatedName: TRANSLATED_NAMES[room.roomId] ?? null,
}));
const TRANSLATED_DETAIL = {
  translatedName: "5 a.m. Civil Service Club",
  translatedIntro:
    "We wake up at 5 a.m. every day and study for at least two hours. Grade 9 administrative exam takers are welcome.",
};

type CaseProps = { onBack: () => void };

function SocialHomeCase({
  initialTab = "mine",
  rooms = fixtures.myRooms,
  pending = fixtures.pending,
  publicRooms = fixtures.publicRooms,
  initialCategory = null,
  canCreate = true,
  fabOpen = false,
  sheetOpen = false,
}: {
  initialTab?: SocialTab;
  rooms?: MyRoomSummary[];
  pending?: PendingApplication[];
  publicRooms?: PublicRoomSummary[];
  initialCategory?: string | null;
  canCreate?: boolean;
  fabOpen?: boolean;
  sheetOpen?: boolean;
}) {
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [open, setOpen] = useState(sheetOpen);
  // 서버가 맡는 거르기를 모음 안에서 흉내 내어 칩과 검색어로 빈 상태까지 볼 수 있게 한다.
  const visibleRooms = publicRooms.filter(
    (room) =>
      (category === null || room.categoryLabel === category) && room.name.includes(query.trim()),
  );
  return (
    <SocialHomeScreen
      tab={tab}
      onTabChange={setTab}
      myCountText={myRoomsTabCount(rooms.length, pending.length)}
      mine={{
        rooms,
        pendingCount: pending.length,
        onOpenRoom: noop,
        onOpenRequests: noop,
        onOpenPending: () => setOpen(true),
        onBrowsePublic: () => setTab("public"),
      }}
      publicRooms={{
        query,
        onQueryChange: setQuery,
        categories: fixtures.categories,
        category,
        onCategoryChange: setCategory,
        rooms: visibleRooms,
        onOpenRoom: noop,
      }}
      fab={{ canCreate, onCreate: noop, onJoinWithCode: noop, defaultOpen: fabOpen }}
      pendingSheet={
        <LazyPendingApplicationsSheet
          open={open}
          onOpenChange={setOpen}
          applications={pending}
          now={GALLERY_NOW}
          cancelingId={null}
          onCancel={noop}
          onOpenRoom={noop}
        />
      }
    />
  );
}

function RoomHomeCase({
  room,
  defaultMenuOpen = false,
  leaveOpen = false,
  onBack,
}: CaseProps & { room: RoomHome; defaultMenuOpen?: boolean; leaveOpen?: boolean }) {
  const [fetchedAtMs] = useState(() => Date.now());
  const [notifyOn, setNotifyOn] = useState(room.notifyOn);
  const [leaving, setLeaving] = useState(leaveOpen);
  const leaveCopy = leaveRoomDialog({
    role: room.role,
    visibility: room.visibility,
    otherMemberCount: otherMemberCount(room.memberCount),
  }).copy;
  return (
    <>
      <RoomHomeScreen
        room={{ ...room, notifyOn }}
        fetchedAtMs={fetchedAtMs}
        defaultMenuOpen={defaultMenuOpen}
        onBack={onBack}
        onToggleNotify={() => setNotifyOn((on) => !on)}
        onMenuSelect={(kind) => {
          if (kind === "leave") {
            setLeaving(true);
          }
        }}
        onOpenRequests={noop}
        onEnterStudyRoom={noop}
        onInvite={noop}
      />
      {leaving && <LightDialog copy={leaveCopy} onClose={() => setLeaving(false)} />}
    </>
  );
}

function LightDialog({ copy, onClose }: { copy: ConfirmDialogCopy; onClose: () => void }) {
  return <ConfirmDialog open {...copy} onCancel={onClose} onConfirm={onClose} />;
}

function MembersCase({
  members = fixtures.members,
  memberCount = 5,
  code = INVITE_CODE,
  openMenuFor,
  initialDialog = null,
  onBack,
}: CaseProps & {
  members?: RoomMemberRow[];
  memberCount?: number;
  code?: string;
  openMenuFor?: number;
  initialDialog?: ConfirmDialogCopy | null;
}) {
  const [dialog, setDialog] = useState(initialDialog);
  const nicknameOf = (userId: number) =>
    members.find((member) => member.userId === userId)?.nickname ?? "";
  return (
    <>
      <MembersScreen
        mode="manage"
        roomName="우리 반 저녁 스터디"
        visibility="private"
        memberCount={memberCount}
        members={members}
        invite={{ code, canRegenerate: true, onShareLink: noop, onRegenerate: noop }}
        now={GALLERY_NOW}
        defaultMenuUserId={openMenuFor}
        onBack={onBack}
        onTransfer={(userId) => setDialog(transferOwnerDialog(nicknameOf(userId)))}
        onKick={(userId) => setDialog(kickMemberDialog(nicknameOf(userId)))}
      />
      {dialog !== null && <LightDialog copy={dialog} onClose={() => setDialog(null)} />}
    </>
  );
}

/**
 * 내보낸 직후의 멤버 관리
 *
 * 비공개 그룹에서 내보내면 서버가 초대코드를 새로 만들어서 새 코드와 줄어든 멤버로 그리고 토스트를 띄운다.
 */
function KickCodeChangedCase({ onBack }: CaseProps) {
  useEffect(() => {
    showToast(inviteCodeRenewedCopy());
  }, []);
  const members = fixtures.members.filter((member) => member.nickname !== KICKED_NICKNAME);
  return (
    <MembersCase
      members={members}
      memberCount={members.length}
      code={RENEWED_INVITE_CODE}
      onBack={onBack}
    />
  );
}

/**
 * 공부방에서 멤버를 내보내는 확인 창
 *
 * 세션 확인 창의 색은 세션 화면 루트에만 있는 변수라 같은 변수를 단 어두운 바탕 안에 창을 띄운다.
 */
function KickInSessionCase() {
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(true);
  const copy = kickMemberDialog("새벽러");
  return (
    <main
      ref={setSurface}
      style={sessionSurfaceStyle}
      className="theme-dark min-h-dvh bg-(--session-simple-base)"
    >
      {surface !== null && (
        <SessionConfirmDialog
          open={open}
          container={surface}
          title={copy.title}
          description={copy.description}
          cancelLabel={copy.cancelLabel}
          confirmLabel={copy.confirmLabel}
          confirmTone="danger"
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      )}
    </main>
  );
}

function PublicDetailCase({
  initialState,
  onBack,
  joinPolicy = "approval",
  translated = false,
}: CaseProps & { initialState: ApplyState; joinPolicy?: RoomJoinPolicy; translated?: boolean }) {
  const [fetchedAtMs] = useState(() => Date.now());
  const [applyState, setApplyState] = useState(initialState);
  return (
    <PublicRoomDetailScreen
      room={{
        ...fixtures.publicDetail,
        joinPolicy,
        ...(translated ? TRANSLATED_DETAIL : {}),
      }}
      applyState={applyState}
      fetchedAtMs={fetchedAtMs}
      pending={false}
      onBack={onBack}
      onApply={() => (joinPolicy === "open" ? onBack() : setApplyState({ kind: "applied" }))}
      onCancelApplication={() => setApplyState({ kind: "can_apply" })}
    />
  );
}

function ApplyCase({ onBack }: CaseProps) {
  const [value, setValue] = useState("");
  return (
    <ApplyScreen
      roomName={fixtures.publicDetail.name}
      ownerNickname={fixtures.publicDetail.ownerNickname}
      value={value}
      onChange={setValue}
      pending={false}
      onSubmit={noop}
      onBack={onBack}
    />
  );
}

function ReportApplicationCase({ onBack }: CaseProps) {
  const [value, setValue] = useState("");
  return (
    <ReportApplicationScreen
      nickname={fixtures.requests[0].nickname}
      value={value}
      onChange={setValue}
      pending={false}
      onSubmit={noop}
      onBack={onBack}
    />
  );
}

function ReportMemberCase({ onBack }: CaseProps) {
  const [value, setValue] = useState("");
  return (
    <ReportMemberScreen
      nickname="새벽러"
      value={value}
      onChange={setValue}
      pending={false}
      onSubmit={noop}
      onBack={onBack}
    />
  );
}

function RequestsCase({ onBack }: CaseProps) {
  return (
    <RequestsScreen
      roomName={fixtures.publicDetail.name}
      remainingSeats={2}
      requests={fixtures.requests}
      now={GALLERY_NOW}
      busyId={null}
      onBack={onBack}
      onAccept={noop}
      onReject={noop}
      onReport={noop}
    />
  );
}

function RoomFormCase({ mode, onBack }: CaseProps & { mode: "create" | "edit" }) {
  return (
    <RoomFormScreen
      mode={mode}
      categories={fixtures.categories}
      initial={fixtures.roomForm}
      newRequestCount={fixtures.roomHome.newRequestCount}
      pending={false}
      onBack={onBack}
      onSubmit={noop}
    />
  );
}

function BlockListCase({ onBack }: CaseProps) {
  const [users, setUsers] = useState(fixtures.blocked);
  return (
    <BlockListScreen
      users={users}
      unblockingId={null}
      onBack={onBack}
      onUnblock={(userId) =>
        setUsers((current) => current.filter((user) => user.userId !== userId))
      }
    />
  );
}

function CodeEntryCase({
  initialValue = "",
  initialError = null,
  onBack,
}: CaseProps & { initialValue?: string; initialError?: string | null }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState(initialError);
  return (
    <InviteCodeEntryScreen
      value={value}
      onChange={(code) => {
        setValue(code);
        setError(null);
      }}
      error={error}
      pending={false}
      onSubmit={noop}
      onBack={onBack}
    />
  );
}

// 그룹 이름 한도와 닉네임 한도를 꽉 채운 이름이 카드의 공개 표시와 멤버 수를 밀어내는지 본다.
const longestMyRooms: MyRoomSummary[] = fixtures.myRooms.map((room, index) =>
  index === 0
    ? {
        ...room,
        name: fixtures.longest.roomName,
        members: room.members.map((member, memberIndex) =>
          memberIndex === 0 ? { ...member, nickname: fixtures.longest.nickname } : member,
        ),
      }
    : room,
);
const longestPublicRooms: PublicRoomSummary[] = fixtures.publicRooms.map((room, index) =>
  index === 0 ? { ...room, name: fixtures.longest.roomName } : room,
);

const soloOwnerHome: RoomHome = {
  ...fixtures.roomHomeQuiet,
  memberCount: 1,
  members: fixtures.roomHome.members.filter((member) => member.isMe),
  weeklyRanks: fixtures.roomHome.weeklyRanks
    .filter((row) => row.isMe)
    .map((row) => ({ ...row, rank: 1 })),
};

const minjunId = fixtures.members.find((member) => member.nickname === KICKED_NICKNAME)?.userId;

function DeskMascotsCase({ onBack }: CaseProps) {
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col gap-4 px-5 pt-[calc(env(safe-area-inset-top)+24px)] text-foreground">
      <button type="button" onClick={onBack} className="min-h-11 self-start text-sm font-bold">
        목록
      </button>
      <h1 className="text-lg font-bold">마스코트가 앉은 책상</h1>
      <ul className="grid grid-cols-3 gap-4">
        {(["room", "elsewhere", "rest"] as const).map((tone) => (
          <li key={tone} className="flex flex-col items-center gap-1 text-xs">
            <DeskFigure tone={tone} size="md" mascot="lamp" />
            {tone}
          </li>
        ))}
        <li className="flex flex-col items-center gap-1 text-xs">
          <DeskFigure tone="room" size="md" />
          마스코트 없음
        </li>
      </ul>
    </main>
  );
}

const CASES: { id: string; title: string; Screen: ComponentType<CaseProps> }[] = [
  { id: "desk-mascots", title: "마스코트가 앉은 책상", Screen: DeskMascotsCase },
  {
    id: "open-detail",
    title: joinPolicyText("open"),
    Screen: (props) => (
      <PublicDetailCase initialState={{ kind: "can_apply" }} joinPolicy="open" {...props} />
    ),
  },
  {
    id: "open-home",
    title: joinPolicyText("open"),
    Screen: (props) => (
      <RoomHomeCase room={{ ...fixtures.roomHome, joinPolicy: "open" }} {...props} />
    ),
  },
  { id: "1-1", title: "내 그룹 탭", Screen: () => <SocialHomeCase /> },
  {
    id: "1-2",
    title: "그룹 홈",
    Screen: (props) => <RoomHomeCase room={fixtures.roomHome} {...props} />,
  },
  { id: "1-5", title: "공부방 신고", Screen: ReportMemberCase },
  {
    id: "1-6",
    title: "그룹 홈 새 신청 없음",
    Screen: (props) => <RoomHomeCase room={fixtures.roomHomeQuiet} {...props} />,
  },
  {
    id: "1-7",
    title: "내 그룹이 없을 때",
    Screen: () => <SocialHomeCase rooms={[]} pending={[]} />,
  },
  { id: "1-14", title: "+ 메뉴 열림", Screen: () => <SocialHomeCase fabOpen /> },
  { id: "1-15", title: "신청 중인 공개 그룹 시트", Screen: () => <SocialHomeCase sheetOpen /> },
  {
    id: "1-16",
    title: "그룹과 신청이 합쳐 5개일 때 + 메뉴",
    Screen: () => <SocialHomeCase canCreate={false} fabOpen />,
  },
  { id: "2-1", title: "공개 그룹 탭", Screen: () => <SocialHomeCase initialTab="public" /> },
  {
    id: "2-2",
    title: "수능만 보기",
    Screen: () => <SocialHomeCase initialTab="public" initialCategory="수능" />,
  },
  {
    id: "2-3",
    title: "공개 그룹 보기",
    Screen: (props) => <PublicDetailCase initialState={{ kind: "can_apply" }} {...props} />,
  },
  { id: "2-4", title: "신청하기", Screen: ApplyCase },
  { id: "2-5", title: "신청 확인", Screen: RequestsCase },
  { id: "2-6", title: "신청 신고", Screen: ReportApplicationCase },
  {
    id: "2-7",
    title: "공개 그룹이 하나도 없을 때",
    Screen: () => <SocialHomeCase initialTab="public" publicRooms={[]} />,
  },
  {
    id: "2-8",
    title: "조건에 맞는 공개 그룹이 없을 때",
    Screen: () => <SocialHomeCase initialTab="public" initialCategory="전문직" />,
  },
  {
    id: "2-9",
    title: "신청할 수 없을 때",
    Screen: (props) => (
      <PublicDetailCase
        initialState={{ kind: "blocked", reason: "pending_applications_full" }}
        {...props}
      />
    ),
  },
  { id: "3-1", title: "그룹 만들기", Screen: (props) => <RoomFormCase mode="create" {...props} /> },
  {
    id: "3-2",
    title: "멤버 관리",
    Screen: (props) => <MembersCase openMenuFor={minjunId} {...props} />,
  },
  {
    id: "3-3",
    title: "그룹 홈 메뉴",
    Screen: (props) => <RoomHomeCase room={fixtures.roomHome} defaultMenuOpen {...props} />,
  },
  { id: "3-4", title: "그룹 설정", Screen: (props) => <RoomFormCase mode="edit" {...props} /> },
  { id: "3-5", title: "차단 목록", Screen: BlockListCase },
  {
    id: "4-1",
    title: "그룹장 넘기기",
    Screen: (props) => <MembersCase initialDialog={transferOwnerDialog("수빈")} {...props} />,
  },
  {
    id: "4-2",
    title: "멤버 관리에서 내보내기",
    Screen: (props) => <MembersCase initialDialog={kickMemberDialog(KICKED_NICKNAME)} {...props} />,
  },
  { id: "4-3", title: "공부방에서 내보내기", Screen: KickInSessionCase },
  {
    id: "4-4",
    title: "다른 멤버가 있는 그룹장이 나가기",
    Screen: (props) => <RoomHomeCase room={fixtures.roomHomeQuiet} leaveOpen {...props} />,
  },
  {
    id: "4-5",
    title: "멤버가 공개 그룹에서 나가기",
    Screen: (props) => (
      <RoomHomeCase room={{ ...fixtures.roomHome, role: "member" }} leaveOpen {...props} />
    ),
  },
  {
    id: "4-6",
    title: "혼자 남은 그룹장이 나가기",
    Screen: (props) => <RoomHomeCase room={soloOwnerHome} leaveOpen {...props} />,
  },
  { id: "4-7", title: "내보낸 뒤 멤버 관리", Screen: KickCodeChangedCase },
  { id: "code", title: "6자리 초대코드", Screen: CodeEntryCase },
  {
    id: "code-error",
    title: "초대코드 참여 오류",
    Screen: (props) => (
      <CodeEntryCase
        initialValue={INVITE_CODE}
        initialError={joinBlockCopy("room_full")}
        {...props}
      />
    ),
  },
  {
    id: "2-10",
    title: "번역된 공개 그룹 탭",
    Screen: () => <SocialHomeCase initialTab="public" publicRooms={translatedPublicRooms} />,
  },
  {
    id: "2-11",
    title: "번역된 공개 그룹 보기",
    Screen: (props) => (
      <PublicDetailCase initialState={{ kind: "can_apply" }} translated {...props} />
    ),
  },
  {
    id: "longest",
    title: "가장 긴 이름의 내 그룹과 공개 그룹",
    Screen: () => <SocialHomeCase rooms={longestMyRooms} publicRooms={longestPublicRooms} />,
  },
];

/**
 * 개발 빌드 전용 그룹 화면 모음
 *
 * 그룹 화면을 서버와 이동 없이 고정 데이터로 한 장씩 열어 시안과 견준다.
 * 입력이 있는 화면은 모음 안에서 값을 들고, 누르는 동작은 아무 일도 하지 않거나 모음 안 상태만 바꾼다.
 * 머리 줄의 뒤로 가기는 모음 목록으로 돌아간다.
 */
export function DevGroupRoomsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = CASES.find((item) => item.id === searchParams.get("screen"));
  if (selected !== undefined) {
    return <selected.Screen onBack={() => setSearchParams({})} />;
  }
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col px-5 pt-[calc(env(safe-area-inset-top)+24px)] pb-[calc(env(safe-area-inset-bottom)+24px)] text-foreground">
      <h1 className="text-[24px] leading-7.5 font-bold">그룹 화면 모음</h1>
      <ul className="mt-4 flex flex-col">
        {CASES.map((item) => (
          <li key={item.id}>
            <Link
              to={`?screen=${item.id}`}
              className="flex min-h-11 items-center gap-3 border-b border-border text-[15px] leading-5.5 text-foreground"
            >
              <span className="w-20 shrink-0 font-bold tabular-nums">{item.id}</span>
              {` ${item.title}`}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
