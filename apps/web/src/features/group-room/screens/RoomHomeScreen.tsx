import { Bell, BellOff, ChevronRight } from "lucide-react";

import { ScreenBackHeader } from "@/components/ScreenBackHeader";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BOTTOM_CTA_BAR_CLASS, BOTTOM_CTA_CLASS } from "../bottomCta";
import { RoomMenu } from "../components/RoomMenu";
import { RoomMeta } from "../components/RoomMeta";
import { TodayDesksCard } from "../components/TodayDesksCard";
import { WeeklyRankCard } from "../components/WeeklyRankCard";
import { otherMemberCount, type RoomMenuItem, roomMenuItems } from "../model/roomMenu";
import type { RoomHome } from "../types";
import { useElapsedSec } from "../useElapsedSec";

/**
 * 그룹 홈
 *
 * 오늘 멤버 책상과 이번 주 순위를 보고 공부방에 들어가는 화면이다.
 * 새 신청 띠는 신청을 받는 공개 그룹 그룹장에게 새 신청이 있을 때만 둔다.
 * 책상이나 순위에 순공이 쌓이는 사람이 있을 때만 1초마다 다시 그린다.
 * 아래 버튼 위에는 안내 글을 두지 않는다.
 */
export function RoomHomeScreen({
  room,
  now,
  fetchedAtMs,
  defaultMenuOpen = false,
  onBack,
  onToggleNotify,
  onMenuSelect,
  onOpenRequests,
  onEnterStudyRoom,
  entering = false,
}: {
  room: RoomHome;
  now: Date;
  fetchedAtMs: number;
  /** 개발용 화면 모음에서 그룹 메뉴가 열린 모습을 바로 보려고 쓴다. */
  defaultMenuOpen?: boolean;
  onBack: () => void;
  onToggleNotify: () => void;
  onMenuSelect: (kind: RoomMenuItem["kind"]) => void;
  onOpenRequests: () => void;
  onEnterStudyRoom: () => void;
  /** 자리를 잡는 동안 다시 눌러 자리를 두 번 잡지 않게 막는다. */
  entering?: boolean;
}) {
  const elapsedSec = useElapsedSec(
    fetchedAtMs,
    room.members.some((member) => member.accumulating) ||
      room.weeklyRanks.some((row) => row.accumulating),
  );
  const menuItems = roomMenuItems({
    role: room.role,
    visibility: room.visibility,
    newRequestCount: room.newRequestCount,
    otherMemberCount: otherMemberCount(room.memberCount),
  });
  const showNewRequests =
    room.role === "owner" && room.visibility === "public" && room.newRequestCount > 0;
  return (
    <main className="theme-soft-blue bg-soft-blue page-column flex min-h-dvh flex-col text-foreground">
      <ScreenBackHeader
        title={room.name}
        onBack={onBack}
        trailing={
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="멤버 공부 알림"
              aria-pressed={room.notifyOn}
              onClick={onToggleNotify}
              className="flex size-11 items-center justify-center rounded-full text-muted-foreground focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
            >
              {room.notifyOn ? (
                <Bell aria-hidden="true" size={22} className="fill-current text-primary" />
              ) : (
                <BellOff aria-hidden="true" size={22} />
              )}
            </button>
            <RoomMenu items={menuItems} onSelect={onMenuSelect} defaultOpen={defaultMenuOpen} />
          </div>
        }
      />
      <div className="flex flex-col gap-3 px-5">
        <div className="pt-0.5">
          <RoomMeta
            visibility={room.visibility}
            categoryLabel={room.categoryLabel}
            memberCount={room.memberCount}
          />
        </div>
        {showNewRequests && (
          <NewRequestsBand count={room.newRequestCount} onOpen={onOpenRequests} />
        )}
        <TodayDesksCard
          title="오늘 우리 그룹"
          members={room.members}
          visibility={room.visibility}
          elapsedSec={elapsedSec}
          now={now}
        />
        <WeeklyRankCard rows={room.weeklyRanks} elapsedSec={elapsedSec} />
      </div>
      <div className={BOTTOM_CTA_BAR_CLASS}>
        <Button
          size="xl"
          onClick={onEnterStudyRoom}
          disabled={entering}
          className={cn(BOTTOM_CTA_CLASS, "shadow-sb-cta")}
        >
          공부방 들어가기
        </Button>
      </div>
    </main>
  );
}

function NewRequestsBand({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mt-0.5 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg bg-brand-subtle px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-(--state-focus) focus-visible:outline-none"
    >
      <span className="text-sm leading-5 font-bold text-brand-subtle-text">
        {`새 신청이 ${count}건 있어요`}
      </span>
      <span className="flex shrink-0 items-center gap-0.5 text-[13px] leading-5 font-bold text-primary">
        확인하기
        <ChevronRight aria-hidden="true" size={14} />
      </span>
    </button>
  );
}
