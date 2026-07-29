import type { SessionCheckpoint } from "@focuson/study-core";

import { enqueuePendingSession, listPendingSessions } from "../pendingSessionQueue";
import { readCheckpoint, saveCheckpoint } from "../sessionCheckpointStore";
import type { SessionFileStore } from "../sessionFileStore";
import {
  completePendingCheckpoint,
  flushPendingSessions,
  syncSessionsOnAppActive,
} from "../sessionSync";
import { StudySessionSubmitError, submitStudySession } from "../studySessionApi";
import { ensureUserRegistered } from "../userApi";

jest.mock("../userApi", () => ({ ensureUserRegistered: jest.fn() }));

jest.mock("../studySessionApi", () => {
  const actual = jest.requireActual("../studySessionApi");
  return { ...actual, submitStudySession: jest.fn() };
});

const mockedEnsureUserRegistered = ensureUserRegistered as jest.MockedFunction<
  typeof ensureUserRegistered
>;
const mockedSubmitStudySession = submitStudySession as jest.MockedFunction<
  typeof submitStudySession
>;

function createFakeStore(): SessionFileStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    read: async (path) => files.get(path) ?? null,
    writeAtomic: async (path, contents) => void files.set(path, contents),
    remove: async (path) => void files.delete(path),
    list: async (dir) =>
      [...files.keys()].filter((k) => k.startsWith(`${dir}/`)).map((k) => k.slice(dir.length + 1)),
  };
}

const CHECKPOINT: SessionCheckpoint = {
  schemaVersion: 1,
  sessionId: "session-1",
  startedAtMs: 1_000,
  lastAliveAtMs: 2_000,
  phase: { kind: "focus" },
  phaseStartedAtMs: 1_500,
  closedIntervals: [],
};

const PAYLOAD = {
  startedAt: "2026-07-29T00:00:00.000Z",
  endedAt: "2026-07-29T01:00:00.000Z",
  studySec: 3_000,
  focusSec: 2_000,
  events: [],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("completePendingCheckpoint", () => {
  it("체크포인트가 없으면 'none'을 반환한다", async () => {
    const store = createFakeStore();

    await expect(completePendingCheckpoint(9_999, store)).resolves.toBe("none");
  });

  it("restore 갈래면 체크포인트를 그대로 유지하고 'restorable'을 반환한다", async () => {
    const store = createFakeStore();
    const paused: SessionCheckpoint = {
      ...CHECKPOINT,
      phase: { kind: "paused", cause: "manual" },
      phaseStartedAtMs: 5_000,
      lastAliveAtMs: 5_000,
    };
    await saveCheckpoint(paused, store);

    await expect(completePendingCheckpoint(6_000, store)).resolves.toBe("restorable");
    await expect(readCheckpoint(store)).resolves.toEqual(paused);
  });

  it("finalized면 큐에 편입하고 체크포인트를 삭제해 'enqueued'를 반환한다", async () => {
    const store = createFakeStore();
    await saveCheckpoint(CHECKPOINT, store);

    await expect(completePendingCheckpoint(9_999, store)).resolves.toBe("enqueued");
    await expect(readCheckpoint(store)).resolves.toBeNull();
    const pending = await listPendingSessions(store);
    expect(pending.map((p) => p.sessionId)).toEqual(["session-1"]);
  });
});

describe("flushPendingSessions", () => {
  it("성공하면 큐에서 제거하고 submitted를 센다", async () => {
    const store = createFakeStore();
    await enqueuePendingSession({ sessionId: "session-1", payload: PAYLOAD }, store);
    mockedSubmitStudySession.mockResolvedValue([]);

    await expect(flushPendingSessions(7, store)).resolves.toEqual({
      submitted: 1,
      kept: 0,
      dropped: 0,
    });
    await expect(listPendingSessions(store)).resolves.toEqual([]);
  });

  it("첫 번째 세션이 4xx 실패, 두 번째가 성공하면 각각 dropped·submitted로 센다", async () => {
    const store = createFakeStore();
    await enqueuePendingSession({ sessionId: "session-1", payload: PAYLOAD }, store);
    await enqueuePendingSession({ sessionId: "session-2", payload: PAYLOAD }, store);
    mockedSubmitStudySession
      .mockRejectedValueOnce(new StudySessionSubmitError("잘못된 요청", 400))
      .mockResolvedValueOnce([]);

    await expect(flushPendingSessions(7, store)).resolves.toEqual({
      submitted: 1,
      kept: 0,
      dropped: 1,
    });
    await expect(listPendingSessions(store)).resolves.toEqual([]);
  });
});

describe("syncSessionsOnAppActive", () => {
  it("플러시 성공 시 invalidate를 1회 호출한다", async () => {
    const store = createFakeStore();
    await enqueuePendingSession({ sessionId: "session-1", payload: PAYLOAD }, store);
    mockedEnsureUserRegistered.mockResolvedValue(7);
    mockedSubmitStudySession.mockResolvedValue([]);
    const invalidate = jest.fn();

    await syncSessionsOnAppActive(invalidate, 9_999, store);

    expect(invalidate).toHaveBeenCalledTimes(1);
    await expect(listPendingSessions(store)).resolves.toEqual([]);
  });

  it("4xx면 큐에서 제거(dropped)하고 invalidate는 호출하지 않는다", async () => {
    const store = createFakeStore();
    await enqueuePendingSession({ sessionId: "session-1", payload: PAYLOAD }, store);
    mockedEnsureUserRegistered.mockResolvedValue(7);
    mockedSubmitStudySession.mockRejectedValue(new StudySessionSubmitError("잘못된 요청", 400));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const invalidate = jest.fn();

    await syncSessionsOnAppActive(invalidate, 9_999, store);

    expect(invalidate).not.toHaveBeenCalled();
    await expect(listPendingSessions(store)).resolves.toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("네트워크 오류면 큐를 유지(kept)하고 오류를 삼킨다", async () => {
    const store = createFakeStore();
    await enqueuePendingSession({ sessionId: "session-1", payload: PAYLOAD }, store);
    mockedEnsureUserRegistered.mockResolvedValue(7);
    mockedSubmitStudySession.mockRejectedValue(new TypeError("Network request failed"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const invalidate = jest.fn();

    await expect(syncSessionsOnAppActive(invalidate, 9_999, store)).resolves.toBeUndefined();

    expect(invalidate).not.toHaveBeenCalled();
    const pending = await listPendingSessions(store);
    expect(pending.map((p) => p.sessionId)).toEqual(["session-1"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("userId가 null이면 아무 것도 하지 않는다", async () => {
    const store = createFakeStore();
    await enqueuePendingSession({ sessionId: "session-1", payload: PAYLOAD }, store);
    await saveCheckpoint(CHECKPOINT, store);
    mockedEnsureUserRegistered.mockResolvedValue(null);
    const invalidate = jest.fn();

    await syncSessionsOnAppActive(invalidate, 9_999, store);

    expect(mockedSubmitStudySession).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
    await expect(readCheckpoint(store)).resolves.toEqual(CHECKPOINT);
    const pending = await listPendingSessions(store);
    expect(pending.map((p) => p.sessionId)).toEqual(["session-1"]);
  });
});
