/** 개인 플래너 응답. 기존 통계의 측정 원본과 구분한다. */
export interface PlannerDayResponse {
  date: string;
  timeZone: string;
  studySec: number;
  focusSec: number;
  goal: PlannerGoalResponse;
  subjects: PlannerDaySubject[];
  records: PlannerRecordView[];
}

export interface PlannerDaySubject {
  id: number;
  name: string;
  colorIndex: number;
  deleted: boolean;
  selected: boolean;
  studySec: number;
  focusSec: number;
  tasks: PlannerTask[];
}

export interface PlannerTask {
  key: string;
  /** 가상 반복 회차는 실체화하기 전까지 null이다. */
  taskId: number | null;
  subjectId: number;
  name: string;
  date: string;
  done: boolean;
  doneAt: string | null;
  seriesId: number | null;
  occurrenceDate: string | null;
  dismissed: boolean;
}

export interface PlannerGoalResponse {
  goalSec: number | null;
  individualGoalSec: number | null;
  defaultGoalSec: number | null;
}

export interface PlannerRecordView {
  key: string;
  source: "MEASURED" | "MANUAL";
  startedAt: string;
  endedAt: string;
  /** 현재 개인 기록의 전체 구간. 보완 계약 이전 응답에는 없을 수 있다. */
  fullStartedAt?: string;
  fullEndedAt?: string;
  studySec: number;
  focusSec: number;
  subjectSegments: PlannerRecordSegment[];
}

export interface PlannerRecordSegment {
  subjectId: number;
  startedAt: string;
  endedAt: string;
  studySec: number;
  focusSec: number;
}

export interface PlannerDaySummary {
  date: string;
  taskCount: number;
  completedCount: number;
  studySec: number;
  focusSec: number;
  studied: boolean;
  hasTasks: boolean;
  goalSec: number | null;
}

export type PlannerTaskScope = "THIS" | "FUTURE";
export type PlannerWeekday =
  "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY";

export interface PlannerRepeatRequest {
  weekdays: PlannerWeekday[];
  endDate?: string | null;
}

export interface PlannerTaskRepeatResponse {
  seriesId: number | null;
  startDate: string | null;
  weekdays: PlannerWeekday[];
  endDate: string | null;
}

export interface PlannerTaskCreateRequest {
  subjectId: number;
  date: string;
  name: string;
  repeat?: PlannerRepeatRequest | null;
}

export interface PlannerTaskUpdateRequest {
  name?: string | null;
  done?: boolean | null;
  scope?: PlannerTaskScope | null;
}

export interface PlannerTaskMoveRequest {
  date: string;
}

export interface PlannerSubjectOrderRequest {
  subjectIds: number[];
}

export interface PlannerGoalRequest {
  goalSec: number;
}
export interface PlannerDefaultGoalResponse {
  goalSec: number | null;
}
export interface PlannerCarryRequest {
  offeredKeys: string[];
  selectedKeys: string[];
}
export interface PlannerRecordOperation {
  operationId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  key?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  subjectId?: number | null;
  timeZone?: string | null;
}
export interface PlannerRecordResult {
  operationId: string | null;
  success: boolean;
  key: string | null;
  status: number;
  code: string | null;
  message: string | null;
}
export interface PlannerRecordBatchRequest {
  operations: PlannerRecordOperation[];
}
export interface PlannerRecordBatchResponse {
  results: PlannerRecordResult[];
}
