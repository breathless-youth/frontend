import { MONDAY_FIRST_WEEKDAY_LABELS } from "./recordsFormat";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

/**
 * 예시 히트맵의 농도(0~5) — 실데이터가 아니라 "이런 화면이 나온다"를 보여 주는 그림이다.
 * 한 줄이 한 요일(월~일), 한 글자가 한 시간(5시부터 다음 날 4시까지)이다.
 */
const SAMPLE_ROWS = [
  "023443322222245543200000",
  "023444333332234443200000",
  "023443333322233432100000",
  "023454433333234442100000",
  "022344433332234543200000",
  "012333333332234442100000",
  "012233222222223332100000",
] as const;

const LEVEL_CLASS = [
  "bg-chart-empty",
  "bg-chart-heat-1",
  "bg-chart-heat-2",
  "bg-chart-heat-3",
  "bg-chart-heat-4",
  "bg-chart-heat-5",
] as const;

/** 가로축 눈금 — 하루를 5시에서 시작해 다음 날 4시에서 끝낸다(플래너와 같은 기준). */
const X_TICKS = [5, 11, 17, 23, 4] as const;

/**
 * 나의 공부 리듬 — 예상 화면
 *
 * 실데이터는 이번 범위가 아니다(후속 집중 리포트). 요일 × 시간 히트맵 예시를 살짝 흐리게 보여 주고
 * 위에 샘플이라는 안내를 적어, 기록이 쌓이면 무엇을 보게 되는지 미리 보여 준다. 예시는 장식이라
 * 읽어 주지 않는다.
 */
export function RhythmCard() {
  return (
    <section aria-labelledby="rhythm-title">
      <div className="flex items-center justify-between pt-7">
        <h2 id="rhythm-title" className="text-[17px] leading-[21px] font-bold text-foreground">
          나의 공부 리듬
        </h2>
        <Badge variant="neutral">집중 리포트 준비 중</Badge>
      </div>

      <Card className="mt-2.5 flex flex-col gap-1 overflow-hidden rounded-[20px] border-0 shadow-sb-card px-[18px] pt-[18px] pb-4">
        <p className="text-[17px] leading-6 font-bold text-foreground">기록이 쌓이면 표시돼요</p>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          지금은 샘플 데이터가 표시돼요
        </p>

        <div aria-hidden className="flex flex-col gap-1.5 pt-3.5 opacity-80 blur-[0.8px]">
          <div className="flex items-start gap-1.5">
            <div className="flex w-3 shrink-0 flex-col gap-[3px] text-[10px] leading-[13px] text-text-tertiary">
              {MONDAY_FIRST_WEEKDAY_LABELS.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
              {SAMPLE_ROWS.map((row, rowIndex) => (
                <div key={MONDAY_FIRST_WEEKDAY_LABELS[rowIndex]} className="flex gap-0.5">
                  {[...row].map((level, hourIndex) => (
                    <span
                      key={hourIndex}
                      className={`h-[13px] min-w-0 flex-1 rounded-[2px] ${LEVEL_CLASS[Number(level)]!}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between pl-[18px] text-[10px] leading-3 text-text-tertiary">
            {X_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <div className="flex items-center justify-end gap-1 text-[10px] leading-3 text-text-tertiary">
            <span>적음</span>
            {LEVEL_CLASS.slice(1).map((levelClass) => (
              <span key={levelClass} className={`size-2.5 rounded-[2px] ${levelClass}`} />
            ))}
            <span>많음</span>
          </div>
        </div>
      </Card>
    </section>
  );
}
