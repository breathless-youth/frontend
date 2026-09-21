import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { toKoreanDurationLength } from "../formatDuration";
import { RESULT_COPY, studyDaysLabel } from "../resultCopy";
import type { SummaryValueState } from "../useResultSummary";
import { useResultSummary } from "../useResultSummary";

/**
 * 누적 요약 카드(BY-560 시안 스크린샷, 2026-09-14) — 옛 비집중 통계 카드(`DistractionStatsCard`)를
 * 대체한다. 두 행: `오늘 누적 순공시간`(강조색) · `누적 공부 일 수`.
 *
 * 값은 서버 조회(`useResultSummary`)에서 온다 — S4가 처음으로 API를 읽는 지점이다. 세션 자체는
 * 여전히 라우터 state로만 받고, 여기서 읽는 것은 이미 저장된 통계뿐이다. 조회 중·실패는 숫자
 * 대신 `—`를 두고 재시도 버튼을 만들지 않는다(장식에 가까운 부가 정보라 실패 처리로 화면을
 * 무겁게 하지 않는다 — 실패해도 세션 결과는 이미 위에 다 있다).
 *
 * `userId`가 없는 브라우저 단독(미저장) 모드에서는 호출부가 카드를 그리지 않는다 — 저장되지
 * 않은 세션의 "누적"은 성립하지 않는다.
 */
export function SessionSummaryCard({ userId }: { userId: number }) {
  const summary = useResultSummary(userId);

  return (
    <Card>
      <CardContent>
        <SummaryRow
          label={RESULT_COPY.todayFocusLabel}
          state={summary.todayFocusSec}
          format={toKoreanDurationLength}
          accent
        />
        <Separator />
        <SummaryRow
          label={RESULT_COPY.studyDaysLabel}
          state={summary.studyDays}
          format={studyDaysLabel}
        />
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  state,
  format,
  accent = false,
}: {
  label: string;
  state: SummaryValueState;
  format: (value: number) => string;
  accent?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 py-[18px]"
      aria-busy={state.status === "pending" || undefined}
    >
      <span className="text-[15px] leading-[18px] break-keep text-muted-foreground">{label}</span>
      <span
        className={cn(
          "shrink-0 text-[22px] leading-[26px] font-bold tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {state.status === "success" ? format(state.value) : RESULT_COPY.summaryUnavailable}
      </span>
    </div>
  );
}
