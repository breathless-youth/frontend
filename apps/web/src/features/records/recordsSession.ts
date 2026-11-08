import type { PersonalRecordSummary, StudySessionSummary } from "@focusmakers/types";

export type RecordsSession = PersonalRecordSummary | StudySessionSummary;

export function recordDisplayKey(session: RecordsSession): string {
  return "displayKey" in session ? session.displayKey : String(session.id);
}
