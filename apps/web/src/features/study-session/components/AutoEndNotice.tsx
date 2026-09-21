import { Fragment, useId } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { toKoreanDurationLength } from "../formatDuration";
import { AUTO_END_COPY, autoEndBodyLinesFor } from "../sessionCopy";
import type { PauseTrigger } from "../sessionState";
import { CheckCircle } from "./CheckCircle";

/**
 * 세션 자동 종료 안내
 *
 * 일시정지가 임계값을 넘겨 세션이 사용자 조작 없이 끝났을 때의 사후 안내다.
 */
export interface AutoEndNoticeProps {
  /**
   * ⚠️ 본문 문구 선택 전용. 자동 종료 임계값 판정에는 쓰이지 않는다
   * (판정은 `usePauseAutoEnd`가 트리거와 무관하게 `pausedSince` 하나로만 한다).
   */
  trigger: PauseTrigger;
  /** 순공 시간(초). */
  focusSec: number;
  /** 총 공부 시간(초) — 일시정지 구간 제외. */
  studySec: number;
  onSeeResult: () => void;
  className?: string;
}

export function AutoEndNotice({
  trigger,
  focusSec,
  studySec,
  onSeeResult,
  className,
}: AutoEndNoticeProps) {
  const titleId = useId();
  const bodyLines = autoEndBodyLinesFor(trigger);

  return (
    // 자동 종료는 사용자가 유발하지 않은 상태 변화다 — 라이브 리전으로 알린다.
    // `pointer-events-auto`: 세션 레이어와 같은 오버레이 층에 놓이므로 직접 부여한다.
    <section
      aria-live="polite"
      aria-labelledby={titleId}
      data-session-surface="auto-end"
      className={cn(
        "pointer-events-auto absolute inset-0 flex flex-col overflow-y-auto bg-background px-5 text-foreground",
        "pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+24px)]",
        className,
      )}
    >
      {/* 여백을 절대 좌표로 베끼지 않는다(스펙 Implementation Notes) — 요소 사이 간격만 Figma
          실측(24 / 10 / 32)을 따르고, 블록 전체는 CTA 위 영역의 중앙에 놓는다.
          그 결과 콘텐츠 상단은 Figma의 y=241보다 조금 아래에 오고, 노치 기기에서는
          `env(safe-area-inset-top)`만큼 더 내려간다 — "정중앙보다 위, CTA와 겹치지 않음"이라는
          관계는 보존되지만 y 좌표가 일치하지는 않는다. 픽셀 일치가 필요하면 디자이너 확인 후
          고정 오프셋을 넣는다. (qa-WG4 F3: 이전 주석의 "2px 이내" 수치는 사실과 달라 정정) */}
      <div className="flex flex-1 flex-col items-center justify-center py-8">
        <CheckCircle />
        <h1
          id={titleId}
          className="mt-6 text-center text-[20px] leading-[24px] font-bold text-foreground"
        >
          {AUTO_END_COPY.title}
        </h1>
        {bodyLines !== null && (
          <p className="mt-[10px] text-center text-[14px] leading-[21px] text-muted-foreground">
            {bodyLines.map((line, index) => (
              <Fragment key={line}>
                {index > 0 && <br />}
                {line}
              </Fragment>
            ))}
          </p>
        )}
        <SummaryRowCard
          className="mt-8"
          rows={[
            { label: AUTO_END_COPY.summaryLabels.focusSec, value: focusSec, emphasis: true },
            { label: AUTO_END_COPY.summaryLabels.studySec, value: studySec },
          ]}
        />
      </div>

      <Button
        type="button"
        onClick={onSeeResult}
        className="mt-auto h-14 w-full shrink-0 rounded-2xl text-[17px] leading-[20px] font-bold motion-reduce:transition-none"
      >
        {AUTO_END_COPY.cta}
      </Button>
    </section>
  );
}

interface SummaryRow {
  label: string;
  /** 초 단위 원본값 — 표기 변환은 카드가 한 곳에서 한다. */
  value: number;
  /** 첫 행(순공시간)만 Bold다. */
  emphasis?: boolean;
}

/**
 * 요약 카드
 */
function SummaryRowCard({ rows, className }: { rows: SummaryRow[]; className?: string }) {
  return (
    <Card className={cn("w-full px-4", className)}>
      <dl>
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between py-[14px]">
            <dt className="text-[14px] leading-[17px] text-muted-foreground">{row.label}</dt>
            <dd
              className={cn(
                "text-[15px] leading-[18px] text-foreground",
                row.emphasis === true ? "font-bold" : "font-medium",
              )}
            >
              {toKoreanDurationLength(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
