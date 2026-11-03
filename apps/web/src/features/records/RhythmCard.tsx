import { useTranslation } from "react-i18next";

import { mondayFirstWeekdayLabels } from "./recordsFormat";
import { PEAK_SPAN_HOURS, buildStudyRhythm, peakRangeParts, type StudyRhythm } from "./rhythm";
import type { RhythmState } from "./useWeeklyData";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/Skeleton";

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

const COLUMNS = 24;
/** 칸 사이 간격(`gap-0.5`). 칸은 flex-1이라 폭이 `(전체 - 간격 합) / 24`다. */
const COLUMN_GAP_PX = 2;
/** 테두리가 칸을 1px씩 바깥으로 감싸도록 두는 여유. */
const BAND_OUTSET_PX = 1;

/** 피크 2시간 테두리의 위치·폭 — 칸 사이 간격까지 넣어 두 칸의 경계에 맞춘다. */
function peakBandStyle(peakColumn: number) {
  const column = `((100% - ${(COLUMNS - 1) * COLUMN_GAP_PX}px) / ${COLUMNS} + ${COLUMN_GAP_PX}px)`;
  return {
    left: `calc(${peakColumn} * ${column} - ${BAND_OUTSET_PX}px)`,
    width: `calc(${PEAK_SPAN_HOURS} * ${column} - ${COLUMN_GAP_PX}px + ${BAND_OUTSET_PX * 2}px)`,
  };
}

const CARD_CLASS =
  "mt-2.5 flex flex-col gap-1 overflow-hidden rounded-xl border-0 shadow-sb-card px-4.5 pt-4.5 pb-4";

/**
 * 나의 공부 리듬
 *
 * 누적 공부일 14일 전에는 예상 화면(흐린 샘플 히트맵 + `기록이 쌓이면 표시돼요`)을, 14일부터는 내 요일 × 시간
 * 히트맵과 가장 많이 공부한 2시간 문장(`저녁 8~10시에 집중했어요`)을 보여 준다. 기준과 계산은 `rhythm.ts`.
 * 히트맵은 두 경우 모두 장식이라 읽어 주지 않는다 — 내 리듬은 문장이 뜻을 전한다.
 * 조회에 실패하면 샘플로 되돌아간다(리듬은 보조 카드라 재시도 UI를 두지 않는다).
 */
export function RhythmCard({ rhythm }: { rhythm: RhythmState }) {
  const { t } = useTranslation("records");
  const mine = rhythm.status === "success" ? buildStudyRhythm(rhythm.data) : null;

  return (
    <section aria-labelledby="rhythm-title">
      <div className="flex items-center justify-between pt-7">
        <h2 id="rhythm-title" className="text-[17px] leading-5.25 font-bold text-foreground">
          {t("rhythm.title")}
        </h2>
        {mine === null && <Badge variant="neutral">{t("rhythm.badge")}</Badge>}
      </div>

      {rhythm.status === "pending" ? (
        <Skeleton className="mt-2.5 h-56 w-full rounded-xl" />
      ) : mine ? (
        <MyRhythm rhythm={mine} />
      ) : (
        <Card className={CARD_CLASS}>
          <p className="text-[17px] leading-6 font-bold text-foreground">
            {t("rhythm.emptyTitle")}
          </p>
          <p className="text-[13px] leading-4.5 text-muted-foreground">
            {t("rhythm.sampleNotice")}
          </p>
          <Heatmap rows={SAMPLE_ROWS.map((row) => [...row].map(Number))} ghost />
        </Card>
      )}
    </section>
  );
}

function MyRhythm({ rhythm }: { rhythm: StudyRhythm }) {
  const { t } = useTranslation("records");
  const parts = peakRangeParts(rhythm.peakStartHour);
  // 정오를 넘으면 `오전 11시~오후 1시`로 나눠 적는다.
  const range = t(parts.crossesNoon ? "rhythm.rangeCrossNoon" : "rhythm.range", {
    ...parts,
    period: t(`rhythm.period.${parts.period}`),
  });

  return (
    <Card className={CARD_CLASS} data-testid="rhythm-mine">
      <p className="text-[17px] leading-6 font-bold text-foreground">
        {t("rhythm.peakTitle", { range })}
      </p>
      <p className="text-[13px] leading-4.5 text-muted-foreground">
        {t("rhythm.peakSubtitle", { days: rhythm.studyDays })}
      </p>
      <Heatmap rows={rhythm.levels} peakColumn={rhythm.peakColumn} />
    </Card>
  );
}

/**
 * 요일 7줄 × 24칸 히트맵. `ghost`면 샘플이라 흐리게, `peakColumn`이 있으면 그 2시간을 brand 테두리로 감싼다
 * (문장이 가리키는 구간을 그림에서도 찾게).
 */
function Heatmap({
  rows,
  ghost = false,
  peakColumn,
}: {
  rows: readonly (readonly number[])[];
  ghost?: boolean;
  peakColumn?: number;
}) {
  const { t } = useTranslation("records");
  const weekdays = mondayFirstWeekdayLabels("narrow");
  return (
    <div
      aria-hidden
      className={`flex flex-col gap-1.5 pt-3.5 ${ghost ? "opacity-80 blur-[0.8px]" : ""}`}
    >
      <div className="flex items-start gap-1.5">
        <div className="flex w-3 shrink-0 flex-col gap-0.75 text-[10px] leading-3.25 text-text-tertiary">
          {weekdays.map((day, index) => (
            <span key={index}>{day}</span>
          ))}
        </div>
        <div className="relative flex min-w-0 flex-1 flex-col gap-0.75">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-0.5">
              {row.map((level, hourIndex) => (
                <span
                  key={hourIndex}
                  className={`h-3.25 min-w-0 flex-1 rounded-[2px] ${LEVEL_CLASS[level] ?? LEVEL_CLASS[0]}`}
                />
              ))}
            </div>
          ))}
          {peakColumn !== undefined && (
            <span
              data-testid="rhythm-peak-band"
              className="pointer-events-none absolute -inset-y-0.75 rounded-[4px] border-[1.5px] border-primary"
              style={peakBandStyle(peakColumn)}
            />
          )}
        </div>
      </div>
      <div className="flex justify-between pl-4.5 text-[10px] leading-3 text-text-tertiary">
        {X_TICKS.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1 text-[10px] leading-3 text-text-tertiary">
        <span>{t("rhythm.legendLow")}</span>
        {LEVEL_CLASS.slice(1).map((levelClass) => (
          <span key={levelClass} className={`size-2.5 rounded-[2px] ${levelClass}`} />
        ))}
        <span>{t("rhythm.legendHigh")}</span>
      </div>
    </div>
  );
}
