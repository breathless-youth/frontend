import type { PlannerRecordResult } from "@focusmakers/types";
import { getTokenSource } from "@/lib/auth/tokenSource";
import { batchPlannerRecords, type PlannerRequestOptions } from "@/lib/plannerApi";
import type { RecordDraftOperation, RecordDraftState } from "./recordDraft";
export interface RecordSaveOutcome {
  confirmed: { operation: RecordDraftOperation; result: PlannerRecordResult }[];
  pending: RecordDraftOperation[];
  uncertain: boolean;
}
export type RecordSaveFailure =
  "unconfirmed" | "conflict" | "invalid" | "missing" | "server" | "unknown";
export function recordSaveFailure(outcome: RecordSaveOutcome): RecordSaveFailure | null {
  if (outcome.uncertain) return "unconfirmed";
  const failure = outcome.confirmed.find(({ result }) => !result.success)?.result;
  if (!failure) return outcome.pending.length ? "unknown" : null;
  if (failure.status === 409) return "conflict";
  if (failure.status === 400) return "invalid";
  if (failure.status === 404) return "missing";
  if (failure.status >= 500) return "server";
  return "unknown";
}
export async function saveRecordDraft(
  operations: readonly RecordDraftOperation[],
  options: PlannerRequestOptions & { ownerId?: number | null },
): Promise<RecordSaveOutcome> {
  const outcome: RecordSaveOutcome = { confirmed: [], pending: [], uncertain: false };
  const source = getTokenSource();
  const owner = source?.getUserId();
  const controller = new AbortController();
  const abort = () => controller.abort();
  const unsubscribe = source?.subscribe((snapshot) => {
    if (snapshot.userId !== owner) abort();
  });
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const checkOwner = () => {
    if (
      controller.signal.aborted ||
      getTokenSource() !== source ||
      (source !== null &&
        (owner === null ||
          source.getUserId() !== owner ||
          (options.ownerId !== undefined && options.ownerId !== owner)))
    ) {
      abort();
      throw new DOMException("record save account changed or aborted", "AbortError");
    }
  };
  try {
    for (let start = 0; start < operations.length; start += 50) {
      const batch = operations.slice(start, start + 50);
      try {
        checkOwner();
        const response = await batchPlannerRecords(
          { operations: batch.map(({ blockId: _, ...operation }) => operation) },
          { ...options, signal: controller.signal },
        );
        for (const operation of batch) {
          const matches = response.results.filter(
            (result) => result.operationId === operation.operationId,
          );
          const result = matches.length === 1 ? matches[0] : undefined;
          if (!result || (result.success && operation.action !== "DELETE" && result.key === null)) {
            outcome.pending.push(operation);
            outcome.uncertain = true;
            continue;
          }
          outcome.confirmed.push({ operation, result });
          if (!result.success)
            outcome.pending.push({ ...operation, operationId: crypto.randomUUID() });
        }
      } catch {
        outcome.pending.push(...operations.slice(start));
        outcome.uncertain = true;
        break;
      }
    }
    return outcome;
  } finally {
    unsubscribe?.();
    options.signal?.removeEventListener("abort", abort);
  }
}
export function acceptSavedRecords(
  draft: RecordDraftState,
  outcome: RecordSaveOutcome,
): RecordDraftState {
  const baseline = new Map(draft.baseline);
  let blocks = [...draft.blocks];
  for (const { operation, result } of outcome.confirmed) {
    if (!result.success) continue;
    if (operation.action === "DELETE") {
      baseline.delete(operation.blockId);
      blocks = blocks.filter((block) => block.id !== operation.blockId);
      continue;
    }
    const current = blocks.find((block) => block.id === operation.blockId);
    if (!current) continue;
    const saved = {
      ...current,
      key: result.key,
      subjectChanged: false,
      edited: true,
      preciseStartedAt: operation.startedAt ?? current.preciseStartedAt,
      preciseEndedAt: operation.endedAt ?? current.preciseEndedAt,
      original: undefined,
    };
    baseline.set(current.id, saved);
    blocks = blocks.map((block) => (block.id === current.id ? saved : block));
  }
  return { ...draft, blocks, baseline };
}
