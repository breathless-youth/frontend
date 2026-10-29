import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { DdayResponse } from "@focusmakers/types";

import { Skeleton } from "@/components/ui/Skeleton";
import { dateOfDateKey } from "@/features/records/recordsFormat";
import { setDdayUserProperties, trackDdaySheetOpened } from "@/lib/amplitude";
import { ddayQuery } from "@/lib/ddayQueries";
import { lazyWithPreload } from "@/lib/lazyWithPreload";
import { cn } from "@/lib/utils";
import { whenIdle } from "@/lib/whenIdle";

import { daysUntil, formatDday } from "./ddayFormat";

/**
 * 설정 시트는 시트 부품(Base UI)·달력과 함께 따로 받는다.
 * 홈은 첫 번들에 들어가므로 화면이 뜬 뒤 한가할 때 미리 받아 둔다.
 */
const { LazySheet: LazyDdaySheet, preload: preloadDdaySheet } = lazyWithPreload(() =>
  import("./DdaySheet").then((module) => module.DdaySheet),
);

/**
 * 홈 헤더 오른쪽 D-Day 블록과 설정 시트.
 *
 * 블록 자체가 시트의 트리거다.
 * 설정된 D-Day가 있으면 `D-N`만 크게 보이고 제목은 버튼 이름에 싣는다.
 * 없으면 같은 자리에 `D-Day 설정`이 온다.
 * 어느 쪽이든 탭하면 시트 하나가 열린다.
 * 시트 모양은 Claude Design `D-Day Prototype`이 원본이다.
 * 지난 D-Day는 지우지 않고 `D+N`을 다른 색으로 보여 준다.
 * 홈에서 지난 날짜를 고르면 일수는 그 날짜 기준이고, user property는 늘 오늘 기준이다.
 *
 * 조회 실패는 미설정처럼 그린다. 저장은 upsert라 그 상태에서 저장해도 서버 값이 덮이고, 응답으로
 * 캐시가 다시 채워져 스스로 복구된다. 홈 통계의 오류 상태와 달리 이 블록에는 재시도 버튼이 없다.
 */
export function DdaySection({ userId, dateKey }: { userId: number; dateKey: string }) {
  const query = useQuery(ddayQuery(userId));
  const [open, setOpen] = useState(false);
  // 열 때마다 1씩 올라 폼을 새로 만든다. `open`을 key로 쓰면 닫히는 순간 폼이 리셋돼 300ms 닫힘
  // 애니메이션 동안 방금 저장한 내용이 빈 폼으로 바뀌는 게 보인다.
  const [openCount, setOpenCount] = useState(0);

  const dday = query.data ?? null;
  const loaded = query.data !== undefined || query.isError;
  const targetDate = dday?.targetDate ?? null;

  useEffect(() => {
    whenIdle(preloadDdaySheet);
  }, []);

  // D-Day 유무별 세그먼트용 user property. 이 effect 한 곳에서만 보낸다 — 저장·삭제도 캐시가 바뀌면
  // 여기로 흘러오므로 뮤테이션 콜백에서 따로 부르면 identify가 두 번 나간다.
  useEffect(() => {
    if (!loaded) {
      return;
    }
    setDdayUserProperties(targetDate === null ? null : { daysLeft: daysUntil(targetDate) });
  }, [loaded, targetDate]);

  function handleOpenChange(next: boolean) {
    if (next) {
      trackDdaySheetOpened(dday !== null);
      setOpenCount((count) => count + 1);
    }
    setOpen(next);
  }

  if (!loaded) {
    return <Skeleton className="h-7.5 w-16 rounded-lg" />;
  }

  return (
    <>
      <DdayBlock
        dday={dday}
        daysLeft={dday === null ? null : daysUntil(dday.targetDate, dateOfDateKey(dateKey))}
        expanded={open}
        onOpen={() => handleOpenChange(true)}
      />
      <LazyDdaySheet
        open={open}
        onOpenChange={handleOpenChange}
        userId={userId}
        dday={dday}
        formKey={openCount}
      />
    </>
  );
}

/** 누르면 설정 시트를 여는 헤더 오른쪽 블록. */
function DdayBlock({
  dday,
  daysLeft,
  expanded,
  onOpen,
}: {
  dday: DdayResponse | null;
  daysLeft: number | null;
  expanded: boolean;
  onOpen: () => void;
}) {
  const label = daysLeft === null ? "D-Day 설정" : formatDday(daysLeft);
  return (
    <button
      type="button"
      aria-label={dday === null ? "D-Day 설정" : `${label} ${dday.title}, D-Day 수정`}
      // 시트를 나눠 받아 시트 부품의 트리거를 쓸 수 없다. 트리거가 달던 팝업 표시를 직접 단다.
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onOpen}
      // 글자는 작아도 누르는 자리는 44px이다.
      className="relative text-right before:absolute before:-inset-x-2 before:-inset-y-2"
    >
      <span
        data-testid="dday-label"
        className={cn(
          "font-extrabold tabular-nums",
          daysLeft === null
            ? "text-lg leading-7.5 text-primary"
            : "text-[24px] leading-7.5 tracking-[-0.5px]",
          // 지난 D-Day는 색으로 구분한다.
          // 시안 색이 정해지면 여기만 바꾼다.
          daysLeft !== null && (daysLeft < 0 ? "text-muted-foreground" : "text-primary"),
        )}
      >
        {label}
      </span>
    </button>
  );
}
