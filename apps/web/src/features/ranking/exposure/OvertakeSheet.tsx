import { useRef } from "react";

import type { RankingOvertaken } from "@focusmakers/types";

import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { SheetHandle } from "@/components/ui/SheetHandle";
import { useDialogFocusRestore } from "@/lib/useDialogFocusRestore";
import { cn } from "@/lib/utils";

import { Nickname } from "../components/Nickname";
import { RankAvatar } from "../components/RankAvatar";
import { formatRank } from "../model/format";
import { closestGap, formatOvertakeGap } from "./overtakeView";

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
 * 손잡이를 끌어내리거나 바깥이나 Esc를 누르거나 화면 낭독기용 닫기 버튼을 누르면 닫히고, 모두 `onClose`로 알린다.
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
  onClose: () => void;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const focusRestore = useDialogFocusRestore();
  const nearest = overtaken.nearest.slice(0, NEAREST_LIMIT);
  const highlight = closestGap(nearest);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <SheetContent
        ref={contentRef}
        side="bottom"
        // 첫 버튼에 포커스를 주면 터치로 연 시트에 링이 남아 시트 자체로 보낸다.
        // 그러면 스크린리더는 시트 안으로 들어오고 링은 생기지 않는다(`ui/sheet.tsx`가 컨테이너 링을 끈다).
        // 닫을 때는 열기 전 요소로 돌려준다.
        onOpenAutoFocus={(event) => {
          focusRestore.onOpenAutoFocus();
          event.preventDefault();
          contentRef.current?.focus();
        }}
        onCloseAutoFocus={focusRestore.onCloseAutoFocus}
        aria-describedby={undefined}
        className="theme-soft-blue gap-0 rounded-t-[28px] border-t-0 bg-muted px-5 pt-3 pb-[max(28px,calc(env(safe-area-inset-bottom)+8px))]"
      >
        <SheetHandle
          onDismiss={onClose}
          testId="overtake-sheet-handle"
          barClassName="h-[5px] w-10 rounded-[2.5px] bg-border"
        />
        <p className="mt-4 text-[13px] leading-4 font-bold text-rank-alert">마지막 접속 이후</p>
        <SheetTitle className="mt-1 text-[26px] leading-[33px] font-extrabold tracking-[-0.5px] text-foreground">
          자리 비운 사이 <br />
          {formatRank(overtaken.count)}명이 추월했어요
        </SheetTitle>
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
        <Button
          type="button"
          size="xl"
          onClick={onStudy}
          className="mt-5 w-full rounded-lg text-[17px] leading-[21px] font-bold"
        >
          공부하러 가기
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onRanking}
          className="mt-1 h-11 w-full text-[15px] leading-[18px] font-bold text-muted-foreground hover:bg-bg-layer-2"
        >
          랭킹 보기
        </Button>
        {/* 손잡이는 가려져 있고 바깥 누르기와 Esc는 모바일 화면 낭독기로 쓰기 어렵다. */}
        {/* 남은 두 버튼은 모두 다른 화면으로 보내므로, 머문 채 닫는 버튼을 낭독기에만 둔다. */}
        <SheetClose className="sr-only">닫기</SheetClose>
      </SheetContent>
    </Sheet>
  );
}
