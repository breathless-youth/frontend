import type {
  SubjectCreateRequest,
  SubjectResponse,
  SubjectUpdateRequest,
  TaskCreateRequest,
  TaskResponse,
  TaskUpdateRequest,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/**
 * 과목 > 할 일 CRUD (`/api/subjects`).
 *
 * 토큰 계약(API-Version 2) 전용이라 버전을 직접 박는다 — 토큰 없는 구 앱·브라우저 단독에서는
 * 서버에 경로가 없어 실패하고, 호출부가 토스트로 알린다(세션 자체는 그대로 진행된다).
 */
const HEADERS = { "Content-Type": "application/json", "API-Version": "2" };

async function send<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}/api/subjects${path}`, { ...init, headers: HEADERS });
  if (!res.ok) {
    throw await parseApiError(res, fallback);
  }
  // 204(삭제)는 본문이 없다.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function listSubjects(): Promise<SubjectResponse[]> {
  return send("", { method: "GET" }, "과목 조회 실패");
}

export function createSubject(body: SubjectCreateRequest): Promise<SubjectResponse> {
  return send("", { method: "POST", body: JSON.stringify(body) }, "과목 추가 실패");
}

export function renameSubject(id: number, body: SubjectUpdateRequest): Promise<SubjectResponse> {
  return send(`/${id}`, { method: "PATCH", body: JSON.stringify(body) }, "과목 이름 변경 실패");
}

export function deleteSubject(id: number): Promise<void> {
  return send(`/${id}`, { method: "DELETE" }, "과목 삭제 실패");
}

export function createTask(subjectId: number, body: TaskCreateRequest): Promise<TaskResponse> {
  return send(
    `/${subjectId}/tasks`,
    { method: "POST", body: JSON.stringify(body) },
    "할 일 추가 실패",
  );
}

export function updateTask(
  subjectId: number,
  taskId: number,
  body: TaskUpdateRequest,
): Promise<TaskResponse> {
  return send(
    `/${subjectId}/tasks/${taskId}`,
    { method: "PATCH", body: JSON.stringify(body) },
    "할 일 변경 실패",
  );
}

export function deleteTask(subjectId: number, taskId: number): Promise<void> {
  return send(`/${subjectId}/tasks/${taskId}`, { method: "DELETE" }, "할 일 삭제 실패");
}
