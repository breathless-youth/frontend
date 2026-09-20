import type { SubjectTimePayload } from "@focusmakers/types";

/**
 * 과목·할 일별 시간 파생 — 순수 함수.
 *
 * **별도 타이머가 없다.** 세션 타이머(`studySec`/`focusSec`)가 유일한 원천이고, 항목을 고른
 * 시점의 값을 기억해 두었다가 다음 전환·스냅샷·제출 때 그 차이를 그 항목에 얹는다. 그래서
 * 일시정지·비집중에서 세션 타이머가 멈추면 항목 시간도 저절로 멈춘다.
 *
 * 선택 없이 흐른 시간은 어느 항목에도 쌓이지 않는다(과목 없는 시간 — 스펙 §4).
 */

export interface SubjectSelection {
  readonly subjectId: number;
  /** 과목만 골랐으면 null. */
  readonly taskId: number | null;
}

interface SessionTotalsLike {
  readonly studySec: number;
  readonly focusSec: number;
}

export interface SubjectTimeTracker {
  /** 이미 확정된 구간의 합. 같은 항목을 여러 번 골랐어도 항목당 한 건이다. */
  readonly entries: readonly SubjectTimePayload[];
  /** 지금 고른 항목과, 골랐을 때의 세션 타이머 값. */
  readonly current: {
    readonly selection: SubjectSelection;
    readonly since: SessionTotalsLike;
  } | null;
}

export function subjectTimeKey(selection: SubjectSelection): string {
  return `${selection.subjectId}:${selection.taskId ?? ""}`;
}

function sameSelection(a: SubjectSelection | null, b: SubjectSelection | null): boolean {
  return a?.subjectId === b?.subjectId && (a?.taskId ?? null) === (b?.taskId ?? null);
}

function addEntry(
  entries: readonly SubjectTimePayload[],
  next: SubjectTimePayload,
): SubjectTimePayload[] {
  const key = subjectTimeKey(next);
  const index = entries.findIndex((entry) => subjectTimeKey(entry) === key);
  if (index === -1) {
    return [...entries, next];
  }
  const merged = {
    ...entries[index]!,
    studySec: entries[index]!.studySec + next.studySec,
    focusSec: entries[index]!.focusSec + next.focusSec,
  };
  // 마지막 항목이 "지금 선택"이라는 복원 규약을 지키려고 합친 항목을 끝으로 보낸다.
  return [...entries.slice(0, index), ...entries.slice(index + 1), merged];
}

/**
 * 시작 상태. 복원이면 서버가 준 항목 시간을 그대로 물려받고 **마지막 항목을 지금 선택으로**
 * 되살린다 — 스냅샷 계약에 "마지막 선택" 필드가 따로 없어 배열 순서가 그 역할을 한다
 * (`materializeSubjectTimes`가 현재 선택을 항상 끝에 둔다). `base`는 복원 시점의 누적
 * 타이머 값이라 여기서부터의 차이만 그 항목에 얹힌다.
 */
export function createSubjectTimeTracker(
  restored: readonly SubjectTimePayload[] = [],
  base: SessionTotalsLike = { studySec: 0, focusSec: 0 },
): SubjectTimeTracker {
  const last = restored[restored.length - 1];
  return {
    entries: restored.reduce<SubjectTimePayload[]>((acc, entry) => addEntry(acc, entry), []),
    current:
      last === undefined
        ? null
        : { selection: { subjectId: last.subjectId, taskId: last.taskId ?? null }, since: base },
  };
}

/** 지금 선택 구간을 `totals` 시점에서 닫아 확정 목록에 얹는다. */
function settle(tracker: SubjectTimeTracker, totals: SessionTotalsLike): SubjectTimePayload[] {
  if (tracker.current === null) {
    return [...tracker.entries];
  }
  const { selection, since } = tracker.current;
  const studySec = Math.max(0, totals.studySec - since.studySec);
  return addEntry(tracker.entries, {
    subjectId: selection.subjectId,
    taskId: selection.taskId,
    studySec,
    focusSec: Math.min(studySec, Math.max(0, totals.focusSec - since.focusSec)),
  });
}

/**
 * 항목을 고른다(`null`이면 선택 해제). 같은 항목을 다시 고르면 아무 일도 없다 — 구간을 끊어
 * 다시 열어도 합은 같지만 참조가 바뀌어 불필요한 리렌더가 난다.
 */
export function selectSubjectTime(
  tracker: SubjectTimeTracker,
  next: SubjectSelection | null,
  totals: SessionTotalsLike,
): SubjectTimeTracker {
  if (sameSelection(tracker.current?.selection ?? null, next)) {
    return tracker;
  }
  return {
    entries: settle(tracker, totals),
    current: next === null ? null : { selection: next, since: totals },
  };
}

/**
 * 서버로 보낼 항목 시간 — 확정 구간 + 지금 선택 구간의 `totals` 시점 차이. 둘 다 0인 항목은
 * 빼되, **지금 선택 항목은 0이어도 남긴다** — 복원 시 마지막 항목으로 선택을 되살리기 때문이다.
 */
export function materializeSubjectTimes(
  tracker: SubjectTimeTracker,
  totals: SessionTotalsLike,
): SubjectTimePayload[] {
  const currentKey = tracker.current === null ? null : subjectTimeKey(tracker.current.selection);
  return settle(tracker, totals).filter(
    (entry) => entry.studySec > 0 || entry.focusSec > 0 || subjectTimeKey(entry) === currentKey,
  );
}

/** 화면 표시용 — 이 세션에서 해당 과목(할 일 없으면 과목 전체)에 쌓인 시간. */
export function liveSubjectTime(
  times: readonly SubjectTimePayload[],
  subjectId: number,
  taskId: number | null,
): SessionTotalsLike {
  return times.reduce(
    (sum, entry) =>
      entry.subjectId === subjectId && (taskId === null || entry.taskId === taskId)
        ? { studySec: sum.studySec + entry.studySec, focusSec: sum.focusSec + entry.focusSec }
        : sum,
    { studySec: 0, focusSec: 0 },
  );
}
