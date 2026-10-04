import { MONDAY_FIRST_WEEKDAY_LABELS } from "./recordsFormat";

/**
 * 예시 히트맵의 시간대별 농도(0~5) — 실데이터가 아니라 "이런 화면이 나온다"를 보여 주는 그림이다.
 * 요일마다 조금씩 밀어 써서 줄마다 달라 보이게 한다.
 */
const SAMPLE_HOURS = [
  1, 0, 0, 0, 0, 0, 0, 2, 2, 4, 4, 4, 2, 1, 3, 3, 3, 2, 0, 4, 3, 4, 5, 3,
] as const;
const SAMPLE_SHIFT = [0, 2, 1, 3, 0, 5, 4] as const;

const LEVEL_CLASS = [
  "bg-chart-empty",
  "bg-chart-heat-1",
  "bg-chart-heat-2",
  "bg-chart-heat-3",
  "bg-chart-heat-4",
  "bg-chart-heat-5",
] as const;

const X_TICKS = [0, 6, 12, 18, 23] as const;

function sampleLevel(dayIndex: number, hour: number): number {
  return SAMPLE_HOURS[(hour + SAMPLE_SHIFT[dayIndex]!) % 24]!;
}

/**
 * 나의 공부 리듬 — 예상 화면
 *
 * 실데이터는 이번 범위가 아니다(후속 집중 리포트). 요일 × 시간 히트맵 예시를 흐리게 깔고 가운데
 * 안내를 올려, 기록이 쌓이면 무엇을 보게 되는지 미리 보여 준다. 예시는 장식이라 읽어 주지 않는다.
 */
export function RhythmCard() {
  return (
    <section aria-labelledby="rhythm-title">
      <div className="flex items-center justify-between px-0.5 pb-2.5">
        <h2 id="rhythm-title" className="text-base leading-5 font-extrabold text-foreground">
          나의 공부 리듬
        </h2>
        <span className="rounded-full bg-bg-layer-2 px-[9px] py-[3px] text-[11px] leading-[14px] font-medium text-brand-subtle-text">
          집중 리포트 준비 중
        </span>
      </div>

      <div className="relative rounded-[20px] bg-muted px-[18px] py-[15px] shadow-sb-card">
        <div aria-hidden className="opacity-[0.62] blur-[1px]">
          <div className="flex justify-between pr-0.5 pb-1 pl-7 text-[10px] leading-3 text-text-tertiary">
            {X_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {MONDAY_FIRST_WEEKDAY_LABELS.map((day, dayIndex) => (
              <div key={day} className="flex items-center gap-1.5">
                <span className="w-[22px] text-[10.5px] leading-[13px] text-muted-foreground">
                  {day}
                </span>
                <div className="flex min-w-0 flex-1 gap-0.5">
                  {Array.from({ length: 24 }, (_, hour) => (
                    <span
                      key={hour}
                      className={`h-[18px] min-w-0 flex-1 rounded-[3px] ${LEVEL_CLASS[sampleLevel(dayIndex, hour)]!}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5 pt-3">
            <span className="text-[10.5px] leading-[13px] text-text-tertiary">적음</span>
            {LEVEL_CLASS.slice(1).map((levelClass) => (
              <span key={levelClass} className={`h-2.5 w-[22px] rounded-[3px] ${levelClass}`} />
            ))}
            <span className="text-[10.5px] leading-[13px] text-text-tertiary">많음</span>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-0.5 rounded-[14px] border border-border bg-muted px-4 py-2.5 text-center shadow-sb-card">
            <p className="text-[13.5px] leading-[19px] font-bold text-foreground">
              기록이 쌓이면 나의 공부 리듬을 알려드려요
            </p>
            <p className="text-[11px] leading-[14px] text-muted-foreground">
              요일 × 시간대로 언제 가장 집중하는지 보여드릴게요
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
