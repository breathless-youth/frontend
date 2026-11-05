import { Crown } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { type DeskMember, type DeskTone, arrangeDesks, liveSeconds } from "../model/desks";
import type { RoomVisibility } from "../model/roomMenu";
import { formatClock } from "../model/timeText";
import type { RoomDeskMember } from "../types";
import { DeskFigure } from "./DeskFigure";

/** 범례도 이 말을 써서 책상 색과 읽어 주는 말이 어긋나지 않는다. */
const TONE_TEXT_KEY = {
  room: "deskGrid.tone.room",
  elsewhere: "deskGrid.tone.elsewhere",
  rest: "deskGrid.tone.rest",
} as const satisfies Record<DeskTone, string>;

/**
 * 멤버 책상 여섯 자리와 범례
 *
 * 색만으로 상태를 알리지 않도록 칸마다 닉네임, 상태 말, 시간을 이름으로 묶어 한 번에 읽힌다.
 * 보이는 글자는 그 이름과 겹쳐 두 번 읽히지 않게 화면 낭독기에서 뺀다.
 * 마지막으로 공부한 때는 오래 오지 않은 멤버를 찾는 멤버 화면에서만 보이고 책상에는 붙이지 않는다.
 */
export function DeskGrid({
  members,
  visibility,
  elapsedSec,
  hideEmptySeatCopy = false,
}: {
  members: readonly RoomDeskMember[];
  visibility: RoomVisibility;
  elapsedSec: number;
  hideEmptySeatCopy?: boolean;
}) {
  const { t } = useTranslation("group-room");
  // 판단 모듈이 순서를 정하며 멤버를 공통 모양으로 돌려주므로 내 자리는 아이디로 다시 찾는다.
  const myUserId = members.find((member) => member.isMe)?.userId;
  return (
    <div>
      <ul aria-label={t("deskGrid.aria.list")} className="grid grid-cols-3 gap-x-1.5 gap-y-3 pt-1">
        {arrangeDesks(members).map((slot, index) =>
          slot.kind === "empty" ? (
            <EmptyDesk
              key={`empty-${index}`}
              open={visibility === "public"}
              hideCopy={hideEmptySeatCopy}
            />
          ) : (
            <MemberDesk
              key={slot.member.userId}
              member={slot.member}
              tone={slot.tone}
              isMe={slot.member.userId === myUserId}
              elapsedSec={elapsedSec}
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
          {t(TONE_TEXT_KEY.room)}
        </span>
        <span className="flex items-center gap-1.25">
          <span className="size-2 rounded-full bg-feedback-success" />
          {t(TONE_TEXT_KEY.elsewhere)}
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
}: {
  member: DeskMember;
  tone: DeskTone;
  isMe: boolean;
  elapsedSec: number;
}) {
  const { t } = useTranslation("group-room");
  const name = member.nickname;
  const clock = formatClock(liveSeconds(member.todayStudySec, member.accumulating, elapsedSec));
  const label = [
    name,
    member.isOwner ? t("deskGrid.aria.owner") : null,
    t(TONE_TEXT_KEY[tone]),
    clock,
  ]
    .filter((part) => part !== null)
    .join(", ");
  return (
    <li
      aria-label={label}
      // Sentry 클릭 기록은 닉네임이 든 aria-label 대신 이 이름을 적는다.
      data-sentry-element="MemberDesk"
      data-tone={tone}
      data-me={isMe || undefined}
      className="flex min-w-0 flex-col items-center"
    >
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
          <span
            className={cn(
              "truncate text-xs leading-4",
              // 상태를 뜻하는 책상 색은 그대로 두고 닉네임 글자로만 내 자리를 알린다.
              isMe ? "font-bold text-primary" : "font-semibold text-foreground",
            )}
          >
            {name}
          </span>
        </p>
        <p
          className={cn(
            "text-[13px] leading-4.5 font-bold tabular-nums",
            tone === "rest" ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {clock}
        </p>
      </div>
    </li>
  );
}

function EmptyDesk({ open, hideCopy }: { open: boolean; hideCopy: boolean }) {
  const { t } = useTranslation("group-room");
  const emptySeat = t("deskGrid.emptySeat");
  const openSeat = t("deskGrid.openSeat");
  return (
    <li
      aria-hidden={hideCopy || undefined}
      aria-label={hideCopy ? undefined : open ? `${emptySeat}, ${openSeat}` : emptySeat}
      data-tone="empty"
      className="flex min-w-0 flex-col items-center"
    >
      <DeskFigure tone="empty" size="md" />
      <div
        aria-hidden="true"
        className="mt-1 flex flex-col items-center gap-0.5 text-center text-state-pause"
      >
        {!hideCopy && <p className="text-xs leading-4">{emptySeat}</p>}
        {!hideCopy && open && <p className="text-[10px] leading-3.5">{openSeat}</p>}
      </div>
    </li>
  );
}
