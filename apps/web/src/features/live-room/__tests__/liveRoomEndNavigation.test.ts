import type { StudySessionResponse } from "@focusmakers/types";
import { describe, expect, it } from "vitest";

import { resolveLiveRoomDoneNavigation } from "../liveRoomEndNavigation";

const sessions: StudySessionResponse[] = [
  {
    id: 1,
    userId: 7,
    statDate: "2026-08-30",
    startedAt: "2026-08-30T12:00:00.000Z",
    endedAt: "2026-08-30T13:00:00.000Z",
    studySec: 3600,
    focusSec: 3000,
    focusRate: 83.3,
    events: [],
  },
];

describe("resolveLiveRoomDoneNavigation", () => {
  it("수동 종료 + 순공 1분 이상이면 결과 화면으로 보낸다", () => {
    const nav = resolveLiveRoomDoneNavigation({
      expired: false,
      endReason: { kind: "MANUAL" },
      focusSec: 60,
      sessions,
    });
    expect(nav).toEqual({ to: "result", sessions });
  });

  it("순공 1분 미만이면 소셜 홈으로 보낸다", () => {
    const nav = resolveLiveRoomDoneNavigation({
      expired: false,
      endReason: { kind: "MANUAL" },
      focusSec: 59,
      sessions,
    });
    expect(nav).toEqual({ to: "social" });
  });

  it("자동 종료면 순공이 길어도 소셜 홈으로 보낸다", () => {
    const nav = resolveLiveRoomDoneNavigation({
      expired: false,
      endReason: { kind: "AUTO", trigger: "BACKGROUND" },
      focusSec: 3000,
      sessions,
    });
    expect(nav).toEqual({ to: "social" });
  });

  it("유예 만료면 수동이라도 소셜 홈으로 보낸다", () => {
    const nav = resolveLiveRoomDoneNavigation({
      expired: true,
      endReason: { kind: "MANUAL" },
      focusSec: 3000,
      sessions,
    });
    expect(nav).toEqual({ to: "social" });
  });

  it("제출 결과가 비어 있으면 소셜 홈으로 보낸다 — 그릴 세션이 없다", () => {
    const nav = resolveLiveRoomDoneNavigation({
      expired: false,
      endReason: { kind: "MANUAL" },
      focusSec: 3000,
      sessions: [],
    });
    expect(nav).toEqual({ to: "social" });
  });
});
