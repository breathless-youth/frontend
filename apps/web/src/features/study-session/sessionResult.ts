import type {
  StatusEventPayload,
  StudyEventStatus,
  StudySessionResponse,
} from "@focusmakers/types";

import { toKoreanDurationLength } from "./formatDuration";
import { LEGEND_COPY, RESULT_COPY } from "./resultCopy";

/**
 * S4(공부 결과) **표시용 파생값** — 순수 함수만 둔다.
 *
 * 화면 컴포넌트는 여기서 나온 값을 그리기만 한다(`apps/web/CLAUDE.md`: 집중률·집계를 화면
 * 컴포넌트에서 직접 계산하지 않는다). 세션 **측정**은 `sessionTimeline.ts`가, 이 화면은 이미
 * 확정된 서버 응답(`StudySessionResponse`)의 **재표현**만 담당한다.
 *
 * ## 여기서 하지 않는 것 — 값 보정
 *
 * `studySec`·`focusSec`·`focusRate`가 서로 안 맞아 보여도 재계산·클램프하지 않는다
 * (SCR-S4 Ownership Boundary). 값 계산의 SSOT는 세션 훅과 백엔드다. 유일한 방어는
 * `focusRate`가 유한수가 아닐 때(0초 세션의 0 나눗셈) 0으로 떨어뜨리는 것뿐이다.
 *
 * ## 일시정지는 비집중이 아니다 (2026-07-26 확정)
 *
 * 수동 일시정지든 화면 꺼짐·백그라운드든 서버에는 `"PAUSE"` 한 종류로만 기록되고, 결과 화면은
 * 그 둘을 **구분하지 않는다**(구분할 수단도 없다 — 트리거는 제출 페이로드에 없다).
 * 비집중 합계(`distractionSec`)에서 PAUSE를 빼는 것이 이 모듈의 핵심 규칙이다.
 */

/** 비집중 3종. **PAUSE는 의도적으로 빠져 있다** — 합계·타이틀에서 제외된다. */
export const DISTRACTION_STATUSES = ["AWAY", "PHONE", "DEVICE"] as const;

export type DistractionStatus = (typeof DISTRACTION_STATUSES)[number];

/**
 * 발생 구간 1건 — 펼침 영역이 "언제 얼마나"를 보여주는 데 쓴다(BY-336).
 *
 * 합계만으로는 "3회 9분"이 5분 한 번 + 2분 두 번인지, 3분씩 고르게인지 알 수 없다.
 * 서버가 이벤트를 시작 시각 오름차순으로 내려주므로 여기서 다시 정렬하지 않는다
 * (SCR-S4 Data Contract — 정렬·병합은 서버 계약이 보장한다).
 */
export interface EventOccurrence {
  /** `HH:MM – HH:MM` (24시간제, 로컬 타임존). */
  clockRange: string;
  /** 이 구간의 길이(초). */
  durationSec: number;
}

/** 유형별 집계 1건. 서버는 유형별 지속 시간을 내려주지 않아 이벤트 구간에서 만든다. */
export interface EventTally {
  status: StudyEventStatus;
  /** 이벤트 건수. */
  count: number;
  /** 구간 길이 합(초). */
  durationSec: number;
  /** 발생 순서대로의 개별 구간. `count`와 길이가 같다. */
  occurrences: readonly EventOccurrence[];
}

/** 타임라인 바의 한 세그먼트 — 세션 **벽시계** 구간에 대한 비율(0~1). */
export interface TimelineSegment {
  status: StudyEventStatus;
  startRatio: number;
  widthRatio: number;
}

/**
 * 최고 집중 시간 — 세션 안에서 이벤트(AWAY/PHONE/DEVICE/PAUSE)로 끊기지 않고 이어진 **가장 긴
 * 구간**(BY-560 시안 "최고 집중 시간 37분"). 서버가 하루 단위로 주는 `longestFocusSec`과 같은
 * 정의를 세션 1건에 적용한 값이다 — 서버는 세션별 값을 내려주지 않아 이벤트에서 만든다.
 */
export interface LongestFocus {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  /** `HH:MM – HH:MM` (24시간제, 로컬 타임존). */
  clockRange: string;
  /** 타임라인 바 위 하이라이트 위치 — 세션 벽시계 구간에 대한 비율(0~1). */
  startRatio: number;
  widthRatio: number;
}

export interface SessionResultView {
  focusSec: number;
  studySec: number;
  /** 표시용 정수 집중률. 서버는 소수 1자리로 주지만 화면에 소수점을 노출하지 않는다. */
  focusRatePercent: number;
  startedAt: string;
  endedAt: string;
  /** `HH:MM – HH:MM` (24시간제, 로컬 타임존). */
  clockRange: string;
  /** 건수 0인 유형은 빠진다 — 0회 행 시안이 Figma에 없다. 순서는 `DISTRACTION_STATUSES` 고정. */
  distractions: EventTally[];
  /** 비집중 3종 시간 합(초) — **PAUSE 제외**. */
  distractionSec: number;
  /** 일시정지 집계. **0건이면 `null`** — 행·범례·세그먼트를 전부 숨긴다. */
  pause: EventTally | null;
  segments: TimelineSegment[];
  /** 이어진 집중 구간이 하나도 없으면(세션 길이 0 등) `null` — 배지·행·하이라이트를 모두 숨긴다. */
  longestFocus: LongestFocus | null;
}

function durationMs(event: StatusEventPayload): number {
  return Math.max(0, Date.parse(event.endedAt) - Date.parse(event.startedAt));
}

/**
 * 유형별 건수·시간 집계.
 *
 * ⚠️ **ms를 먼저 다 더하고 마지막에 한 번만 내림한다.** 이벤트마다 초로 내림한 뒤 더하면
 * 건당 최대 1초씩 사라져 "2회 · 9분 40초"가 "9분 38초"로 보인다
 * (같은 함정을 `submitStudySession.pauseMsOf`가 주석으로 남겨 뒀다).
 */
export function aggregateEvents(
  events: readonly StatusEventPayload[],
): Map<StudyEventStatus, EventTally> {
  const byStatus = new Map<
    StudyEventStatus,
    { count: number; ms: number; occurrences: EventOccurrence[] }
  >();
  for (const event of events) {
    const prev = byStatus.get(event.status) ?? { count: 0, ms: 0, occurrences: [] };
    const eventMs = durationMs(event);
    byStatus.set(event.status, {
      count: prev.count + 1,
      ms: prev.ms + eventMs,
      // 개별 구간은 **자기 길이만** 내림한다 — 합계(`durationSec`)는 위 ms 누적에서 마지막에
      // 한 번만 내림하므로, 구간들의 합이 합계보다 최대 (건수-1)초 작을 수 있다. 표기가 분
      // 단위라 화면에서는 드러나지 않고, 합계 쪽을 정확히 유지하는 편이 맞다.
      occurrences: [
        ...prev.occurrences,
        {
          clockRange: formatClockRange(event.startedAt, event.endedAt),
          durationSec: Math.floor(eventMs / 1000),
        },
      ],
    });
  }
  return new Map(
    [...byStatus].map(([status, { count, ms, occurrences }]) => [
      status,
      { status, count, durationSec: Math.floor(ms / 1000), occurrences },
    ]),
  );
}

/**
 * 타임라인 세그먼트 — 세션 벽시계 구간(`startedAt`→`endedAt`)에 대한 비율로 환산한다.
 *
 * 서버 검증이 "0초 불가 · 겹침 불가 · 세션 구간 안"을 보장하므로 병합·정렬 로직을 넣지 않는다
 * (SCR-S4 Data Contract). 다만 범위 밖 값이 오더라도 바가 깨지지 않게 0~1로만 잘라 둔다 —
 * 이건 **표시 방어**이지 데이터 보정이 아니다.
 */
export function timelineSegments(session: StudySessionResponse): TimelineSegment[] {
  const startMs = Date.parse(session.startedAt);
  const spanMs = Date.parse(session.endedAt) - startMs;
  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return [];
  }
  return session.events.map((event) => {
    const startRatio = clamp01((Date.parse(event.startedAt) - startMs) / spanMs);
    const endRatio = clamp01((Date.parse(event.endedAt) - startMs) / spanMs);
    return {
      status: event.status,
      startRatio,
      widthRatio: Math.max(0, endRatio - startRatio),
    };
  });
}

/**
 * 최고 집중 구간 — 이벤트 사이의 빈 구간 중 가장 긴 것.
 *
 * 커서를 세션 시작에 두고 이벤트를 순서대로 지나며 "커서 → 이벤트 시작"의 빈 구간 길이를 재고,
 * 마지막 이벤트 뒤 "커서 → 세션 끝"까지 본다. 정렬·병합은 서버 계약이 보장하므로 여기서 다시
 * 하지 않는다(`timelineSegments`와 같은 태도) — 다만 겹친 이벤트가 와도 커서가 뒤로 가지 않게
 * `max`로만 전진시킨다(표시 방어). 같은 길이면 먼저 나온 구간을 택한다.
 */
export function longestFocusStretch(session: StudySessionResponse): LongestFocus | null {
  const startMs = Date.parse(session.startedAt);
  const endMs = Date.parse(session.endedAt);
  const spanMs = endMs - startMs;
  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return null;
  }
  let cursor = startMs;
  let best = { start: startMs, end: startMs };
  for (const event of session.events) {
    const eventStart = Math.min(endMs, Math.max(startMs, Date.parse(event.startedAt)));
    const eventEnd = Math.min(endMs, Math.max(startMs, Date.parse(event.endedAt)));
    if (Number.isNaN(eventStart) || Number.isNaN(eventEnd)) {
      continue;
    }
    if (eventStart - cursor > best.end - best.start) {
      best = { start: cursor, end: eventStart };
    }
    cursor = Math.max(cursor, eventEnd);
  }
  if (endMs - cursor > best.end - best.start) {
    best = { start: cursor, end: endMs };
  }
  const ms = best.end - best.start;
  if (ms <= 0) {
    return null;
  }
  const startedAt = new Date(best.start).toISOString();
  const endedAt = new Date(best.end).toISOString();
  return {
    startedAt,
    endedAt,
    durationSec: Math.floor(ms / 1000),
    clockRange: formatClockRange(startedAt, endedAt),
    startRatio: (best.start - startMs) / spanMs,
    widthRatio: ms / spanMs,
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/** 세션 1건 → 화면이 그대로 그릴 수 있는 표시 모델. */
export function toSessionResultView(session: StudySessionResponse): SessionResultView {
  const tallies = aggregateEvents(session.events);
  const distractions = DISTRACTION_STATUSES.map((status) => tallies.get(status)).filter(
    (tally): tally is EventTally => tally !== undefined && tally.count > 0,
  );
  return {
    focusSec: session.focusSec,
    studySec: session.studySec,
    focusRatePercent: Number.isFinite(session.focusRate) ? Math.round(session.focusRate) : 0,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    clockRange: formatClockRange(session.startedAt, session.endedAt),
    distractions,
    distractionSec: distractions.reduce((sum, tally) => sum + tally.durationSec, 0),
    pause: tallies.get("PAUSE") ?? null,
    segments: timelineSegments(session),
    longestFocus: longestFocusStretch(session),
  };
}

/**
 * UTC ISO-8601 → `HH:MM` (24시간제, **로컬 타임존**).
 *
 * `toLocaleTimeString`을 쓰지 않는 이유: 로캘·엔진에 따라 자정이 `24:00`으로 나오거나
 * 오전/오후가 붙는다. 시각 표기는 화면 계약이므로 엔진에 맡기지 않는다.
 */
export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** `HH:MM – HH:MM` — 구분자는 **en dash(U+2013) 양옆 공백**(Figma `64:560` 실측). */
export function formatClockRange(startIso: string, endIso: string): string {
  return `${formatClockTime(startIso)} – ${formatClockTime(endIso)}`;
}

/**
 * 타임라인 바의 스크린리더 요약.
 *
 * 바는 순수 시각 요소라 그대로 두면 정보가 사라진다 — `role="img"` + 이 라벨로 요약을 준다
 * (SCR-S4 Accessibility Requirements). 일시정지·최고 집중은 **있을 때만** 읽는다. 라벨은 범례와
 * 같은 문구(`LEGEND_COPY`)를 쓴다 — 눈으로 보는 범례와 귀로 듣는 요약이 다른 말을 하면 안 된다.
 */
export function timelineSummaryLabel(view: SessionResultView): string {
  const parts = [
    `${LEGEND_COPY.focus} ${toKoreanDurationLength(view.focusSec)}`,
    `${LEGEND_COPY.distract} ${toKoreanDurationLength(view.distractionSec)}`,
  ];
  if (view.pause !== null) {
    parts.push(`${LEGEND_COPY.pause} ${toKoreanDurationLength(view.pause.durationSec)}`);
  }
  if (view.longestFocus !== null) {
    parts.push(
      `${RESULT_COPY.longestFocusLabel} ${toKoreanDurationLength(view.longestFocus.durationSec)}`,
    );
  }
  return parts.join(", ");
}
