import { Fragment, useId, useState } from "react";

import type { StudyEventStatus } from "@focuson/types";

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
 *
 * ## 행은 접혀 있고, 누르면 시간이 펼쳐진다 (2026-07-27 결정)
 *
 * 접힌 상태에서는 **횟수만** 보이고 시간은 펼쳤을 때만 나온다. Figma는 `2회 · 9분 40초`처럼
 * 시간을 함께 그렸지만, 표기 규칙이 분 단위로 바뀌면서(초 금지) 통계 행에서 초가 사라지자
 * 시간을 상시 노출할 이유가 약해졌다 — 대신 필요할 때 펼쳐 보는 쪽을 택했다.
 *
 * 펼침 영역은 **합계 + 발생 구간 나열**이다(BY-336, 2026-07-31). 합계만 보여주던 것을 넓혔다 —
 * `3회 9분`이 5분 한 번 + 2분 두 번인지 3분씩 고르게인지가 합계로는 구분되지 않는데, 사용자가
 * 알고 싶은 것은 대개 "언제 무너졌나"다. 시각은 세션 벽시계라 위 타임라인 바의 세그먼트 위치와
 * 그대로 대응된다. Figma 시안은 없다(펼침 자체가 Figma 이후 결정이다).
 *
 * `<dl>`이 아니라 `<ul>`인 이유: 행이 **누를 수 있는 요소**가 되면서 정의 목록이 아니라
 * 펼침(disclosure) 목록이 됐다. `<dl>`의 직계 자식으로 `<button>`을 둘 수 없어 마크업이
 * 무효해지기도 한다.
 *
 * 여러 행을 동시에 펼칠 수 있다(단일 선택 아코디언이 아니다). 하나를 열 때 다른 하나가 닫히면
 * 두 유형의 시간을 비교하려는 사용자가 계속 다시 눌러야 한다.
 */
export function DistractionStatsCard({ view }: { view: SessionResultView }) {
  const rows: { tally: EventTally; tone: ResultStatusTone }[] = [
    ...view.distractions.map((tally) => ({ tally, tone: "distract" as const })),
    // 일시정지는 비집중 3종 **아래**에 놓인다(Figma 행 순서 유지). 없으면 아예 빠진다.
    ...(view.pause !== null ? [{ tally: view.pause, tone: "pause" as const }] : []),
  ];
  const hasDistraction = view.distractions.length > 0;
  // 펼쳐진 행들. 상태를 status로 들고 있어 행 순서가 바뀌어도 펼침이 따라간다.
  const [expanded, setExpanded] = useState<readonly StudyEventStatus[]>([]);
  // 패널 id의 접두사 — 같은 페이지에 카드가 둘 이상 와도 id가 겹치지 않게 한다.
  const idPrefix = useId();

  function toggle(status: StudyEventStatus) {
    setExpanded((prev) =>
      prev.includes(status) ? prev.filter((each) => each !== status) : [...prev, status],
    );
  }

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
        <ul>
          {rows.map(({ tally, tone }, index) => {
            const isOpen = expanded.includes(tally.status);
            const panelId = `${idPrefix}-${tally.status}`;
            return (
              <Fragment key={tally.status}>
                {/* 구분선. Figma는 `#EFF1F3` 하드코딩(`64:629`)이라 다크 대응값이 없다 —
                    `border/default` 토큰으로 대체한다(라이트 3계조 차이는 QA 확인 항목). */}
                {index > 0 && <div aria-hidden="true" className="h-px w-full bg-border" />}
                <li>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggle(tally.status)}
                    className="flex w-full items-center justify-between gap-3 py-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ResultStatusDot tone={tone} />
                      <span className="text-[14px] leading-[17px] break-keep text-foreground">
                        {EVENT_STATUS_LABEL[tally.status]}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-[13px] leading-[16px] text-muted-foreground">
                      <span className="tabular-nums">{eventCountLabel(tally.count)}</span>
                      {/* 펼침 여부를 색·굵기가 아니라 **방향**으로 알린다 — 색만으로 상태를
                          구분하면 저시력 사용자에게 전달되지 않는다. 상태 자체는
                          `aria-expanded`가 읽어 주므로 이 아이콘은 장식이다. */}
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 12 12"
                        className={`h-3 w-3 transition-transform duration-150 motion-reduce:transition-none ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      >
                        <path
                          d="M2.5 4.5 6 8l3.5-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </button>
                  {/* 접혔을 때 DOM에서 빼는 이유: 남겨 두면 스크린리더가 숨은 시간까지 읽어
                      `aria-expanded="false"`와 어긋난다. */}
                  {isOpen && (
                    <div
                      id={panelId}
                      className="pb-3 pl-4 text-[13px] leading-[16px] text-muted-foreground"
                    >
                      <p className="tabular-nums">
                        {`${RESULT_COPY.occurrenceTotalPrefix} ${formatEventDuration(tally.durationSec)}`}
                      </p>
                      {/* 발생 구간 나열 — 합계만으로는 "3회 9분"이 한 번 길게인지 고르게인지
                          알 수 없다(BY-336). 시각은 세션 벽시계 기준이라 위 타임라인 바의
                          회색·주황 구간과 위치가 그대로 대응된다. */}
                      <ul className="mt-1 flex flex-col gap-[2px] tabular-nums">
                        {tally.occurrences.map((occurrence, order) => (
                          // 표기가 분 단위라 짧은 구간 둘이 같은 `HH:MM – HH:MM`을 가질 수 있다
                          // — 키는 순서로 잡는다(목록이 정렬·고정이라 안전하다).
                          <li
                            key={`${occurrence.clockRange}-${String(order)}`}
                            className="flex items-baseline justify-between gap-3 text-text-tertiary"
                          >
                            <span>{occurrence.clockRange}</span>
                            <span>{formatEventDuration(occurrence.durationSec)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </ResultCard>
  );
}
