import { useEffect, useState } from "react";

import { Skeleton } from "@/components/ui/Skeleton";
import { dayTitleWithWeekday, formatDuration } from "@/features/records/recordsFormat";
import { trackHomeTotalTimeRevealed } from "@/lib/amplitude";
import { hasTokenSource } from "@/lib/userId";

import { DdaySection } from "./DdaySection";

/** 순공을 눌러 총 공부를 보여 주는 시간. */
const TOTAL_REVEAL_MS = 3000;

/**
 * 홈 헤더
 *
 * 왼쪽에 고른 날짜, 오른쪽에 D-Day와 그날 순공을 둔다.
 * D-Day API는 토큰 명세뿐이라 토큰 출처가 없는 문서에서는 D-Day를 그리지 않는다.
 * 시간은 플래너와 같은 05시 기준 하루의 합계다.
 */
export function HomeHeader({
  userId,
  dateKey,
  focusSec,
  studySec,
}: {
  userId: number;
  dateKey: string;
  focusSec: number | null;
  studySec: number | null;
}) {
  return (
    <header className="flex items-start justify-between gap-3 pb-1">
      <h1 className="pt-1 text-[22px] leading-7.5 font-bold text-foreground">
        {dayTitleWithWeekday(dateKey)}
      </h1>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {hasTokenSource() && <DdaySection userId={userId} dateKey={dateKey} />}
        {focusSec === null || studySec === null ? (
          <Skeleton data-testid="home-total-pending" className="h-5 w-24 rounded-sm" />
        ) : (
          // 날짜를 바꾸면 총 공부를 보던 중이어도 새 날짜의 순공부터 보인다.
          <FocusTotalToggle key={dateKey} focusSec={focusSec} studySec={studySec} />
        )}
      </div>
    </header>
  );
}

/**
 * 순공과 총 공부를 오가는 버튼
 *
 * 누르면 총 공부를 보이고 다시 누르지 않으면 3초 뒤 순공으로 돌아온다.
 * 총 공부가 보이는 동안 다시 누르면 바로 돌아온다.
 */
function FocusTotalToggle({ focusSec, studySec }: { focusSec: number; studySec: number }) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) {
      return;
    }
    const timer = setTimeout(() => setRevealed(false), TOTAL_REVEAL_MS);
    return () => clearTimeout(timer);
  }, [revealed]);

  return (
    <button
      type="button"
      onClick={() => {
        if (!revealed) {
          trackHomeTotalTimeRevealed();
        }
        setRevealed(!revealed);
      }}
      // 글자는 작아도 누르는 자리는 44px이다.
      className="relative before:absolute before:-inset-x-2 before:-inset-y-3"
    >
      <span aria-live="polite" className="flex items-baseline gap-1">
        <span className="text-xs leading-4 text-muted-foreground">
          {revealed ? "총 공부" : "순공"}
        </span>{" "}
        <span className="text-[15px] leading-5 font-bold text-foreground tabular-nums">
          {formatDuration(revealed ? studySec : focusSec)}
        </span>
      </span>
    </button>
  );
}
