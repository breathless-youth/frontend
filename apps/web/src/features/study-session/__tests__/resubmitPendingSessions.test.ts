import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { reportHandled } from "@/lib/sentry";

import { resubmitPendingSessions } from "../resubmitPendingSessions";
import { listCheckpoints, saveCheckpoint } from "../sessionCheckpoint";
import { submitStudySession } from "../submitStudySession";

vi.mock("../submitStudySession", () => ({ submitStudySession: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ reportHandled: vi.fn() }));

const record = {
  userId: 7,
  startedAtMs: 1_000,
  lastSeenMs: 61_000,
  studySec: 60,
  focusSec: 55,
  events: [],
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("resubmitPendingSessions", () => {
  it("보관분을 lastSeenMs를 종료 시각으로 제출하고 성공 시 삭제한다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    saveCheckpoint(record);

    const submitted = await resubmitPendingSessions();

    expect(submitStudySession).toHaveBeenCalledWith({
      userId: 7,
      startedAtMs: 1_000,
      endedAtMs: 61_000,
      studySec: 60,
      focusSec: 55,
      events: [],
    });
    expect(submitted).toBe(1);
    expect(listCheckpoints()).toEqual([]);
  });

  it("400이면 삭제하고 로그만 남긴다 — 성공 건수에는 포함하지 않는다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new ApiError("검증 실패", 400));
    saveCheckpoint(record);

    const submitted = await resubmitPendingSessions();

    expect(submitted).toBe(0);
    expect(listCheckpoints()).toEqual([]);
    expect(reportHandled).toHaveBeenCalledTimes(1);
  });

  it("400이 아닌 4xx는 보관을 유지한다 — 스펙은 400만 영구 실패로 본다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new ApiError("충돌", 409));
    saveCheckpoint(record);

    const submitted = await resubmitPendingSessions();

    expect(submitted).toBe(0);
    expect(listCheckpoints()).toHaveLength(1);
  });

  it("네트워크 실패면 보관을 유지한다", async () => {
    vi.mocked(submitStudySession).mockRejectedValue(new Error("offline"));
    saveCheckpoint(record);

    const submitted = await resubmitPendingSessions();

    expect(submitted).toBe(0);
    expect(listCheckpoints()).toHaveLength(1);
  });

  it("마지막 저장이 15초 이내인 레코드는 건너뛴다 — 같은 웹뷰에서 막 시작한 세션일 수 있다", async () => {
    vi.mocked(submitStudySession).mockResolvedValue([]);
    const now = Date.now();
    saveCheckpoint({ ...record, startedAtMs: now - 5_000, lastSeenMs: now - 3_000 });

    const submitted = await resubmitPendingSessions();

    expect(submitStudySession).not.toHaveBeenCalled();
    expect(submitted).toBe(0);
    expect(listCheckpoints()).toHaveLength(1);
  });

  it("여러 건을 각각 처리한다 — 한 건의 실패가 다음 건을 막지 않는다", async () => {
    vi.mocked(submitStudySession)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);
    saveCheckpoint(record);
    saveCheckpoint({ ...record, startedAtMs: 2_000 });

    const submitted = await resubmitPendingSessions();

    expect(submitStudySession).toHaveBeenCalledTimes(2);
    expect(submitted).toBe(1);
    expect(listCheckpoints()).toHaveLength(1);
  });
});
