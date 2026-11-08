export type RecordDraftErrorCode =
  | "range"
  | "future"
  | "overlap"
  | "boundary"
  | "subject-required"
  | "subject-time-required"
  | "ambiguous-time"
  | "unavailable"
  | "range-limit";
export class RecordDraftError extends Error {
  readonly code: RecordDraftErrorCode;
  constructor(code: RecordDraftErrorCode) {
    super(code);
    this.code = code;
  }
}
