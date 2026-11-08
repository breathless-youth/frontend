import type { PlannerRecordPiece } from "@focusmakers/types";
import { recordTimeOrder } from "../recordTime";
import type { RecordDraftBlock, RecordDraftState } from "./recordDraft";
import { supportsRecordRanges } from "./recordRanges";

const order = (iso: string) => recordTimeOrder(iso, 0);

function originalSpan(block: RecordDraftBlock) {
  const original = block.original!;
  const fullStart = original.fullStartedAt,
    fullEnd = original.fullEndedAt;
  const complete =
    !!fullStart &&
    !!fullEnd &&
    Number.isFinite(Date.parse(fullStart)) &&
    Number.isFinite(Date.parse(fullEnd)) &&
    order(fullStart) <= order(original.startedAt) &&
    order(fullEnd) >= order(original.endedAt);
  return {
    start: complete ? fullStart : original.startedAt,
    end: complete ? fullEnd : original.endedAt,
    complete,
  };
}

export function hasRecordTimeChanges(block: RecordDraftBlock): boolean {
  const original = block.original;
  if (!original) return false;
  const span = originalSpan(block);
  return (
    !!original &&
    (block.startMs !== Math.ceil(Date.parse(span.start) / 60000) * 60000 ||
      block.endMs !== Math.ceil(Date.parse(span.end) / 60000) * 60000)
  );
}

/** UPDATE는 모든 조각의 과목을 다시 칠하므로 부모 전체가 보이는 단일 과목만 허용한다. */
export function recordTimeEditBlock(
  draft: RecordDraftState,
  id: string,
): RecordDraftBlock | undefined {
  const block = draft.blocks.find((value) => value.id === id);
  if (!block?.key || block.locked || block.ranges?.length || !supportsRecordRanges(block.original))
    return;
  const original = block.original!;
  const span = originalSpan(block);
  if (
    !span.complete ||
    order(span.start) < recordTimeOrder(undefined, draft.startMs) ||
    order(span.end) > recordTimeOrder(undefined, draft.endMs)
  )
    return;
  const subjects = [...new Set(original.pieces!.map((piece) => piece.subjectId))];
  if (subjects.length !== 1) return;
  const subjectId = subjects[0]!;
  return {
    ...block,
    subjectId,
    subjectIds: subjectId === null ? [] : [subjectId],
    mixed: false,
    subjectScopeUnknown: false,
  };
}

/** BE UPDATE와 같이 실제 조각을 자르고 부모 바깥 확장만 추가해 삭제 빈칸을 보존한다. */
export function recordTimePreviewPieces(block: RecordDraftBlock): PlannerRecordPiece[] {
  const original = block.original!;
  const pieces = original.pieces!;
  if (!hasRecordTimeChanges(block)) return pieces;
  const edge = (iso: string | undefined, ms: number) =>
    iso && Math.ceil(Date.parse(iso) / 60000) * 60000 === ms ? iso : new Date(ms).toISOString();
  const from = edge(block.preciseStartedAt, block.startMs),
    to = edge(block.preciseEndedAt, block.endMs);
  const span = originalSpan(block);
  const fullFrom = span.start,
    fullTo = span.end;
  const result = pieces.flatMap((piece) => {
    const startedAt = order(piece.startedAt) > order(from) ? piece.startedAt : from;
    const endedAt = order(piece.endedAt) < order(to) ? piece.endedAt : to;
    return order(startedAt) < order(endedAt)
      ? [{ ...piece, startedAt, endedAt, subjectId: block.subjectId }]
      : [];
  });
  if (order(from) < order(fullFrom))
    result.push({
      startedAt: from,
      endedAt: order(to) < order(fullFrom) ? to : fullFrom,
      subjectId: block.subjectId,
    });
  if (order(to) > order(fullTo))
    result.push({
      startedAt: order(from) > order(fullTo) ? from : fullTo,
      endedAt: to,
      subjectId: block.subjectId,
    });
  return result.sort((a, b) =>
    order(a.startedAt) < order(b.startedAt) ? -1 : order(a.startedAt) > order(b.startedAt) ? 1 : 0,
  );
}
