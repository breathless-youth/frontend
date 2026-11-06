import type {
  PlannerDayResponse,
  PlannerRecordOperation,
  PlannerRecordView,
} from "@focusmakers/types";
import { plannerDayWindow } from "../plannerDay";
export interface RecordDraftState {
  dateKey: string;
  timeZone: string;
  startMs: number;
  endMs: number;
  blocks: RecordDraftBlock[];
  baseline: ReadonlyMap<string, RecordDraftBlock>;
}
export interface RecordDraftBlock {
  id: string;
  key: string | null;
  source: "MANUAL" | "MEASURED";
  startMs: number;
  endMs: number;
  subjectId: number | null;
  subjectIds: number[];
  mixed: boolean;
  subjectScopeUnknown?: boolean;
  locked: boolean;
  subjectChanged: boolean;
  preciseStartedAt?: string;
  preciseEndedAt?: string;
  original?: PlannerRecordView;
}
export type RecordDraftErrorCode =
  | "range"
  | "future"
  | "overlap"
  | "boundary"
  | "subject-required"
  | "subject-time-required"
  | "ambiguous-time";
export class RecordDraftError extends Error {
  readonly code: RecordDraftErrorCode;
  constructor(code: RecordDraftErrorCode) {
    super(code);
    this.code = code;
  }
}
export function createRecordDraft(day: PlannerDayResponse): RecordDraftState {
  const window = plannerDayWindow(day.date, day.timeZone);
  const blocks = day.records.map((record) => {
    const subjectIds = [...new Set(record.subjectSegments.map((segment) => segment.subjectId))];
    const covered = record.subjectSegments.reduce(
      (sum, segment) => sum + Date.parse(segment.endedAt) - Date.parse(segment.startedAt),
      0,
    );
    const fullStart = record.fullStartedAt;
    const fullEnd = record.fullEndedAt;
    const hasFull =
      !!fullStart &&
      !!fullEnd &&
      Number.isFinite(Date.parse(fullStart)) &&
      Number.isFinite(Date.parse(fullEnd)) &&
      Date.parse(fullStart) <= Date.parse(record.startedAt) &&
      Date.parse(fullEnd) >= Date.parse(record.endedAt);
    // 측정 기록은 날짜 창 밖의 과목 구간을 서버가 내려주지 않는다.
    const unknownSubjects =
      record.source === "MEASURED" &&
      hasFull &&
      (Date.parse(fullStart) < Date.parse(record.startedAt) ||
        Date.parse(fullEnd) > Date.parse(record.endedAt));
    const mixed =
      unknownSubjects ||
      subjectIds.length > 1 ||
      (subjectIds.length > 0 &&
        covered < Date.parse(record.endedAt) - Date.parse(record.startedAt));
    return {
      id: record.key,
      key: record.key,
      source: record.source,
      startMs: Math.ceil(Date.parse(hasFull ? fullStart : record.startedAt) / 60000) * 60000,
      endMs: Math.ceil(Date.parse(hasFull ? fullEnd : record.endedAt) / 60000) * 60000,
      subjectId: !mixed && subjectIds.length === 1 ? subjectIds[0]! : null,
      subjectIds,
      mixed,
      subjectScopeUnknown: unknownSubjects,
      locked:
        !hasFull &&
        (Date.parse(record.startedAt) <= window.startMs ||
          Date.parse(record.endedAt) >= window.endMs),
      subjectChanged: false,
      preciseStartedAt: hasFull ? fullStart : record.startedAt,
      preciseEndedAt: hasFull ? fullEnd : record.endedAt,
      original: record,
    };
  });
  return {
    dateKey: day.date,
    timeZone: day.timeZone,
    ...window,
    blocks,
    baseline: new Map(blocks.map((block) => [block.id, block])),
  };
}
export interface RecordDraftOperation extends PlannerRecordOperation {
  blockId: string;
}
/** 표시 시각의 분 올림과 별개로, 손대지 않은 시간 길이는 원본 초에서 한 번만 올림한다. */
export function recordDraftDurationSec(block: RecordDraftBlock): number {
  const start = block.preciseStartedAt;
  const end = block.preciseEndedAt;
  const unchanged =
    start &&
    end &&
    block.startMs === Math.ceil(Date.parse(start) / 60000) * 60000 &&
    block.endMs === Math.ceil(Date.parse(end) / 60000) * 60000;
  const span = unchanged ? Date.parse(end) - Date.parse(start) : block.endMs - block.startMs;
  return Math.ceil(span / 60000) * 60;
}
/** 포인터를 쓰지 않는 추가 경로도 기존 검증을 통과할 수 있는 첫 1분을 고른다. */
export function firstRecordDraftMinute(
  draft: RecordDraftState,
  nowMs: number,
): { startMs: number; endMs: number } | null {
  const until = Math.min(draft.endMs, Math.floor(nowMs / 60000) * 60000);
  let startMs = draft.startMs;
  for (const block of draft.blocks.toSorted((a, b) => a.startMs - b.startMs)) {
    if (startMs + 60000 <= Math.min(block.startMs, until))
      return { startMs, endMs: startMs + 60000 };
    startMs = Math.max(startMs, block.endMs);
  }
  return startMs + 60000 <= until ? { startMs, endMs: startMs + 60000 } : null;
}
export function recordDraftOperations(draft: RecordDraftState): RecordDraftOperation[] {
  const operations: RecordDraftOperation[] = [];
  for (const block of draft.baseline.values())
    if (!draft.blocks.some((value) => value.id === block.id) && block.key !== null)
      operations.push({
        blockId: block.id,
        operationId: crypto.randomUUID(),
        action: "DELETE",
        key: block.key,
      });
  for (const block of draft.blocks) {
    const original = draft.baseline.get(block.id);
    if (
      original &&
      original.startMs === block.startMs &&
      original.endMs === block.endMs &&
      !block.subjectChanged
    )
      continue;
    const timeChanged =
      !original || original.startMs !== block.startMs || original.endMs !== block.endMs;
    if (timeChanged && block.mixed && !block.subjectChanged)
      throw new RecordDraftError("subject-required");
    operations.push({
      blockId: block.id,
      operationId: crypto.randomUUID(),
      action: block.key === null ? "CREATE" : "UPDATE",
      ...(block.key === null ? {} : { key: block.key }),
      ...(timeChanged
        ? {
            startedAt:
              original?.preciseStartedAt && original.startMs === block.startMs
                ? original.preciseStartedAt
                : new Date(block.startMs).toISOString(),
            endedAt:
              original?.preciseEndedAt && original.endMs === block.endMs
                ? original.preciseEndedAt
                : new Date(block.endMs).toISOString(),
          }
        : {}),
      subjectId: block.subjectId,
      timeZone: draft.timeZone,
    });
  }
  return operations;
}
function checkedSpan(
  draft: RecordDraftState,
  block: { id: string; startMs: number; endMs: number },
  nowMs: number,
  original?: RecordDraftBlock,
) {
  const span = {
    ...block,
    startMs: Math.ceil(block.startMs / 60000) * 60000,
    endMs: Math.ceil(block.endMs / 60000) * 60000,
  };
  const actualStart =
    original?.startMs === span.startMs && original.preciseStartedAt
      ? Date.parse(original.preciseStartedAt)
      : span.startMs;
  const actualEnd =
    original?.endMs === span.endMs && original.preciseEndedAt
      ? Date.parse(original.preciseEndedAt)
      : span.endMs;
  if (
    !Number.isFinite(span.startMs) ||
    !Number.isFinite(span.endMs) ||
    (span.startMs < draft.startMs && !(original && original.startMs < draft.startMs)) ||
    (span.endMs > draft.endMs && !(original && original.endMs > draft.endMs)) ||
    actualEnd - actualStart < 60000 ||
    actualEnd - actualStart > 86400000
  )
    throw new RecordDraftError("range");
  if (actualEnd > nowMs) throw new RecordDraftError("future");
  if (
    draft.blocks.some(
      (other) => other.id !== span.id && other.startMs < span.endMs && other.endMs > span.startMs,
    )
  )
    throw new RecordDraftError("overlap");
  return span;
}
export function addRecordDraft(
  draft: RecordDraftState,
  block: { id: string; startMs: number; endMs: number; subjectId: number | null },
  nowMs: number,
): RecordDraftState {
  const checked = checkedSpan(draft, block, nowMs);
  return {
    ...draft,
    blocks: [
      ...draft.blocks,
      {
        ...block,
        ...checked,
        key: null,
        source: "MANUAL",
        subjectIds: block.subjectId === null ? [] : [block.subjectId],
        mixed: false,
        locked: false,
        subjectChanged: true,
      },
    ],
  };
}
export function changeRecordDraft(
  draft: RecordDraftState,
  id: string,
  patch: Partial<Pick<RecordDraftBlock, "startMs" | "endMs" | "subjectId">>,
  nowMs: number,
): RecordDraftState {
  const block = draft.blocks.find((value) => value.id === id);
  if (!block) return draft;
  if (block.locked) throw new RecordDraftError("boundary");
  const changed = { ...block, ...patch };
  const subjectChanged =
    block.subjectChanged ||
    ("subjectId" in patch && (patch.subjectId !== block.subjectId || block.mixed));
  if (
    block.mixed &&
    !subjectChanged &&
    ((patch.startMs !== undefined && patch.startMs !== block.startMs) ||
      (patch.endMs !== undefined && patch.endMs !== block.endMs))
  )
    throw new RecordDraftError("subject-required");
  const timeChanged = changed.startMs !== block.startMs || changed.endMs !== block.endMs;
  const checked = timeChanged
    ? checkedSpan(draft, changed, nowMs, draft.baseline.get(id))
    : changed;
  return {
    ...draft,
    blocks: draft.blocks.map((value) =>
      value.id === id
        ? {
            ...changed,
            ...checked,
            subjectChanged,
            ...(subjectChanged
              ? { subjectIds: changed.subjectId === null ? [] : [changed.subjectId], mixed: false }
              : {}),
          }
        : value,
    ),
  };
}
export function deleteRecordDraft(draft: RecordDraftState, id: string): RecordDraftState {
  if (draft.blocks.find((block) => block.id === id)?.locked) throw new RecordDraftError("boundary");
  return { ...draft, blocks: draft.blocks.filter((block) => block.id !== id) };
}
