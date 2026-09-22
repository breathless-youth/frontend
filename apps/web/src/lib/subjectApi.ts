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
 * 과목 > 할 일 CRUD (`/api/subjects`).
 *
 * ⚠️ **이 API만 `API-Version: 1`이다.** 다른 토큰 요청은 `apiFetch`가 자동으로 2를 붙이지만(구 앱 계약과
 * 가르려고) 과목 API는 구 앱이 호출하지 않아 서버가 기본버전 하나로 매핑돼 있다. 버전을 명시하지 않으면
 * `apiFetch`가 2를 붙여 400이 난다 — 호출부가 지정한 버전은 그대로 유지된다.
 *
 * 인증은 그대로 토큰이 필요하다. 토큰이 없는 브라우저 단독에서는 401로 실패하고 호출부가 토스트로
 * 알린다(세션 자체는 그대로 진행된다).
 */
const HEADERS = { "Content-Type": "application/json", "API-Version": "1" };

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
