import { Crown } from "lucide-react";

import { cn } from "@/lib/utils";

import { memberName } from "../memberName";
import { type DeskMember, type DeskTone, arrangeDesks, liveSeconds } from "../model/desks";
import type { RoomVisibility } from "../model/roomMenu";
import { formatClock, lastStudiedText } from "../model/timeText";
import type { RoomDeskMember } from "../types";
import { DeskFigure } from "./DeskFigure";

/** 범례도 이 말을 써서 책상 색과 읽어 주는 말이 어긋나지 않는다. */
const TONE_TEXT: Record<DeskTone, string> = {
  room: "공부방에 있어요",
  elsewhere: "다른 곳에서 공부 중",
  rest: "쉬는 중",
};

const EMPTY_SEAT_TEXT = "빈자리";
const OPEN_SEAT_TEXT = "신청을 받고 있어요";

/**
 * 멤버 책상 여섯 자리와 범례
 *
 * 색만으로 상태를 알리지 않도록 칸마다 닉네임, 상태 말, 시간을 이름으로 묶어 한 번에 읽힌다.
 * 보이는 글자는 그 이름과 겹쳐 두 번 읽히지 않게 화면 낭독기에서 뺀다.
 */
export function DeskGrid({
  members,
  visibility,
  elapsedSec,
  now,
}: {
  members: readonly RoomDeskMember[];
  visibility: RoomVisibility;
  elapsedSec: number;
  now: Date;
}) {
  // 판단 모듈이 순서를 정하며 멤버를 공통 모양으로 돌려주므로 내 자리는 아이디로 다시 찾는다.
  const myUserId = members.find((member) => member.isMe)?.userId;
  return (
    <div>
      <ul aria-label="멤버 책상" className="grid grid-cols-3 gap-x-1.5 gap-y-3 pt-1">
        {arrangeDesks(members).map((slot, index) =>
          slot.kind === "empty" ? (
            <EmptyDesk key={`empty-${index}`} open={visibility === "public"} />
          ) : (
            <MemberDesk
              key={slot.member.userId}
              member={slot.member}
              tone={slot.tone}
              isMe={slot.member.userId === myUserId}
              elapsedSec={elapsedSec}
              now={now}
            />
          ),
        )}
      </ul>
      {/* 책상마다 상태 말을 읽어 주므로 색 설명인 범례는 화면 낭독기에서 뺀다. */}
      <div
        aria-hidden="true"
        className="mt-2.5 flex items-center justify-center gap-4 border-t border-border pt-2.5 text-[11px] leading-4 text-muted-foreground"
      >
        <span className="flex items-center gap-1.25">
          <span className="size-2 rounded-full bg-primary" />
          {TONE_TEXT.room}
        </span>
        <span className="flex items-center gap-1.25">
          <span className="size-2 rounded-full bg-feedback-success" />
          {TONE_TEXT.elsewhere}
        </span>
      </div>
    </div>
  );
}

function MemberDesk({
  member,
  tone,
  isMe,
  elapsedSec,
  now,
}: {
  member: DeskMember;
  tone: DeskTone;
  isMe: boolean;
  elapsedSec: number;
  now: Date;
}) {
  const name = memberName({ nickname: member.nickname, isMe });
  const clock = formatClock(liveSeconds(member.todayStudySec, member.accumulating, elapsedSec));
  // 공부하는 멤버는 지금 공부하고 있으니 마지막으로 공부한 때는 쉬는 멤버에게만 붙인다.
  const lastStudied = tone === "rest" ? lastStudiedText(member.lastStudiedAt, now) : null;
  const label = [name, member.isOwner ? "그룹장" : null, TONE_TEXT[tone], clock, lastStudied]
    .filter((part) => part !== null)
    .join(", ");
  return (
    <li aria-label={label} data-tone={tone} className="flex min-w-0 flex-col items-center">
      <DeskFigure tone={tone} size="md" />
      <div
        aria-hidden="true"
        className="mt-1 flex w-full min-w-0 flex-col items-center gap-0.5 text-center"
      >
        <p className="flex max-w-full items-center gap-0.75">
          {member.isOwner && (
            <Crown
              size={12}
              strokeWidth={2.2}
              className="shrink-0 fill-brand-subtle text-primary"
            />
          )}
          <span className="truncate text-xs leading-4 font-semibold text-foreground">{name}</span>
        </p>
        <p
          className={cn(
            "text-[13px] leading-4.5 font-bold tabular-nums",
            tone === "rest" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {clock}
        </p>
        {lastStudied !== null && (
          <p className="text-[10px] leading-3.5 text-muted-foreground">{lastStudied}</p>
        )}
      </div>
    </li>
  );
}

function EmptyDesk({ open }: { open: boolean }) {
  return (
    <li
      aria-label={open ? `${EMPTY_SEAT_TEXT}, ${OPEN_SEAT_TEXT}` : EMPTY_SEAT_TEXT}
      data-tone="empty"
      className="flex min-w-0 flex-col items-center"
    >
      <DeskFigure tone="empty" size="md" />
      <div
        aria-hidden="true"
        className="mt-1 flex flex-col items-center gap-0.5 text-center text-state-pause"
      >
        <p className="text-xs leading-4">{EMPTY_SEAT_TEXT}</p>
        {open && <p className="text-[10px] leading-3.5">{OPEN_SEAT_TEXT}</p>}
      </div>
    </li>
  );
}
