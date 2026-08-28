import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { enterLiveRoom, renewLiveRoomSeat } from "../roomApi";

const closeStaleSession = vi.hoisted(() => vi.fn());
vi.mock("@/features/study-session/closeStaleSession", () => ({ closeStaleSession }));

const JOIN_RESPONSE = {
  roomId: 3,
  graceRejoin: false,
  cameraOn: null,
  iceServers: [],
  iceTtlSeconds: 600,
};

function stubJoinOk() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JOIN_RESPONSE),
    }),
  );
}

describe("enterLiveRoom", () => {
  beforeEach(() => {
    closeStaleSession.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("옛 세션을 먼저 마감하고 입장 요청을 보낸다", async () => {
    stubJoinOk();

    await expect(enterLiveRoom(7, "0712")).resolves.toEqual(JOIN_RESPONSE);

    expect(closeStaleSession).toHaveBeenCalledWith(7);
    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/api\/rooms\/join$/);
  });

  it("마감이 끝나기 전에는 입장 요청을 보내지 않는다", async () => {
    stubJoinOk();
    let release: () => void = () => {};
    closeStaleSession.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const pending = enterLiveRoom(7, "0712");
    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();

    release();
    await pending;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("renewLiveRoomSeat", () => {
  beforeEach(() => {
    closeStaleSession.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("마감하지 않는다", async () => {
    stubJoinOk();

    await expect(renewLiveRoomSeat(7, "0712")).resolves.toEqual(JOIN_RESPONSE);

    expect(closeStaleSession).not.toHaveBeenCalled();
  });
});
