import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { toKoreanDurationLength } from "../formatDuration";
import { LEGEND_COPY, RESULT_COPY } from "../resultCopy";
import type { SessionResultView } from "../sessionResult";
import { formatClockTime, timelineSummaryLabel } from "../sessionResult";
import type { ResultStatusTone } from "./ResultCardParts";
import { ResultBarSegment, ResultStatusDot } from "./ResultCardParts";

/**
 * 공부 타임라인 카드 (Figma `timeline-card` 64:561 → BY-560 시안 스크린샷으로 개편, 2026-09-14).
 *
 * 세션 **벽시계** 구간을 바 하나로 펴고, 그 위에 자동 멈춤(오렌지)·일시정지(회색) 구간을 얹는다.
 * 바탕은 집중(브랜드 블루)이다 — 즉 "아무것도 얹히지 않은 곳 = 집중"이다.
 *
 * ## BY-560 시안에서 바뀐 것
 *
 * - 범례가 바 아래에서 **카드 헤더 오른쪽**으로 올라갔다(타이틀과 같은 줄).
 * - `비집중` 표기가 `자동 멈춤`으로 바뀌었다(`LEGEND_COPY` 주석 참고).
 * - **최고 집중 시간**이 생겼다: 바 위 배지(`최고 집중 시간 42분`)가 해당 구간 가운데를 가리키고,
 *   바 안에서는 그 구간이 좌우 간격(`LONGEST_GAP_PX`)으로 **분리된 조각**(바 높이 그대로, 모서리
 *   3px)으로 보이며, 바
 *   아래에는 값·시각 범위 행이 붙는다. 구간은 `sessionResult.longestFocusStretch`가 이벤트에서
 *   만든다 — 없으면(`null`) 셋 다 뺀다. 배지는 말꼬리로 조각 가운데를 가리킨다. (테두리 링 →
 *   사방 여백 → 좌우 간격+말꼬리로 2026-09-14 하루에 세 번 바뀌었다 — 마지막이 3차 시안 이미지다.)
 *
 * ## 배지 위치를 가장자리에서 잘라 두고, 말꼬리는 진짜 가운데에 둔다
 *
 * 배지는 구간 가운데(`startRatio + widthRatio/2`)에 두지만, 구간이 바 끝에 붙어 있으면 배지 절반이
 * 카드 밖으로 나간다. 배지 상자의 가운데 좌표는 15~85%로 잘라 카드 안에 머물게 하고, 말꼬리는
 * 배지가 아니라 **바 컨테이너 기준 실제 가운데**에 따로 둔다 — 그래야 배지가 잘려 밀려도 꼬리는
 * 조각을 가리킨다(밀림 최대 ≈ 50px < 배지 반폭이라 꼬리가 배지 밑에서 벗어나지 않는다).
 *
 * ## ⚠️ Figma 반영 지연 — 3색으로 그린다
 *
 * Figma 원본은 범례가 2색이고 회색 세그먼트가 없다(`64:572`). 이는 2026-07-26 6차 확정("S4 타임라인
 * 범례 3색")의 **미반영**이다(`design.md` 백로그 7번①). 일시정지가 0건이면 회색은 어디에도 없다.
 *
 * ## 접근성
 *
 * 바 자체는 정보를 전달하지 못하는 시각 요소라 `role="img"` + 요약 `aria-label`을 준다
 * (SCR-S4 Accessibility). 범례는 도트 + 텍스트를 항상 병기한다 — 색 단독 전달 금지. 배지와
 * 조각·간격은 아래 행이 같은 정보를 텍스트로 주므로 `aria-hidden`이다.
 */
/** 최고 집중 조각과 이웃 구간 사이의 배경색 간격(px, 좌우) — 3차 시안 이미지 실측에 가까운 값. */
const LONGEST_GAP_PX = 3;

export function StudyTimelineCard({ view }: { view: SessionResultView }) {
  const hasDistraction = view.distractions.length > 0;
  const hasPause = view.pause !== null;
  const longest = view.longestFocus;
  const badgeCenterPercent =
    longest === null
      ? 0
      : Math.min(85, Math.max(15, (longest.startRatio + longest.widthRatio / 2) * 100));

  return (
    <Card className="shadow-sb-card pt-4 pb-[14px]">
      <CardHeader className="flex-wrap gap-y-1">
        <CardTitle>{RESULT_COPY.timelineTitle}</CardTitle>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* 집중은 항상 있다 — 바탕색이 집중이므로 범례에서 뺄 수 없다. */}
          <LegendItem tone="focus" label={LEGEND_COPY.focus} />
          {hasDistraction && <LegendItem tone="distract" label={LEGEND_COPY.distract} />}
          {hasPause && <LegendItem tone="pause" label={LEGEND_COPY.pause} />}
        </ul>
      </CardHeader>
      <CardContent>
        {/* 배지(+말꼬리)가 들어갈 자리를 위에 비워 둔다 — 배지가 없어도 높이를 유지해 카드가 들썩이지
          않는다. */}
        <div className="relative mt-[48px]">
          {longest !== null && (
            <>
              <Badge
                variant="outline"
                aria-hidden="true"
                className="absolute -top-[42px] -translate-x-1/2"
                style={{ left: `${badgeCenterPercent}%` }}
              >
                {`${RESULT_COPY.longestFocusLabel} ${toKoreanDurationLength(longest.durationSec)}`}
              </Badge>
              {/* 말꼬리 — 45° 돌린 정사각형의 오른쪽·아래 테두리가 V자를 만든다. 배지보다 위에(z) 그려
                카드색 채움이 그 밑의 배지 아래 테두리를 가린다. */}
              <span
                aria-hidden="true"
                className="absolute -top-[20px] z-10 size-2 -translate-x-1/2 rotate-45 border-r-[1.5px] border-b-[1.5px] border-primary bg-muted"
                style={{ left: `${(longest.startRatio + longest.widthRatio / 2) * 100}%` }}
              />
            </>
          )}
          <div
            role="img"
            aria-label={timelineSummaryLabel(view)}
            className="relative h-3 w-full overflow-hidden rounded-full bg-primary"
          >
            {view.segments.map((segment) => (
              <ResultBarSegment
                key={`${segment.status}-${segment.startRatio}`}
                tone={segment.status === "PAUSE" ? "pause" : "distract"}
                startRatio={segment.startRatio}
                widthRatio={segment.widthRatio}
              />
            ))}
            {/* 최고 집중 조각(2026-09-14 3차 시안 이미지) — 구간 좌우에 카드색 간격을 두고 조각은 바와
              같은 높이로, 모서리는 살짝만 둥글게. 카드색 바탕(간격 포함 폭)을 먼저 깔고 그 위에
              조각을 칠해야 둥근 모서리 바깥이 바탕색(집중 블루)이 아니라 카드색으로 보인다. */}
            {longest !== null && (
              <span
                aria-hidden="true"
                className="absolute inset-y-0 bg-muted"
                style={{
                  left: `calc(${longest.startRatio * 100}% - ${LONGEST_GAP_PX}px)`,
                  width: `calc(${longest.widthRatio * 100}% + ${LONGEST_GAP_PX * 2}px)`,
                }}
              >
                <span
                  className="absolute inset-y-0 rounded-[3px] bg-primary"
                  style={{ left: LONGEST_GAP_PX, right: LONGEST_GAP_PX }}
                />
              </span>
            )}
          </div>
        </div>

        {/* 축 라벨 = 세션 시작·종료 벽시계(`64:570`/`64:571`). 총 공부 시간이 아니다. */}
        <div className="mt-[6px] flex justify-between text-[11px] leading-[13px] text-text-tertiary tabular-nums">
          <span>{formatClockTime(view.startedAt)}</span>
          <span>{formatClockTime(view.endedAt)}</span>
        </div>

        {longest !== null && (
          <>
            <Separator className="mt-3" />
            <div className="flex items-center justify-between gap-3 pt-3">
              <span className="flex min-w-0 items-center gap-[6px]">
                <ResultStatusDot tone="focus" />
                <span className="text-[14px] leading-[17px] break-keep text-foreground">
                  {RESULT_COPY.longestFocusLabel}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="text-[16px] leading-[19px] font-bold text-foreground">
                  {toKoreanDurationLength(longest.durationSec)}
                </span>
                <span className="text-[13px] leading-[16px] text-text-tertiary">
                  {longest.clockRange}
                </span>
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LegendItem({ tone, label }: { tone: ResultStatusTone; label: string }) {
  return (
    <li className="flex items-center gap-[5px]">
      <ResultStatusDot tone={tone} />
      <span className="text-[11px] leading-[13px] text-muted-foreground">{label}</span>
    </li>
  );
}
