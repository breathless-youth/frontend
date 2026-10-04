import type { StatusEventPayload, SubjectRef, SubjectSegmentResponse } from "@focusmakers/types";

/**
 * 기록 탭과 플래너가 함께 쓰는 과목·세션 표시 헬퍼 — 순수 함수.
 *
 * 과목 id → 이름·색 조회(같은 이름 합치기), 과목 색 토큰, 세션 행의 미니 타임라인을 만든다.
 * 하루 타임테이블과 과목별 합계는 플래너(`features/planner/plannerDay.ts`)가 맡는다.
 */

/** 타임라인을 그릴 세션 조각 — 일간 목록의 `sessions[]`와 상세 응답 둘 다 이 모양을 만족한다. */
export interface TimetableSession {
  readonly startedAt: string;
  readonly endedAt: string;
  readonly events?: readonly StatusEventPayload[];
  readonly subjectSegments?: readonly SubjectSegmentResponse[];
}

/** KST 날짜 키(`YYYY-MM-DD`)의 자정 epoch ms. */
export function kstDayStartMs(dateKey: string): number {
  return Date.parse(`${dateKey}T00:00:00+09:00`);
}

/**
 * 과목 id → 이름·색. 지운 과목도 들어 있다(`deleted`). 응답에 `subjects`가 없으면 빈 맵.
 *
 * 이름이 같은 과목은 id가 달라도 대표 하나로 모은다 — 지웠다 다시 만들어 id가 갈린 과목이 화면에서
 * 한 줄·한 색으로 보이게 한다. 대표는 살아있는 과목, 없으면 응답에서 먼저 나온 과목이다.
 */
export function subjectRefMap(
  subjects: readonly SubjectRef[] | undefined,
): ReadonlyMap<number, SubjectRef> {
  const byName = new Map<string, SubjectRef>();
  for (const subject of subjects ?? []) {
    const chosen = byName.get(subject.name);
    if (chosen === undefined || (chosen.deleted && !subject.deleted)) {
      byName.set(subject.name, subject);
    }
  }
  return new Map(
    (subjects ?? []).map((subject) => [subject.id, byName.get(subject.name) ?? subject]),
  );
}

/**
 * 과목 색 토큰 참조. colorIndex 0~19를 20색 팔레트에 순환 인덱싱한다(음수·초과 방어).
 * `.theme-soft-blue` 스코프의 원천 변수(`--subject-N`)를 직접 참조한다 — `@theme inline`은
 * 값을 유틸리티에 인라인만 하고 `--color-subject-N`을 CSS 변수로 방출하지 않아, 인라인
 * style에서 `var(--color-subject-N)`을 쓰면 미정의로 비어 버린다.
 */
export function subjectColorVar(colorIndex: number): string {
  const i = ((Math.trunc(colorIndex) % 20) + 20) % 20;
  return `var(--subject-${i})`;
}

export interface MiniTimelinePiece {
  /** 순공 · 자동 멈춤 · 일시정지 — 공부 결과 화면의 타임라인과 같은 구분이다. */
  kind: "focus" | "distract" | "pause";
  /** 세션 시각 범위에 대한 비율(0~1). 조각들의 합은 1이다. */
  ratio: number;
}

/**
 * 세션 행의 미니 타임라인 — 세션 시각 범위를 순공과 이벤트 조각으로 순서대로 자른다.
 * 공부 결과 화면의 타임라인과 같은 데이터(세션의 `events`)를 쓴다.
 */
export function miniTimelinePieces(session: TimetableSession): MiniTimelinePiece[] {
  const startMs = Date.parse(session.startedAt);
  const endMs = Date.parse(session.endedAt);
  const spanMs = endMs - startMs;
  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    return [];
  }
  const pieces: MiniTimelinePiece[] = [];
  const push = (kind: MiniTimelinePiece["kind"], fromMs: number, toMs: number) => {
    if (toMs > fromMs) {
      pieces.push({ kind, ratio: (toMs - fromMs) / spanMs });
    }
  };
  let cursor = startMs;
  const events = [...(session.events ?? [])].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  for (const event of events) {
    // 범위 밖이나 겹친 이벤트가 와도 막대가 깨지지 않게 세션 안으로 자르고 커서 뒤로는 가지 않는다.
    const eventStart = Math.min(endMs, Math.max(cursor, Date.parse(event.startedAt)));
    const eventEnd = Math.min(endMs, Math.max(cursor, Date.parse(event.endedAt)));
    if (Number.isNaN(eventStart) || Number.isNaN(eventEnd)) {
      continue;
    }
    push("focus", cursor, eventStart);
    push(event.status === "PAUSE" ? "pause" : "distract", eventStart, eventEnd);
    cursor = Math.max(cursor, eventEnd);
  }
  push("focus", cursor, endMs);
  return pieces;
}
