import { recordPieceMinutes } from "../recordMinutes";
import type { RecordDraftBlock, RecordDraftState } from "./recordDraft";
import { occupiedSpans, recordDraftPieces, stageRecordRange } from "./recordDraft";
import { recordTimeOrder } from "../recordTime";
import type { PlannerRecordRange } from "@focusmakers/types";
import { RecordDraftError } from "./recordError";
import { supportsRecordRanges } from "./recordRanges";

export type RecordSelection =
  | { kind: "range"; id: string; startMs: number; endMs: number }
  | { kind: "draft"; id: string }
  | { kind: "unavailable"; id: string };

export function selectRecordBlock(
  draft: RecordDraftState,
  id: string,
  atMs?: number,
): RecordSelection | null {
  const block = draft.blocks.find((value) => value.id === id);
  if (!block) return null;
  if (block.key === null) return { kind: "draft", id };
  if (!supportsRecordRanges(block.original)) return { kind: "unavailable", id };
  const minutes = recordPieceMinutes(recordDraftPieces(block)!, draft);
  const index = Math.max(
    0,
    minutes.findIndex((item) => atMs !== undefined && atMs >= item.startMs && atMs < item.endMs),
  );
  const minute = minutes[index];
  if (!minute) return null;
  // 같은 과목이 끊김 없이 이어진 분을 한 블록으로 고른다.
  let first = index,
    last = index;
  const joins = (a: number, b: number) =>
    minutes[a]!.endMs === minutes[b]!.startMs && minutes[a]!.subjectId === minutes[b]!.subjectId;
  while (first > 0 && joins(first - 1, first)) first--;
  while (last < minutes.length - 1 && joins(last, last + 1)) last++;
  return { kind: "range", id, startMs: minutes[first]!.startMs, endMs: minutes[last]!.endMs };
}

/**
 * 선택한 과목 블록의 실제 시간 변경
 *
 * 줄인 분은 DELETE, 늘린 분은 그 과목의 ADD로 부모 기록의 범위 편집에 쌓는다.
 * 늘린 자리에 같은 기록의 다른 과목이나 다른 기록이 있으면 덮어쓰지 않고 overlap으로 거절한다.
 */
export function resizeRecordBlock(
  draft: RecordDraftState,
  selection: Extract<RecordSelection, { kind: "range" }>,
  patch: { startMs?: number; endMs?: number },
  nowMs: number,
): { draft: RecordDraftState; selection: Extract<RecordSelection, { kind: "range" }> } {
  const next = { ...selection, ...patch };
  if (
    !Number.isFinite(next.startMs) ||
    !Number.isFinite(next.endMs) ||
    next.startMs % 60000 !== 0 ||
    next.endMs % 60000 !== 0 ||
    next.endMs - next.startMs < 60000 ||
    next.startMs < draft.startMs ||
    next.endMs > draft.endMs
  )
    throw new RecordDraftError("range");
  if (next.endMs > selection.endMs && next.endMs > nowMs) throw new RecordDraftError("future");
  const { subjectId } = selectedRecordBlock(draft, selection)!;
  const iso = (ms: number) => new Date(ms).toISOString();
  const grown = [
    ...(next.startMs < selection.startMs ? [[next.startMs, selection.startMs] as const] : []),
    ...(next.endMs > selection.endMs ? [[selection.endMs, next.endMs] as const] : []),
  ];
  for (const [from, to] of grown) {
    const start = recordTimeOrder(undefined, from),
      end = recordTimeOrder(undefined, to);
    if (
      draft.blocks.some((block) =>
        occupiedSpans(draft, block).some((span) => span.start < end && span.end > start),
      )
    )
      throw new RecordDraftError("overlap");
  }
  const changes: PlannerRecordRange[] = [
    ...(next.startMs > selection.startMs
      ? [
          {
            startedAt: iso(selection.startMs),
            endedAt: iso(next.startMs),
            change: "DELETE" as const,
          },
        ]
      : []),
    ...(next.endMs < selection.endMs
      ? [{ startedAt: iso(next.endMs), endedAt: iso(selection.endMs), change: "DELETE" as const }]
      : []),
    ...grown.map(([from, to]) => ({
      startedAt: iso(from),
      endedAt: iso(to),
      change: "ADD" as const,
      subjectId,
    })),
  ];
  return {
    draft: changes.reduce((value, range) => stageRecordRange(value, selection.id, range), draft),
    selection: next,
  };
}

/** 패널·핸들의 표시 모델이다. 서버에 저장할 부모 초안을 복제하거나 시각을 수정하지 않는다. */
export function selectedRecordBlock(
  draft: RecordDraftState,
  selection: RecordSelection | null,
): RecordDraftBlock | undefined {
  const block = draft.blocks.find((value) => value.id === selection?.id);
  if (!block || !selection) return undefined;
  if (selection.kind === "unavailable") return { ...block, locked: true };
  if (selection.kind === "draft") return block;
  const minutes = recordPieceMinutes(recordDraftPieces(block)!, selection);
  const ids = [...new Set(minutes.map((minute) => minute.subjectId))];
  return {
    ...block,
    startMs: selection.startMs,
    endMs: selection.endMs,
    preciseStartedAt: undefined,
    preciseEndedAt: undefined,
    subjectId: ids.length === 1 ? ids[0]! : null,
    subjectIds: ids.filter((id): id is number => id !== null),
    mixed: ids.length > 1,
    subjectScopeUnknown: false,
    locked: false,
  };
}
