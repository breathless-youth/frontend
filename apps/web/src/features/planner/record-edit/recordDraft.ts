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
  const minuteTicks = 60_000_000_000n;
  const occupied = draft.blocks
    .map((block) => ({
      start: recordBlockTimeOrder(draft, block, "start"),
      end: recordBlockTimeOrder(draft, block, "end"),
    }))
    .filter((span) => span.end > span.start)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  let startMs = draft.startMs;
  for (const span of occupied) {
    if (startMs + 60000 <= until && recordTimeOrder(undefined, startMs + 60000) <= span.start)
      return { startMs, endMs: startMs + 60000 };
    const endMinute = span.end / minuteTicks + (span.end % minuteTicks > 0n ? 1n : 0n);
    startMs = Math.max(startMs, Number(endMinute) * 60000);
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
  return orderRecordOperations(operations, draft);
}

/** 서버는 각 작업을 따로 검증하므로 다른 기록의 원래 구간을 먼저 비운다. */
function orderRecordOperations(
  operations: RecordDraftOperation[],
  draft: RecordDraftState,
): RecordDraftOperation[] {
  const remaining = [...operations];
  const ordered: RecordDraftOperation[] = [];
  const dependencies = new Map(
    operations.map((operation) => {
      return [
        operation,
        operation.action === "DELETE"
          ? []
          : operations.filter((other) => {
              if (other.blockId === operation.blockId) return false;
              const occupied = draft.baseline.get(other.blockId);
              if (!occupied) return false;
              const final = draft.blocks.find((block) => block.id === operation.blockId)!;
              const before = draft.baseline.get(operation.blockId);
              const start = recordTimeOrder(
                operation.startedAt ?? before?.preciseStartedAt,
                final.startMs,
              );
              const end = recordTimeOrder(operation.endedAt ?? before?.preciseEndedAt, final.endMs);
              const occupiedStart = recordTimeOrder(occupied.preciseStartedAt, occupied.startMs);
              const occupiedEnd = recordTimeOrder(occupied.preciseEndedAt, occupied.endMs);
              return occupiedStart < end && occupiedEnd > start;
            }),
      ] as const;
    }),
  );
  while (remaining.length > 0) {
    const index = remaining.findIndex((operation) =>
      dependencies.get(operation)!.every((dependency) => !remaining.includes(dependency)),
    );
    // 서로 자리를 맞바꾸는 순환은 순서만으로 풀 수 없다. 기존 부분 성공 계약을 유지한다.
    if (index === -1) return [...ordered, ...remaining];
    ordered.push(remaining.splice(index, 1)[0]!);
  }
  return ordered;
}
/** Date.parse가 버리는 소수 밀리초도 서버의 Instant 겹침 비교에 맞춰 보존한다. */
function recordTimeOrder(iso: string | null | undefined, fallbackMs: number): bigint {
  const ms = iso ? Date.parse(iso) : fallbackMs;
  const fraction = iso?.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1];
  const subMillisecond = fraction?.padEnd(9, "0").slice(3, 9) ?? "0";
  return BigInt(ms) * 1_000_000n + BigInt(subMillisecond);
}
/** 화면에 올림한 경계가 아니라 다음 저장 요청이 실제로 보내는 경계를 비교한다. */
function recordBlockTimeOrder(
  draft: RecordDraftState,
  block: Pick<RecordDraftBlock, "id" | "startMs" | "endMs">,
  edge: "start" | "end",
): bigint {
  const before = draft.baseline.get(block.id);
  const field = edge === "start" ? "startMs" : "endMs";
  const precise = edge === "start" ? before?.preciseStartedAt : before?.preciseEndedAt;
  return recordTimeOrder(before?.[field] === block[field] ? precise : undefined, block[field]);
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
  if (
    !Number.isFinite(span.startMs) ||
    !Number.isFinite(span.endMs) ||
    (span.startMs < draft.startMs && !(original && original.startMs < draft.startMs)) ||
    (span.endMs > draft.endMs && !(original && original.endMs > draft.endMs))
  )
    throw new RecordDraftError("range");
  const actualStart = recordBlockTimeOrder(draft, span, "start");
  const actualEnd = recordBlockTimeOrder(draft, span, "end");
  if (actualEnd - actualStart < 60_000_000_000n || actualEnd - actualStart > 86_400_000_000_000n)
    throw new RecordDraftError("range");
  if (actualEnd > recordTimeOrder(undefined, nowMs)) throw new RecordDraftError("future");
  if (
    draft.blocks.some(
      (other) =>
        other.id !== span.id &&
        recordBlockTimeOrder(draft, other, "start") < actualEnd &&
        recordBlockTimeOrder(draft, other, "end") > actualStart,
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
