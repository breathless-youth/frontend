import { describe, expect, it } from "vitest";

import { DEFAULT_WATCHER_TRIGGER_MS } from "../watcherTrigger";

describe("감독관 등장 기준 시간", () => {
  it("모든 원인 9초다", () => {
    expect(DEFAULT_WATCHER_TRIGGER_MS).toEqual({
      AWAY: 9_000,
      PHONE: 9_000,
      DEVICE: 9_000,
      SLEEP: 9_000,
    });
  });
});
