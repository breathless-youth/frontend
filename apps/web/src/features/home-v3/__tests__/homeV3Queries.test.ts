import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { homeV3StatsQuery } from "../homeV3Queries";

const mocked = vi.hoisted(() => ({ userId: 7, sync: vi.fn(), stats: vi.fn() }));
vi.mock("@/features/profile/useTimeZoneSync", () => ({ syncProfileTimeZone: mocked.sync }));
vi.mock("@/lib/statsApi", () => ({ listStudySessionStats: mocked.stats, getStreak: vi.fn() }));
vi.mock("@/lib/userId", () => ({
  assertCurrentUserId: (id: number) => {
    if (id !== mocked.userId) throw new DOMException("User identity changed", "AbortError");
  },
}));

describe("home timezone queries", () => {
  it("does not fetch another account's stats after waiting for timezone sync", async () => {
    mocked.userId = 7;
    let finish!: () => void;
    mocked.sync.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const request = client
      .fetchQuery(homeV3StatsQuery(7, { dateKey: "2026-11-07", timeZone: "Asia/Seoul" }))
      .catch((error: unknown) => error);
    await Promise.resolve();
    mocked.userId = 8;
    finish();
    expect(await request).toMatchObject({ name: "AbortError" });
    expect(mocked.stats).not.toHaveBeenCalled();
  });

  it("does not start stats after the query was cancelled while syncing", async () => {
    mocked.userId = 7;
    let finish!: () => void;
    mocked.sync.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = homeV3StatsQuery(7, { dateKey: "2026-11-07", timeZone: "Asia/Seoul" });
    const request = client.fetchQuery(options).catch((error: unknown) => error);
    await Promise.resolve();
    await client.cancelQueries({ queryKey: options.queryKey });
    finish();
    await request;
    await Promise.resolve();
    expect(mocked.stats).not.toHaveBeenCalled();
  });
});
