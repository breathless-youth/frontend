import { afterEach, expect, it, vi } from "vitest";
import * as tokenSource from "@/lib/auth/tokenSource";
import type { AuthSnapshot } from "@/lib/auth/tokenSource";
import { saveRecordDraft } from "../recordSave";
import type { RecordDraftOperation } from "../recordDraft";
const operations: RecordDraftOperation[] = Array.from({ length: 51 }, (_, index) => ({
  blockId: `block-${index}`,
  operationId: `op-${index}`,
  action: "CREATE",
  subjectId: null,
  startedAt: "2026-11-05T00:00:00Z",
  endedAt: "2026-11-05T01:00:00Z",
  timeZone: "Asia/Seoul",
}));
function identity() {
  let snapshot: AuthSnapshot = { userId: 7, accessToken: "a1" };
  const listeners = new Set<(value: AuthSnapshot) => void>();
  vi.spyOn(tokenSource, "getTokenSource").mockReturnValue({
    getUserId: () => snapshot.userId,
    getCurrentToken: () => snapshot.accessToken,
    getAccessToken: async () => snapshot.accessToken,
    refresh: async () => snapshot.accessToken,
    hasSettled: () => true,
    subscribe: (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  });
  return {
    emit(userId: number, accessToken: string) {
      snapshot = { userId, accessToken };
      for (const listener of [...listeners]) listener(snapshot);
    },
    listeners,
  };
}
function success(init?: RequestInit) {
  const body = JSON.parse(String(init?.body));
  return Response.json({
    results: body.operations.map((op: RecordDraftOperation) => ({
      operationId: op.operationId,
      success: true,
      key: `m:${op.operationId}`,
      status: 200,
      code: null,
      message: null,
    })),
  });
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(["응답 대기", "본문 읽기"])(
  "51개 저장 중 %s 단계에서 계정이 바뀌면 현재 요청과 후속 배치를 중단한다",
  async (phase) => {
    const native = identity();
    let finish!: () => void;
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (!finish) {
        if (phase === "본문 읽기") {
          const response = success(init);
          const read = response.json.bind(response);
          response.json = () =>
            new Promise((resolve) => {
              finish = () => {
                void read().then(resolve);
              };
            });
          return response;
        }
        return new Promise<Response>((resolve) => {
          finish = () => resolve(success(init));
        });
      }
      return success(init);
    });
    vi.stubGlobal("fetch", request);
    const saving = saveRecordDraft(operations, { timeZone: "Asia/Seoul", ownerId: 7 });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    native.emit(8, "b1");
    const aborted = request.mock.calls[0]![1]?.signal?.aborted;
    finish(); // A의 성공 응답이 취소와 경합하여 도착해도 다음 요청은 막는다.
    const result = await saving;
    expect(request).toHaveBeenCalledTimes(1);
    expect(aborted).toBe(true);
    expect(result.confirmed).toHaveLength(phase === "본문 읽기" ? 50 : 0);
    expect(result.pending).toEqual(phase === "본문 읽기" ? [operations[50]] : operations);
    expect(result.uncertain).toBe(true);
    expect(native.listeners.size).toBe(0);
  },
);
it("같은 계정의 토큰 갱신은 51개 저장을 계속하고 후속 배치에 갱신 토큰을 쓴다", async () => {
  const native = identity();
  let finish!: () => void;
  const request = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (!finish)
      return new Promise<Response>((resolve) => {
        finish = () => resolve(success(init));
      });
    return success(init);
  });
  vi.stubGlobal("fetch", request);
  const saving = saveRecordDraft(operations, { timeZone: "Asia/Seoul", ownerId: 7 });
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  native.emit(7, "a2");
  finish();
  const result = await saving;
  expect(request).toHaveBeenCalledTimes(2);
  expect(new Headers(request.mock.calls[1]![1]?.headers).get("Authorization")).toBe("Bearer a2");
  expect(result.confirmed).toHaveLength(51);
  expect(result.pending).toEqual([]);
  expect(result.uncertain).toBe(false);
  expect(native.listeners.size).toBe(0);
});

it.each([7, null])(
  "편집기 계정 %s와 현재 토큰 계정이 다르면 첫 배치도 보내지 않는다",
  async (ownerId) => {
    const native = identity();
    native.emit(8, "b1");
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => success(init));
    vi.stubGlobal("fetch", request);
    const result = await saveRecordDraft(operations, { timeZone: "Asia/Seoul", ownerId });
    expect(request).not.toHaveBeenCalled();
    expect(result.confirmed).toEqual([]);
    expect(result.pending).toEqual(operations);
    expect(native.listeners.size).toBe(0);
  },
);
it.each([7, null])(
  "토큰 출처가 없는 기존 경로는 편집기 계정 %s로 정상 저장한다",
  async (ownerId) => {
    vi.spyOn(tokenSource, "getTokenSource").mockReturnValue(null);
    const request = vi.fn(async (_url: unknown, init?: RequestInit) => success(init));
    vi.stubGlobal("fetch", request);
    const result = await saveRecordDraft(operations, { timeZone: "Asia/Seoul", ownerId });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.confirmed).toHaveLength(51);
    expect(result.pending).toEqual([]);
  },
);
