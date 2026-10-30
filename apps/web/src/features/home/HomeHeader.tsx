import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/Skeleton";
import { dayTitleWithWeekday, formatDuration } from "@/features/records/recordsFormat";
import { hasTokenSource } from "@/lib/userId";

import { DdaySection, DdayTitle } from "./DdaySection";

/**
 * 홈 헤더
 *
 * 시간은 플래너와 같은 05시 기준 하루의 합계다.
 * D-Day API는 토큰 명세뿐이라 토큰 출처가 없는 문서에서는 D-Day를 그리지 않는다.
 * 둘째 줄 오른쪽에는 D-Day 제목을 둔다.
 * 탭은 헤더 아래 끝에 붙어 아래 본문과 이어지도록 헤더가 받아 맨 아래에 둔다.
 * 날짜와 시간 줄만 좌우 여백을 두고, 탭은 본문처럼 화면 끝까지 닿는다.
 */
export function HomeHeader({
  userId,
  dateKey,
  focusSec,
  studySec,
  tabs,
}: {
  userId: number;
  dateKey: string;
  focusSec: number | null;
  studySec: number | null;
  tabs?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-0.5">
      <div className="flex items-start justify-between gap-3 px-5">
        <h1 className="pt-1 text-[22px] leading-7.5 font-bold text-foreground">
          {dayTitleWithWeekday(dateKey)}
        </h1>
        {hasTokenSource() && (
          <div className="shrink-0">
            <DdaySection userId={userId} dateKey={dateKey} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-5 text-[13px] leading-5 text-muted-foreground">
        {focusSec === null || studySec === null ? (
          <Skeleton data-testid="home-total-pending" className="h-5 w-40 rounded-sm" />
        ) : (
          <p className="shrink-0">
            순공{" "}
            <span className="font-bold text-foreground tabular-nums">
              {formatDuration(focusSec)}
            </span>
            {" · "}총{" "}
            <span className="font-bold text-foreground tabular-nums">
              {formatDuration(studySec)}
            </span>
          </p>
        )}
        {hasTokenSource() && <DdayTitle userId={userId} />}
      </div>
      {tabs}
    </header>
  );
}
