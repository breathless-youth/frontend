import { afterEach, describe, expect, it, vi } from "vitest";

import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativeSocialLoginForTests,
  nativeSocialLoginProviders,
  requestNativeSocialLogin,
} from "@/lib/nativeSocialLogin";
import { queryClient } from "@/lib/queryClient";

const postMessage = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  postMessage.mockReset();
  window.history.replaceState(null, "", "/");
  __resetNativeSocialLoginForTests();
});

function nativeEntry(): (raw: string) => void {
  return (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
}

/** 앱이 붙인 공급자 목록과 브리지 준비 */
function enableNativeSocialLogin(list = "GOOGLE,KAKAO,APPLE") {
  window.history.replaceState(null, "", `/social?socialLogin=${list}`);
  __resetNativeSocialLoginForTests();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
}

/** 마지막으로 보낸 소셜 로그인 요청의 id 확인 */
function lastRequestId(): string {
  const message = JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string) as {
    type: string;
    id: string;
    provider: string;
  };
  expect(message.type).toBe("social-login");
  return message.id;
}

function reply(message: Record<string, unknown>) {
  nativeEntry()(JSON.stringify({ type: "social-login-result", atMs: 1, ...message }));
}

describe("nativeSocialLoginProviders", () => {
  it("앱이 붙인 socialLogin 목록과 브리지가 모두 있을 때만 공급자를 돌려준다", () => {
    window.history.replaceState(null, "", "/social?socialLogin=GOOGLE,KAKAO");
    __resetNativeSocialLoginForTests();
    expect(nativeSocialLoginProviders()).toEqual([]);

    vi.stubGlobal("ReactNativeWebView", { postMessage });
    expect(nativeSocialLoginProviders()).toEqual(["GOOGLE", "KAKAO"]);
  });

  it("브리지가 있어도 목록이 없으면 비어 있다 (이 메시지를 모르는 구버전 앱)", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    expect(nativeSocialLoginProviders()).toEqual([]);
  });

  it("모르는 공급자는 뺀다", () => {
    enableNativeSocialLogin("GOOGLE,NAVER,APPLE");

    expect(nativeSocialLoginProviders()).toEqual(["GOOGLE", "APPLE"]);
  });

  it("처음 읽은 목록을 유지한다 (앱 안 이동이 쿼리를 없애도 바뀌지 않는다)", () => {
    enableNativeSocialLogin();
    expect(nativeSocialLoginProviders()).toEqual(["GOOGLE", "KAKAO", "APPLE"]);

    window.history.replaceState(null, "", "/settings");
    expect(nativeSocialLoginProviders()).toEqual(["GOOGLE", "KAKAO", "APPLE"]);
  });
});

describe("requestNativeSocialLogin", () => {
  it("공급자를 실어 보내고 다른 id의 응답은 무시한 채 자기 응답을 기다린다", async () => {
    enableNativeSocialLogin();
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    const pending = requestNativeSocialLogin("KAKAO");
    const id = lastRequestId();
    expect(JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string)).toMatchObject({
      provider: "KAKAO",
    });
    reply({ id: "someone-else", status: "cancelled" });
    reply({ id, status: "failed", code: "ALREADY_LINKED" });

    await expect(pending).resolves.toEqual({ status: "failed", code: "ALREADY_LINKED" });
  });

  it("cancelled는 그대로 돌려준다", async () => {
    enableNativeSocialLogin();

    const pending = requestNativeSocialLogin("APPLE");
    reply({ id: lastRequestId(), status: "cancelled" });

    await expect(pending).resolves.toEqual({ status: "cancelled" });
  });

  it("요청을 브리지에 넘기지 못하면 기다리지 않고 failed다", async () => {
    window.history.replaceState(null, "", "/social?socialLogin=GOOGLE");
    __resetNativeSocialLoginForTests();
    vi.stubGlobal("ReactNativeWebView", {
      postMessage: () => {
        throw new TypeError("gone");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(requestNativeSocialLogin("GOOGLE")).resolves.toEqual({
      status: "failed",
      code: "UNKNOWN",
    });
  });

  it("성공하면 계정이 바뀌었을 수 있어 이 문서의 쿼리를 모두 다시 불러온다", async () => {
    enableNativeSocialLogin();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    const pending = requestNativeSocialLogin("GOOGLE");
    reply({ id: lastRequestId(), status: "success", isNewUser: false });

    await expect(pending).resolves.toEqual({ status: "success", isNewUser: false });
    expect(invalidate).toHaveBeenCalledWith();
  });

  it("실패하면 쿼리를 다시 불러오지 않는다", async () => {
    enableNativeSocialLogin();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);

    const pending = requestNativeSocialLogin("GOOGLE");
    reply({ id: lastRequestId(), status: "failed", code: "SOCIAL_PROVIDER_UNAVAILABLE" });

    await expect(pending).resolves.toEqual({
      status: "failed",
      code: "SOCIAL_PROVIDER_UNAVAILABLE",
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
