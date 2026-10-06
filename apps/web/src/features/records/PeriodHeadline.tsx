import { Skeleton } from "@/components/ui/Skeleton";

import { durationParts, formatDuration } from "./recordsFormat";

/**
 * 기록 탭 머리 — 그 탭이 보는 기간의 순공시간과 총 공부시간. 일간·주간이 같은 꼴을 쓴다.
 *
 * 순공시간은 숫자를 크게, 단위를 작게 적는다. 일간은 달력에서 고른 날(달을 옮겨도 그대로라 값은
 * 선택일 조회에서 온다), 주간은 보는 주다. 조회 중이면 자리표시, 실패하면 `—`를 그린다
 * (재시도는 아래 오류 화면이 맡는다).
 */
export function PeriodHeadline({
  label,
  totals,
}: {
  /** `오늘 순공시간` · `M월 D일 순공시간` · `주간 순공시간`. */
  label: string;
  /** 그 기간의 순공·총 공부(초). 조회 중이면 `"pending"`, 실패면 `"error"`. */
  totals: { focusSec: number; studySec: number } | "pending" | "error";
}) {
  return (
    <div className="flex flex-col items-center gap-1 pt-2">
      <p className="text-[13px] leading-4 text-muted-foreground">{label}</p>
      {totals === "pending" ? (
        <>
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-4 w-24 rounded-md" />
        </>
      ) : (
        <>
          <p className="flex items-baseline gap-2 pr-1 text-foreground tabular-nums">
            {totals === "error" ? (
              <span className="text-[32px] leading-9 font-extrabold">—</span>
            ) : (
              durationParts(totals.focusSec).map((part, index) => (
                <span key={part.unit} className="flex items-baseline gap-0.5">
                  {/* 화면 낭독·검색이 `3시간 33분`으로 읽히게 부분 사이에 공백을 둔다(flex라 그려지지는 않는다). */}
                  {index > 0 ? " " : ""}
                  <span className="text-[32px] leading-9 font-extrabold tracking-[-0.9px]">
                    {part.value}
                  </span>
                  <span className="text-[17px] leading-5 font-bold">{part.unit}</span>
                </span>
              ))
            )}
          </p>
          <p className="text-[13px] leading-4 text-muted-foreground tabular-nums">
            총 {totals === "error" ? "—" : formatDuration(totals.studySec)}
          </p>
        </>
      )}
    </div>
  );
}
