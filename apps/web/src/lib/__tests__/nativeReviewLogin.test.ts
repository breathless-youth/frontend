import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativeReviewLoginForTests,
  nativeReviewLoginAppVersion,
  requestNativeReviewLogin,
} from "@/lib/nativeReviewLogin";
import { queryClient } from "@/lib/queryClient";

const postMessage = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  postMessage.mockReset();
  window.history.replaceState(null, "", "/");
  __resetNativeReviewLoginForTests();
});

function open(query: string, bridge = true) {
  window.history.replaceState(null, "", `/social${query}`);
  __resetNativeReviewLoginForTests();
  if (bridge) vi.stubGlobal("ReactNativeWebView", { postMessage });
}

function fromNative(message: Record<string, unknown>) {
  (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY](
    JSON.stringify({ type: "review-login-result", atMs: 1, ...message }),
  );
}

function lastRequest(): Record<string, unknown> {
  return JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string) as Record<string, unknown>;
}

describe("nativeReviewLoginAppVersion", () => {
  it("브리지와 reviewLogin=1과 점으로 나눈 숫자 앱 버전이 모두 있을 때만 앱 버전을 돌려준다", () => {
    open("?reviewLogin=1&appVersion=26.47.0");
    expect(nativeReviewLoginAppVersion()).toBe("26.47.0");
  });

  it.each([
    ["브라우저", "?reviewLogin=1&appVersion=26.47.0", false],
    ["표시 없는 구버전 앱", "?appVersion=26.47.0", true],
    ["앱 버전 없음", "?reviewLogin=1", true],
    ["숫자가 아닌 앱 버전", "?reviewLogin=1&appVersion=26.47.0-beta", true],
    ["빈 조각이 있는 앱 버전", "?reviewLogin=1&appVersion=26..0", true],
  ])("%s이면 null이다", (_label, query, bridge) => {
    open(query, bridge);
    expect(nativeReviewLoginAppVersion()).toBeNull();
  });

  it("앱 안 이동으로 주소의 쿼리가 빠져도 처음 읽은 값을 쓴다", () => {
    open("?reviewLogin=1&appVersion=26.47.0");
    expect(nativeReviewLoginAppVersion()).toBe("26.47.0");
    window.history.replaceState(null, "", "/settings/login");
    expect(nativeReviewLoginAppVersion()).toBe("26.47.0");
  });
});

describe("requestNativeReviewLogin", () => {
  it("아이디와 비밀번호를 실어 보내고 성공하면 이 문서의 조회를 모두 다시 부른다", async () => {
    open("?reviewLogin=1&appVersion=26.47.0");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    const pending = requestNativeReviewLogin("review", "pw-1234");
    const request = lastRequest();
    expect(request).toMatchObject({ type: "review-login", loginId: "review", password: "pw-1234" });

    fromNative({ id: "other", status: "success" });
    fromNative({ id: request.id, status: "success" });

    await expect(pending).resolves.toEqual({ status: "success" });
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("실패 코드를 그대로 받고 모르는 코드는 UNKNOWN으로 받는다", async () => {
    open("?reviewLogin=1&appVersion=26.47.0");
    const first = requestNativeReviewLogin("review", "pw");
    fromNative({ id: lastRequest().id, status: "failed", code: "TOO_MANY_REQUESTS" });
    await expect(first).resolves.toEqual({ status: "failed", code: "TOO_MANY_REQUESTS" });

    const second = requestNativeReviewLogin("review", "pw");
    fromNative({ id: lastRequest().id, status: "failed", code: "LOCKED" });
    await expect(second).resolves.toEqual({ status: "failed", code: "UNKNOWN" });
  });

  it("브리지가 없으면 UNKNOWN 실패로 끝난다", async () => {
    await expect(requestNativeReviewLogin("review", "pw")).resolves.toEqual({
      status: "failed",
      code: "UNKNOWN",
    });
  });
});
