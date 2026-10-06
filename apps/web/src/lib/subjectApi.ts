import type {
  SubjectCreateRequest,
  SubjectOrderRequest,
  SubjectResponse,
  SubjectUpdateRequest,
  TaskCreateRequest,
  TaskResponse,
  TaskUpdateRequest,
} from "@focusmakers/types";

import { API_BASE_URL, apiFetch, parseApiError } from "./api";

/**
 * 과목 > 할 일 CRUD (`/api/subjects`). 구 앱 계약이 없는 새 경로라 구 방식 분기가 없다.
 *
 * 인증은 토큰이 필요하다. 토큰이 없는 브라우저 단독에서는 401로 실패하고 호출부가 토스트로
 * 알린다(세션 자체는 그대로 진행된다).
 */
async function send<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}/api/subjects${path}`, {
    ...init,
    endpoint: "subjects",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw await parseApiError(res, fallback);
  }
  // 204(삭제)는 본문이 없다.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function listSubjects(): Promise<SubjectResponse[]> {
  const body = await send<unknown>("", { method: "GET" }, "과목 조회 실패");
  // 세션에 들어올 때 미리 받는 목록이라, 배열이 아닌 응답(프록시 오류 페이지 등)을 그대로 넘기면
  // 세션 화면이 통째로 죽는다.
  if (!Array.isArray(body)) {
    throw new Error("과목 조회 실패");
  }
  return body as SubjectResponse[];
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

/** 순서 전체를 한 번에 저장한다(드래그가 끝날 때 1회). 응답 목록은 호출부가 쓰지 않는다 — 204여도 안전. */
export function reorderSubjects(body: SubjectOrderRequest): Promise<SubjectResponse[]> {
  return send("/order", { method: "PUT", body: JSON.stringify(body) }, "과목 순서 저장 실패");
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
