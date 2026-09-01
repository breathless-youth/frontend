import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestSessionStart } from "../sessionStart";

/** 웹뷰 안에서는 브리지로, 브라우저 단독 모드에서는 직접 이동으로 갈린다 (BY-334). */

const isNativeBridgeAvailable = vi.hoisted(() => vi.fn());
const postToNative = vi.hoisted(() => vi.fn());
const closeStaleSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/bridge", () => ({ isNativeBridgeAvailable, postToNative }));
vi.mock("@/features/study-session/closeStaleSession", () => ({ closeStaleSession }));

describe("requestSessionStart", () => {
  beforeEach(() => {
    isNativeBridgeAvailable.mockReset();
    postToNative.mockReset();
    closeStaleSession.mockReset().mockResolvedValue(undefined);
  });

  it("웹뷰에서는 마감 후 start-session을 보내고 직접 이동하지 않는다", async () => {
    isNativeBridgeAvailable.mockReturnValue(true);
    const navigateToSession = vi.fn();

    const route = await requestSessionStart(7, navigateToSession);

    expect(route).toBe("native");
    expect(closeStaleSession).toHaveBeenCalledWith(7);
    expect(postToNative).toHaveBeenCalledWith(
      expect.objectContaining({ type: "start-session", atMs: expect.any(Number) as number }),
    );
    expect(navigateToSession).not.toHaveBeenCalled();
  });

  it("브라우저 단독 모드에서는 마감 후 세션 라우트로 이동한다", async () => {
    isNativeBridgeAvailable.mockReturnValue(false);
    const navigateToSession = vi.fn();

    const route = await requestSessionStart(7, navigateToSession);

    expect(route).toBe("web");
    expect(closeStaleSession).toHaveBeenCalledWith(7);
    expect(navigateToSession).toHaveBeenCalledTimes(1);
    expect(postToNative).not.toHaveBeenCalled();
  });

  it("마감이 끝나기 전에는 start-session을 보내지 않는다", async () => {
    isNativeBridgeAvailable.mockReturnValue(true);
    let release: () => void = () => {};
    closeStaleSession.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );

    const pending = requestSessionStart(7, vi.fn());
    await Promise.resolve();
    expect(postToNative).not.toHaveBeenCalled();

    release();
    await pending;
    expect(postToNative).toHaveBeenCalledTimes(1);
  });
});
