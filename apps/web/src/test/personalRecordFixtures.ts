import type { PersonalRecordListResponse, PersonalRecordSummary } from "@focusmakers/types";

export function personalRecord(
  overrides: Partial<PersonalRecordSummary> = {},
): PersonalRecordSummary {
  return {
    displayKey: "manual:2026-11-07:0",
    recordKey: "m:2026-11-07T00:00:00Z",
    originalSessionId: null,
    edited: true,
    statDate: "2026-11-07",
    startedAt: "2026-11-07T00:00:00Z",
    endedAt: "2026-11-07T01:00:00Z",
    fullStartedAt: "2026-11-07T00:00:00Z",
    fullEndedAt: "2026-11-07T01:00:00Z",
    studySec: 3600,
    focusSec: 3600,
    focusRate: 100,
    eventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, SLEEP: 0, PAUSE: 0 },
    events: [],
    subjectSegments: [],
    completedTasks: [],
    source: "MANUAL",
    submissionStartedAt: "2026-11-07T00:00:00Z",
    ...overrides,
  };
}

export function personalRecordStats(
  overrides: Partial<PersonalRecordListResponse> = {},
): PersonalRecordListResponse {
  return {
    sessions: [],
    sessionCount: 0,
    totalStudySec: 0,
    totalFocusSec: 0,
    longestFocusSec: 0,
    focusRate: 0,
    totalEventCounts: { PHONE: 0, DEVICE: 0, AWAY: 0, SLEEP: 0, PAUSE: 0 },
    studiedDatesInMonth: [],
    subjects: [],
    ...overrides,
  };
}
