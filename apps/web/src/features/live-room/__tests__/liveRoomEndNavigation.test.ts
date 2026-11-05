import type { StudySessionResponse } from "@focusmakers/types";
import { describe, expect, it } from "vitest";

import { kickedNotice, resolveLiveRoomDoneNavigation } from "../liveRoomEndNavigation";
import { liveRoomHomePath, liveRoomResultPath } from "../roomKind";

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
    expect(nav).toEqual({ to: "home" });
  });

  it("자동 종료면 순공이 길어도 소셜 홈으로 보낸다", () => {
    const nav = resolveLiveRoomDoneNavigation({
      expired: false,
      endReason: { kind: "AUTO", trigger: "BACKGROUND" },
      focusSec: 3000,
      sessions,
    });
    expect(nav).toEqual({ to: "home" });
  });

  it("유예 만료면 수동이라도 소셜 홈으로 보낸다", () => {
    const nav = resolveLiveRoomDoneNavigation({
      expired: true,
      endReason: { kind: "MANUAL" },
      focusSec: 3000,
      sessions,
    });
    expect(nav).toEqual({ to: "home" });
  });

  it("제출 결과가 비어 있으면 소셜 홈으로 보낸다 — 그릴 세션이 없다", () => {
    const nav = resolveLiveRoomDoneNavigation({
      expired: false,
      endReason: { kind: "MANUAL" },
      focusSec: 3000,
      sessions: [],
    });
    expect(nav).toEqual({ to: "home" });
  });
});

describe("공부방을 나간 뒤의 경로와 안내", () => {
  it("공부방 경로는 그룹 홈과 그룹 결과 화면이다", () => {
    expect(liveRoomHomePath({ kind: "group", groupId: 10 })).toBe("/social/groups/10");
    expect(liveRoomResultPath({ kind: "group", groupId: 10 }, 123)).toBe(
      "/social/groups/10/room/result",
    );
    expect(liveRoomHomePath({ kind: "invite", inviteCode: "0712" })).toBe("/social");
    expect(liveRoomResultPath({ kind: "invite", inviteCode: "0712" }, 42)).toBe(
      "/social/room/42/result",
    );
    expect(kickedNotice("새벽 5시 기상 공시반")).toBe("새벽 5시 기상 공시반에서 내보내졌어요");
    expect(kickedNotice(null)).toBe("그룹에서 내보내졌어요");
  });
});
