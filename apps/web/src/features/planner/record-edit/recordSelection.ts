import { recordPieceMinutes } from "../recordMinutes";
import type { RecordDraftBlock, RecordDraftState } from "./recordDraft";
import { recordDraftPieces } from "./recordDraft";
import { RecordDraftError } from "./recordError";
import { recordRangeCoverageSec, supportsRecordRanges } from "./recordRanges";

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
  const minute =
    minutes.find((item) => atMs !== undefined && atMs >= item.startMs && atMs < item.endMs) ??
    minutes[0];
  return minute ? { kind: "range", id, startMs: minute.startMs, endMs: minute.endMs } : null;
}

export function resizeRecordSelection(
  draft: RecordDraftState,
  selection: Extract<RecordSelection, { kind: "range" }>,
  patch: { startMs?: number; endMs?: number },
): RecordSelection {
  const next = { ...selection, ...patch };
  const block = draft.blocks.find((value) => value.id === selection.id)!;
  if (
    !Number.isFinite(next.startMs) ||
    !Number.isFinite(next.endMs) ||
    next.startMs % 60000 !== 0 ||
    next.endMs % 60000 !== 0 ||
    next.endMs - next.startMs < 60000 ||
    next.startMs < draft.startMs ||
    next.endMs > draft.endMs ||
    recordRangeCoverageSec(recordDraftPieces(block)!, next.startMs, next.endMs) === 0
  )
    throw new RecordDraftError("range");
  return next;
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
