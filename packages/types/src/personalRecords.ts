import type {
  CompletedTaskResponse,
  DaySubject,
  StatusEventPayload,
  StudySessionListResponse,
  StudySessionSource,
  StudySessionSummary,
} from "./index";
import type { PlannerRecordSegment } from "./planner";

/** 서버 PersonalRecordSummaryResponse의 자정 날짜별 개인 기록 조각. */
export interface PersonalRecordSummary extends Omit<StudySessionSummary, "id"> {
  displayKey: string;
  recordKey: string;
  originalSessionId: number | null;
  edited: boolean;
  fullStartedAt: string;
  fullEndedAt: string;
  events: StatusEventPayload[];
  subjectSegments: PlannerRecordSegment[];
  completedTasks: CompletedTaskResponse[];
  source: StudySessionSource;
  submissionStartedAt: string;
}

/** GET /api/planner/records/stats의 개인 일간 목록과 합계. */
export interface PersonalRecordListResponse extends Omit<StudySessionListResponse, "sessions"> {
  sessions: PersonalRecordSummary[];
  subjects: DaySubject[];
}
