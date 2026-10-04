import { Skeleton } from "@/components/ui/Skeleton";

import { formatDuration } from "./recordsFormat";

/**
 * 일간 탭 머리 — 달력에서 고른 날의 순공시간과 총 공부시간.
 *
 * 달을 옮겨도 고른 날은 그대로라, 값은 보이는 달의 기간 집계가 아니라 선택일 조회에서 온다.
 * 조회 중이면 자리표시, 실패하면 `—`를 그린다(재시도는 아래 세션 목록 자리의 오류 화면이 맡는다).
 */
export function DayHeadline({
  label,
  totals,
}: {
  /** `오늘 순공시간` 또는 `M월 D일 순공시간`. */
  label: string;
  /** 선택일의 순공·총 공부(초). 조회 중이면 `"pending"`, 실패면 `"error"`. */
  totals: { focusSec: number; studySec: number } | "pending" | "error";
}) {
  return (
    <div className="flex flex-col items-center gap-1 pt-3">
      <p className="text-[12.5px] leading-4 text-muted-foreground">{label}</p>
      {totals === "pending" ? (
        <>
          <Skeleton className="h-[38px] w-36 rounded-lg" />
          <Skeleton className="h-[17px] w-28 rounded-md" />
        </>
      ) : (
        <>
          <p className="text-[30px] leading-[38px] font-extrabold tracking-[-0.9px] text-foreground tabular-nums">
            {totals === "error" ? "—" : formatDuration(totals.focusSec)}
          </p>
          <p className="text-[13px] leading-[17px] font-medium text-muted-foreground">
            총 공부시간{" "}
            <span className="font-bold text-foreground tabular-nums">
              {totals === "error" ? "—" : formatDuration(totals.studySec)}
            </span>
          </p>
        </>
      )}
    </div>
  );
}
