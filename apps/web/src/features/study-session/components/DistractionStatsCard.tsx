import { Fragment } from "react";

import { toKoreanDurationLength } from "../formatDuration";
import { EVENT_STATUS_LABEL, RESULT_COPY, eventCountLabel } from "../resultCopy";
import type { EventTally, SessionResultView } from "../sessionResult";
import { formatEventDuration } from "../sessionResult";
import type { ResultStatusTone } from "./ResultCardParts";
import { ResultCard, ResultCardTitle, ResultStatusDot } from "./ResultCardParts";

/**
 * 비집중 통계 카드 (Figma `distract-card` 64:622).
 *
 * ## ⚠️ `화면 꺼짐` 행은 만들지 않는다
 *
 * Figma 원본의 4번째 행(`64:642`~`64:646`)은 오렌지 도트 `화면 꺼짐`이지만, 이는 2026-07-26
 * 6차 확정의 **미반영**이다(`design.md` 백로그 7번①). 확정 모델에서 화면 꺼짐·백그라운드는
 * 별도 비집중 유형이 아니라 **일시정지에 합산**되고, 표기도 `일시정지`로 통합됐다. 그래서:
 *
 * - 라벨은 `일시정지`, 도트는 **회색**(`text/tertiary`) — 비집중 3종과 시각적으로 구분된다
 * - 카드 타이틀의 합계에서 **일시정지를 뺀다**(Figma의 `비집중 21분`은 화면 꺼짐 3분을 포함한
 *   구 모델 값이다 → 확정 모델에서는 `비집중 18분`)
 * - 일시정지가 **0건이면 행 자체를 렌더하지 않는다**(`user-flow.md` S4 행: "일시정지 행(있을 때만)")
 *
 * ## 0건 행을 남기지 않는다
 *
 * 비집중 3종도 마찬가지로 0회 행을 `0회`로 남기지 않는다 — Figma에 0회 행 시안이 없다.
 * 세 유형이 모두 0이면 타이틀·행 대신 확정 문구 하나만 보여준다(voice-tone §4).
 *
 * ## 서버 값을 화면에서 보정하지 않는다
 *
 * 1초 미만 구간이 이벤트로 전송되지 않아 건수가 실제보다 적게 보일 수 있다는 이슈
 * (`MIN_EVENT_MS` vs `computeSessionTotals` 기준 차이)는 **정책 결정 대기 중**이다.
 * 그 보정을 이 화면에서 하지 않는다 — 안내 문구를 덧붙이는 것도 보정이다.
 */
export function DistractionStatsCard({ view }: { view: SessionResultView }) {
  const rows: { tally: EventTally; tone: ResultStatusTone }[] = [
    ...view.distractions.map((tally) => ({ tally, tone: "distract" as const })),
    // 일시정지는 비집중 3종 **아래**에 놓인다(Figma 행 순서 유지). 없으면 아예 빠진다.
    ...(view.pause !== null ? [{ tally: view.pause, tone: "pause" as const }] : []),
  ];
  const hasDistraction = view.distractions.length > 0;

  return (
    /* 아래 여백은 행 유무로 갈린다 — Figma의 pb 6px는 마지막 행의 py 12px와 합쳐지는 값이라
       행이 없을 때 그대로 쓰면 문구가 카드 바닥에 붙는다. */
    <ResultCard className={rows.length > 0 ? "pt-4 pb-[6px]" : "py-4"}>
      {hasDistraction ? (
        <ResultCardTitle>
          {`${RESULT_COPY.distractionTitlePrefix} ${toKoreanDurationLength(view.distractionSec)}`}
        </ResultCardTitle>
      ) : (
        /* TODO(미정: 리더/사용자 확인) 비집중 0 + 일시정지 1회 이상 조합의 정확한 레이아웃이
           디자인에 없다(SCR-S4 조건부 렌더 규칙). 기본 구현으로 확정 문구 아래에 일시정지 행만
           노출한다 — 문구를 새로 짓지 않는다. */
        <p className="text-[14px] leading-[17px] font-semibold text-foreground">
          {RESULT_COPY.noDistraction}
        </p>
      )}

      {rows.length > 0 && (
        <dl>
          {rows.map(({ tally, tone }, index) => (
            <Fragment key={tally.status}>
              {/* 구분선. Figma는 `#EFF1F3` 하드코딩(`64:629`)이라 다크 대응값이 없다 —
                  `border/default` 토큰으로 대체한다(라이트 3계조 차이는 QA 확인 항목). */}
              {index > 0 && <div aria-hidden="true" className="h-px w-full bg-border" />}
              <div className="flex items-center justify-between gap-3 py-3">
                <dt className="flex min-w-0 items-center gap-2">
                  <ResultStatusDot tone={tone} />
                  <span className="text-[14px] leading-[17px] break-keep text-foreground">
                    {EVENT_STATUS_LABEL[tally.status]}
                  </span>
                </dt>
                <dd className="shrink-0 text-[13px] leading-[16px] text-muted-foreground tabular-nums">
                  {eventCountLabel(tally.count, formatEventDuration(tally.durationSec))}
                </dd>
              </div>
            </Fragment>
          ))}
        </dl>
      )}
    </ResultCard>
  );
}
