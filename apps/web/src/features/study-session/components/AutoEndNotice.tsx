import { Fragment, useId } from "react";

import { cn } from "@/lib/utils";

import { toKoreanDurationLength } from "../formatDuration";
import { AUTO_END_COPY, autoEndBodyLinesFor } from "../sessionCopy";
import type { PauseTrigger } from "../sessionState";
import { CheckCircle } from "./CheckCircle";

/**
 * S3-8 자동 종료 안내 (Figma `63:569`).
 *
 * 일시정지가 임계값을 넘겨 세션이 **사용자 조작 없이** 끝났을 때의 사후 안내다.
 * "이미 저장됐다"는 안심 → 왜 끝났는지 → 순공·총 요약 → `결과 보기` 순서(voice-tone.md §1
 * "이득/안심 우선 구성"). 이미 끝난 일이므로 취소·재개 액션을 넣지 않는다.
 *
 * ## S3-7과 테마 처리를 묶지 말 것
 *
 * 종료 확인 다이얼로그(S3-7)는 카메라 위에 뜨는 **항상-다크 오버레이**지만, 이 화면은
 * **일반 앱 화면**이라 Figma에서도 시맨틱 변수(`bg/base`·`text/primary`·`brand/primary` …)에
 * 바인딩돼 있고 라이트/다크를 모두 따라간다. 그래서 세션 서브트리의 `--session-*` 다크 고정
 * 변수를 쓰지 않고 `index.css`의 테마 반응형 시맨틱 토큰을 그대로 쓴다.
 * 세션 화면(`<main>`의 `text-white`) 위에 얹히므로 색은 전부 명시한다.
 *
 * ## 값은 전부 props
 *
 * Figma의 `52분`·`1시간 8분`은 예시일 뿐이라 하드코딩하지 않는다. 표기는 voice-tone.md §2의
 * **한글 시간 길이** 규칙(`toKoreanDurationLength`)을 따른다 — 이 화면에는 `HH:MM:SS`를 쓰지 않는다.
 */
export interface AutoEndNoticeProps {
  /**
   * ⚠️ **본문 문구 선택 전용.** 자동 종료 임계값 판정에는 쓰이지 않는다
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

      <button
        type="button"
        onClick={onSeeResult}
        className="h-14 w-full shrink-0 rounded-2xl bg-primary text-[17px] leading-[20px] font-bold text-primary-foreground transition-opacity duration-200 active:opacity-90 motion-reduce:transition-none"
      >
        {AUTO_END_COPY.cta}
      </button>
    </section>
  );
}

interface SummaryRow {
  label: string;
  /** 초 단위 원본값 — 표기 변환은 카드가 한 곳에서 한다. */
  value: number;
  /** 첫 행(순공시간)만 Bold다(Figma `63:595` vs `63:599`). */
  emphasis?: boolean;
}

/**
 * 요약 카드 (Figma `summary-card` 63:592) — 라벨↔값 2행 + 구분선.
 *
 * S4(공부 결과)에도 비슷한 형태가 나오지만 **선점해서 공용화하지 않는다** — 실제로 두 번째
 * 소비자가 생길 때 `components/ui/`로 승격한다(SCR-S3-7·S3-8 Components).
 * 라벨↔값 쌍이 읽기 순서대로 연결되도록 `<dl>`로 마크업한다(Accessibility).
 *
 * ⚠️ **구분선 색 괴리(리뷰 항목)**: Figma `63:596`은 `#EFF1F3` 하드코딩이고 이 값은 시맨틱
 * 토큰 어디에도 없다(`border/default` 라이트는 `#E5E8EB`). 무엇보다 **다크 대응값이 없어**
 * 그대로 쓰면 다크 모드에서 카드 위에 흰 선이 남는다. 이 화면은 테마 반응형이므로
 * `border/default` 토큰을 쓰고, 라이트 3계조 차이는 디자인 확인 항목으로 남긴다.
 */
function SummaryRowCard({ rows, className }: { rows: SummaryRow[]; className?: string }) {
  return (
    <dl className={cn("w-full rounded-2xl border border-border bg-muted px-4", className)}>
      {rows.map((row, index) => (
        <Fragment key={row.label}>
          {index > 0 && <div aria-hidden="true" className="h-px w-full bg-border" />}
          <div className="flex items-center justify-between py-[14px]">
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
        </Fragment>
      ))}
    </dl>
  );
}
