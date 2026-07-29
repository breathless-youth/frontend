import type { SessionCheckpoint } from "@focuson/study-core";

import { clearCheckpoint, readCheckpoint, saveCheckpoint } from "../sessionCheckpointStore";
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

const CHECKPOINT: SessionCheckpoint = {
  schemaVersion: 1,
  sessionId: "session-1",
  startedAtMs: 1_000,
  lastAliveAtMs: 2_000,
  phase: { kind: "focus" },
  phaseStartedAtMs: 1_500,
  closedIntervals: [],
};

describe("sessionCheckpointStore", () => {
  it("save → read 왕복", async () => {
    const store = createFakeStore();

    await saveCheckpoint(CHECKPOINT, store);

    await expect(readCheckpoint(store)).resolves.toEqual(CHECKPOINT);
  });

  it("다시 저장하면 항상 최신 1개만 남는다(덮어쓰기)", async () => {
    const store = createFakeStore();
    const updated: SessionCheckpoint = { ...CHECKPOINT, lastAliveAtMs: 9_999 };

    await saveCheckpoint(CHECKPOINT, store);
    await saveCheckpoint(updated, store);

    await expect(readCheckpoint(store)).resolves.toEqual(updated);
    expect(store.files.size).toBe(1);
  });

  it("손상된 JSON은 null을 반환하고 파일을 삭제한다", async () => {
    const store = createFakeStore();
    store.files.set("checkpoint.json", "{not-json");

    await expect(readCheckpoint(store)).resolves.toBeNull();
    expect(store.files.has("checkpoint.json")).toBe(false);
  });

  it("schemaVersion이 1이 아니면 null을 반환하고 파일을 삭제한다", async () => {
    const store = createFakeStore();
    store.files.set("checkpoint.json", JSON.stringify({ ...CHECKPOINT, schemaVersion: 2 }));

    await expect(readCheckpoint(store)).resolves.toBeNull();
    expect(store.files.has("checkpoint.json")).toBe(false);
  });

  it("clear 후에는 null을 반환한다", async () => {
    const store = createFakeStore();
    await saveCheckpoint(CHECKPOINT, store);

    await clearCheckpoint(store);

    await expect(readCheckpoint(store)).resolves.toBeNull();
  });
});
