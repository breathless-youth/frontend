import type { RankingOvertaken } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { RankingOvertakeCloseMethod } from "@/lib/amplitude";
import { cn } from "@/lib/utils";

import { Nickname } from "../components/Nickname";
import { RankAvatar } from "../components/RankAvatar";
import { formatRank } from "../model/format";
import { closestGap, formatOvertakeGap, overtakeCloseMethod } from "./overtakeView";

/**
 * 시트에 보이는 가까운 사람 수
 *
 * 서버도 2명까지만 준다.
 */
const NEAREST_LIMIT = 2;

/**
 * 추월 바텀시트
 *
 * 자리를 비운 사이 이번 주 순공 순위가 내려갔을 때 홈에서 한 번 띄운다.
 * 끌어내리거나 바깥·Esc·Android 뒤로 가기·화면 낭독기용 닫기 버튼으로 닫히고, 모두 닫은 방법과 함께 `onClose`로 알린다.
 * 시트는 body로 포털되므로 Soft Blue 테마를 시트에 직접 단다.
 */
export function OvertakeSheet({
  overtaken,
  open,
  onStudy,
  onRanking,
  onClose,
}: {
  overtaken: RankingOvertaken;
  open: boolean;
  onStudy: () => void;
  onRanking: () => void;
  onClose: (closeMethod: RankingOvertakeCloseMethod | undefined) => void;
}) {
  const nearest = overtaken.nearest.slice(0, NEAREST_LIMIT);
  const highlight = closestGap(nearest);

  return (
    <Drawer
      open={open}
      onOpenChange={(next, details) => {
        if (!next) {
          onClose(overtakeCloseMethod(details.reason));
        }
      }}
    >
      <DrawerContent className="theme-soft-blue">
        <p className="mt-4 text-[13px] leading-4 font-bold text-rank-alert">마지막 접속 이후</p>
        <DrawerTitle className="mt-1 text-[26px] leading-[33px] font-extrabold tracking-[-0.5px] text-foreground">
          자리 비운 사이 <br />
          {formatRank(overtaken.count)}명이 추월했어요
        </DrawerTitle>
        <p className="mt-2 text-sm leading-[17px] text-muted-foreground">
          주간 순공{" "}
          <strong className="font-bold text-foreground tabular-nums">
            {formatRank(overtaken.fromRank)}위 → {formatRank(overtaken.toRank)}위
          </strong>
        </p>
        {nearest.length > 0 && (
          <ul className="mt-5 rounded-lg bg-bg-layer-2 px-4">
            {nearest.map((person, index) => {
              const closest = person.gap === highlight;
              return (
                <li
                  key={person.nickname}
                  className={cn(
                    "flex min-h-16 items-center gap-3",
                    index > 0 && "border-t border-border",
                  )}
                >
                  <RankAvatar nickname={person.nickname} />
                  <Nickname
                    name={person.nickname}
                    className="flex-1 text-[15px] leading-[18px] font-bold text-foreground"
                  />
                  <span
                    data-closest={closest || undefined}
                    className={cn(
                      "shrink-0 text-base leading-5 font-extrabold tabular-nums",
                      closest ? "text-rank-value" : "text-foreground",
                    )}
                  >
                    {formatOvertakeGap(person.gap)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {/* 시트 안 버튼은 끌기에서 뺀다. iOS에서 살짝 움직인 탭이 끌기로 잡혀 버려진다(`RecordsSheet`와 같은 처리). */}
        <Button
          data-base-ui-swipe-ignore=""
          type="button"
          size="xl"
          onClick={onStudy}
          className="mt-5 w-full rounded-lg text-[17px] leading-[21px] font-bold"
        >
          공부하러 가기
        </Button>
        <Button
          data-base-ui-swipe-ignore=""
          type="button"
          variant="ghost"
          onClick={onRanking}
          className="mt-1 h-11 w-full text-[15px] leading-[18px] font-bold text-muted-foreground hover:bg-bg-layer-2"
        >
          랭킹 보기
        </Button>
        {/* 손잡이는 가려져 있고 바깥 누르기와 Esc는 모바일 화면 낭독기로 쓰기 어렵다. */}
        {/* 남은 두 버튼은 모두 다른 화면으로 보내므로, 머문 채 닫는 버튼을 낭독기에만 둔다. */}
        <DrawerClose className="sr-only">닫기</DrawerClose>
      </DrawerContent>
    </Drawer>
  );
}
