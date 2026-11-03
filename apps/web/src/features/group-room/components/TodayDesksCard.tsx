import { useId } from "react";

import { cn } from "@/lib/utils";

import { roomStatusText } from "../model/desks";
import type { RoomVisibility } from "../model/roomMenu";
import type { RoomDeskMember } from "../types";
import { DeskGrid } from "./DeskGrid";

/**
 * 오늘 멤버 책상 카드
 *
 * 공개 그룹 보기와 그룹 홈이 같은 책상과 범례를 쓰고 제목만 다르다.
 * 제목 옆 공부 중인 사람 수는 책상이 바로 아래에 있어 점을 붙이지 않는다.
 */
export function TodayDesksCard({
  title,
  members,
  visibility,
  elapsedSec,
  now,
  className,
}: {
  title: string;
  members: readonly RoomDeskMember[];
  visibility: RoomVisibility;
  elapsedSec: number;
  now: Date;
  className?: string;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-2.5 rounded-xl bg-muted px-3.5 pt-3.5 pb-4 shadow-sb-card",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 px-0.5">
        <h2 id={titleId} className="text-[15px] leading-5.5 font-bold text-foreground">
          {title}
        </h2>
        <p className="shrink-0 text-[13px] leading-5 text-foreground">{roomStatusText(members)}</p>
      </div>
      <DeskGrid members={members} visibility={visibility} elapsedSec={elapsedSec} now={now} />
    </section>
  );
}
