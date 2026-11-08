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
  /** 서버에 저장된 개인 수정본 여부. 보완 전 응답의 누락은 false로 처리한다. */
  edited?: boolean;
  startedAt: string;
  endedAt: string;
  /** 현재 개인 기록의 전체 구간. 보완 계약 이전 응답에는 없을 수 있다. */
  fullStartedAt?: string;
  fullEndedAt?: string;
  /** BY-1204 이전 응답에서는 누락될 수 있다. 0도 유효한 revision이다. */
  revision?: number;
  /** 조회 창 안의 실제 조각. 빈 배열과 필드 누락은 구분하며 빈 시간을 채우지 않는다. */
  pieces?: PlannerRecordPiece[];
  studySec: number;
  focusSec: number;
  subjectSegments: PlannerRecordSegment[];
}

export interface PlannerRecordPiece {
  startedAt: string;
  endedAt: string;
  subjectId: number | null;
}

export type PlannerRecordRange = {
  startedAt: string;
  endedAt: string;
} & ({ change: "SUBJECT"; subjectId: number | null } | { change: "DELETE" });

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
  action: "CREATE" | "UPDATE" | "DELETE" | "EDIT_RANGES";
  /** EDIT_RANGES에는 필수. 기존 UPDATE/DELETE에도 보내면 서버가 검사한다. */
  revision?: number;
  /** EDIT_RANGES 전용. 같은 부모의 변경은 한 작업에 모두 담는다. */
  ranges?: PlannerRecordRange[];
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
  revision?: number | null;
}
export interface PlannerRecordBatchRequest {
  operations: PlannerRecordOperation[];
}
export interface PlannerRecordBatchResponse {
  results: PlannerRecordResult[];
}
