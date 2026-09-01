import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudySessionCreateRequest, SubmitResultMessage } from "@focusmakers/types";

import { ApiError } from "@/lib/api";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import { NATIVE_SUBMIT_TIMEOUT_MESSAGE, submitViaNative } from "../submitViaNative";

const REQUEST: StudySessionCreateRequest = {
  userId: 7,
  startedAt: "2026-07-30T01:00:00.000Z",
  endedAt: "2026-07-30T02:00:00.000Z",
  studySec: 3600,
  focusSec: 3000,
  events: [],
};

let sent: string[];

/** 네이티브가 보낸 것처럼 응답을 밀어 넣는다 — 웹이 설치한 전역이 그 통로다. */
function deliver(message: SubmitResultMessage): void {
  const receive = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  receive(JSON.stringify(message));
}

/** 직전 요청에 실린 requestId. 카운터로 만들어지므로 하드코딩할 수 없다. */
function lastRequestId(): string {
  const parsed = JSON.parse(sent[sent.length - 1]) as { requestId: string };
  return parsed.requestId;
}

beforeEach(() => {
  sent = [];
  vi.stubGlobal("ReactNativeWebView", {
    postMessage: (raw: string) => sent.push(raw),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("submitViaNative", () => {
  it("요청 본문을 그대로 브리지로 보낸다 — 네이티브는 이 값을 고치지 않는다", async () => {
    const pending = submitViaNative(REQUEST);
    deliver({
      type: "submit-result",
      requestId: lastRequestId(),
      ok: true,
      sessions: [],
      atMs: 1,
    });
    await pending;

    expect(JSON.parse(sent[0])).toMatchObject({
      type: "submit-session",
      request: REQUEST,
    });
  });

  it("성공 응답의 sessions로 resolve한다", async () => {
    const pending = submitViaNative(REQUEST);
    const sessions = [{ id: 1 }, { id: 2 }] as never;
    deliver({
      type: "submit-result",
      requestId: lastRequestId(),
      ok: true,
      sessions,
      atMs: 1,
    });

    await expect(pending).resolves.toEqual(sessions);
  });

  it("실패 응답의 message로 reject한다 — 사용자가 볼 사유다", async () => {
    const pending = submitViaNative(REQUEST);
    deliver({
      type: "submit-result",
      requestId: lastRequestId(),
      ok: false,
      message: "세션 구간이 겹칩니다",
      atMs: 1,
    });

    await expect(pending).rejects.toThrow("세션 구간이 겹칩니다");
  });

  it("실패 응답에 status가 실려 있으면 ApiError로 복원한다 — 호출부의 400 판별 근거다", async () => {
    const pending = submitViaNative(REQUEST);
    deliver({
      type: "submit-result",
      requestId: lastRequestId(),
      ok: false,
      message: "검증 실패",
      status: 400,
      atMs: 1,
    });

    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });

  /**
   * 재시도가 걸린 상태에서 첫 요청의 늦은 응답이 도착하는 경로다. requestId로 걸러내지 않으면
   * 재시도가 낡은 결과로 완료돼 사용자에게 틀린 화면이 보인다.
   */
  it("requestId가 다른 응답은 무시한다", async () => {
    vi.useFakeTimers();
    const pending = submitViaNative(REQUEST, { timeoutMs: 1000 });

    deliver({
      type: "submit-result",
      requestId: "submit-남의것",
      ok: true,
      sessions: [{ id: 99 }] as never,
      atMs: 1,
    });

    // 무시됐으므로 아직 완료되지 않았고, 상한까지 가면 타임아웃으로 끝난다.
    vi.advanceTimersByTime(1000);
    await expect(pending).rejects.toThrow(NATIVE_SUBMIT_TIMEOUT_MESSAGE);
  });

  it("응답이 없으면 상한에서 실패한다 — 영원히 저장 중에 갇히지 않아야 한다", async () => {
    vi.useFakeTimers();
    const pending = submitViaNative(REQUEST, { timeoutMs: 15_000 });

    vi.advanceTimersByTime(15_000);

    await expect(pending).rejects.toThrow(NATIVE_SUBMIT_TIMEOUT_MESSAGE);
  });

  /**
   * 끝난 요청의 핸들러가 남아 있으면 다음 제출이 앞 요청의 응답에 반응한다. 성공 경로에서
   * 구독이 실제로 해제되는지 확인한다 — 해제되지 않았다면 두 번째 요청이 첫 id의 응답으로
   * 완료돼 버린다.
   */
  it("완료된 요청의 구독은 해제된다", async () => {
    const first = submitViaNative(REQUEST);
    const firstId = lastRequestId();
    deliver({ type: "submit-result", requestId: firstId, ok: true, sessions: [], atMs: 1 });
    await first;

    vi.useFakeTimers();
    const second = submitViaNative(REQUEST, { timeoutMs: 500 });
    // 첫 요청의 id로 다시 응답해도 두 번째는 반응하지 않아야 한다.
    deliver({ type: "submit-result", requestId: firstId, ok: true, sessions: [], atMs: 2 });

    vi.advanceTimersByTime(500);
    await expect(second).rejects.toThrow(NATIVE_SUBMIT_TIMEOUT_MESSAGE);
  });
});
