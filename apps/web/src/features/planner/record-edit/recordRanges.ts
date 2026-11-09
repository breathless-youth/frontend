import type { PlannerRecordPiece, PlannerRecordRange, PlannerRecordView } from "@focusmakers/types";
import { recordTimeOrder } from "../recordTime";
import { RecordDraftError } from "./recordError";

const order = (iso: string) => recordTimeOrder(iso, 0);
const validSubject = (id: number | null) => id === null || (Number.isSafeInteger(id) && id > 0);

/** 누락된 구계약과 손상된 신계약 모두 분 편집에서는 읽기 전용이다. */
export function supportsRecordRanges(record: PlannerRecordView | undefined): boolean {
  if (
    !record ||
    !Number.isSafeInteger(record.revision) ||
    record.revision! < 0 ||
    !Array.isArray(record.pieces)
  )
    return false;
  let previousEnd: bigint | undefined;
  for (const piece of record.pieces) {
    if (
      !piece ||
      !Number.isFinite(Date.parse(piece.startedAt)) ||
      !Number.isFinite(Date.parse(piece.endedAt)) ||
      !validSubject(piece.subjectId)
    )
      return false;
    const start = order(piece.startedAt),
      end = order(piece.endedAt);
    if (end <= start || (previousEnd !== undefined && start < previousEnd)) return false;
    previousEnd = end;
  }
  return true;
}

function validateRange(range: PlannerRecordRange) {
  const start = Date.parse(range.startedAt),
    end = Date.parse(range.endedAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start % 60000 !== 0 ||
    end % 60000 !== 0 ||
    order(range.startedAt) !== BigInt(start) * 1_000_000n ||
    order(range.endedAt) !== BigInt(end) * 1_000_000n ||
    end - start < 60000 ||
    (range.change !== "DELETE" && !validSubject(range.subjectId))
  )
    throw new RecordDraftError("range");
}
const sameChange = (a: PlannerRecordRange, b: PlannerRecordRange) =>
  a.change === b.change &&
  (a.change === "DELETE" || (b.change !== "DELETE" && a.subjectId === b.subjectId));

/** 뒤의 편집을 우선하며 서버에 보내기 전 겹침을 없앤다. */
export function normalizeRecordRanges(
  ranges: readonly PlannerRecordRange[],
  pieces?: readonly PlannerRecordPiece[],
): PlannerRecordRange[] {
  let result: PlannerRecordRange[] = [];
  for (const next of ranges) {
    validateRange(next);
    const start = order(next.startedAt),
      end = order(next.endedAt);
    // 늘린 시간(ADD) 위에 과목을 바꾸면 그 부분은 새 과목의 ADD로 남겨야 늘린 시간이 사라지지 않는다.
    const filled =
      next.change === "SUBJECT"
        ? result
            .filter(
              (previous) =>
                previous.change === "ADD" &&
                order(previous.startedAt) < end &&
                order(previous.endedAt) > start,
            )
            .map((previous) => ({
              startedAt: order(previous.startedAt) > start ? previous.startedAt : next.startedAt,
              endedAt: order(previous.endedAt) < end ? previous.endedAt : next.endedAt,
              change: "ADD" as const,
              subjectId: next.subjectId,
            }))
        : [];
    result = result.flatMap((previous) => {
      if (order(previous.endedAt) <= start || order(previous.startedAt) >= end) return [previous];
      return [
        ...(order(previous.startedAt) < start ? [{ ...previous, endedAt: next.startedAt }] : []),
        ...(order(previous.endedAt) > end ? [{ ...previous, startedAt: next.endedAt }] : []),
      ];
    });
    let rest: PlannerRecordRange[] = [next];
    for (const fill of filled)
      rest = rest.flatMap((part) =>
        order(part.endedAt) <= order(fill.startedAt) || order(part.startedAt) >= order(fill.endedAt)
          ? [part]
          : [
              ...(order(part.startedAt) < order(fill.startedAt)
                ? [{ ...part, endedAt: fill.startedAt }]
                : []),
              ...(order(part.endedAt) > order(fill.endedAt)
                ? [{ ...part, startedAt: fill.endedAt }]
                : []),
            ],
      );
    result.push(...rest, ...filled);
  }
  result.sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const merged: PlannerRecordRange[] = [];
  for (const range of result) {
    const previous = merged.at(-1);
    if (
      previous &&
      order(previous.endedAt) === order(range.startedAt) &&
      sameChange(previous, range)
    )
      previous.endedAt = range.endedAt;
    else merged.push({ ...range });
  }
  // 후속 편집으로 잘린 범위가 원래 삭제 공백에만 남으면 서버가 작업 전체를 stale로 거절한다.
  const occupied =
    pieces === undefined
      ? merged
      : merged.filter(
          (range) =>
            range.change === "ADD" ||
            pieces.some(
              (piece) =>
                order(piece.startedAt) < order(range.endedAt) &&
                order(piece.endedAt) > order(range.startedAt),
            ),
        );
  if (occupied.length > 100) throw new RecordDraftError("range-limit");
  return occupied;
}

/**
 * 원본 조각에 범위 편집을 적용한다.
 *
 * SUBJECT·DELETE는 원본 조각과의 교차에만 적용해 원본 ISO 경계와 삭제 공백을 보존한다.
 * ADD는 범위 전체를 그 과목 조각 하나로 바꿔 빈 시간도 채운다.
 */
export function applyRecordRanges(
  pieces: readonly PlannerRecordPiece[],
  ranges: readonly PlannerRecordRange[],
): PlannerRecordPiece[] {
  let result = pieces.map((piece) => ({ ...piece }));
  for (const range of ranges) {
    const start = order(range.startedAt),
      end = order(range.endedAt);
    result = result.flatMap((piece) => {
      const from = order(piece.startedAt),
        to = order(piece.endedAt);
      if (to <= start || from >= end) return [piece];
      return [
        ...(from < start ? [{ ...piece, endedAt: range.startedAt }] : []),
        ...(range.change === "SUBJECT"
          ? [
              {
                startedAt: from < start ? range.startedAt : piece.startedAt,
                endedAt: to > end ? range.endedAt : piece.endedAt,
                subjectId: range.subjectId,
              },
            ]
          : []),
        ...(to > end ? [{ ...piece, startedAt: range.endedAt }] : []),
      ];
    });
    if (range.change === "ADD") {
      result.push({
        startedAt: range.startedAt,
        endedAt: range.endedAt,
        subjectId: range.subjectId,
      });
      result.sort((a, b) =>
        order(a.startedAt) < order(b.startedAt)
          ? -1
          : order(a.startedAt) > order(b.startedAt)
            ? 1
            : 0,
      );
    }
  }
  return result;
}

/** 선택 패널의 실제 벽시계 길이 전용. 공부·순공 집계에는 사용하지 않는다. */
export function recordRangeCoverageSec(
  pieces: readonly PlannerRecordPiece[],
  fromMs: number,
  toMs: number,
): number {
  const start = recordTimeOrder(undefined, fromMs),
    end = recordTimeOrder(undefined, toMs);
  const total = pieces.reduce((sum, piece) => {
    const from = order(piece.startedAt) > start ? order(piece.startedAt) : start;
    const to = order(piece.endedAt) < end ? order(piece.endedAt) : end;
    return sum + (to > from ? to - from : 0n);
  }, 0n);
  return Number((total + 999_999_999n) / 1_000_000_000n);
}
