import type { SubmitPayload } from "@focuson/study-core";

import {
  enqueuePendingSession,
  listPendingSessions,
  type PendingSession,
  removePendingSession,
} from "../pendingSessionQueue";
import type { SessionFileStore } from "../sessionFileStore";

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

const PAYLOAD: SubmitPayload = {
  startedAt: "2026-07-29T00:00:00.000Z",
  endedAt: "2026-07-29T01:00:00.000Z",
  studySec: 3_000,
  focusSec: 2_000,
  events: [],
};

function pendingSession(sessionId: string): PendingSession {
  return { sessionId, payload: PAYLOAD };
}

describe("pendingSessionQueue", () => {
  it("enqueue → list 왕복", async () => {
    const store = createFakeStore();

    await enqueuePendingSession(pendingSession("session-1"), store);

    await expect(listPendingSessions(store)).resolves.toEqual([pendingSession("session-1")]);
  });

  it("세션 2개를 독립적으로 저장한다", async () => {
    const store = createFakeStore();

    await enqueuePendingSession(pendingSession("session-1"), store);
    await enqueuePendingSession(pendingSession("session-2"), store);

    const sessions = await listPendingSessions(store);
    expect(sessions).toHaveLength(2);
    expect(sessions.map((s) => s.sessionId).sort()).toEqual(["session-1", "session-2"]);
  });

  it("remove는 해당 세션만 제거한다", async () => {
    const store = createFakeStore();
    await enqueuePendingSession(pendingSession("session-1"), store);
    await enqueuePendingSession(pendingSession("session-2"), store);

    await removePendingSession("session-1", store);

    const sessions = await listPendingSessions(store);
    expect(sessions).toEqual([pendingSession("session-2")]);
  });

  it("손상된 파일은 건너뛰고 나머지를 반환하며, 손상 파일은 삭제한다", async () => {
    const store = createFakeStore();
    await enqueuePendingSession(pendingSession("session-1"), store);
    store.files.set("pending/session-2.json", "{not-json");

    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const sessions = await listPendingSessions(store);

    expect(sessions).toEqual([pendingSession("session-1")]);
    expect(store.files.has("pending/session-2.json")).toBe(false);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
