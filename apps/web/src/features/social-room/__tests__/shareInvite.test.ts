import { afterEach, describe, expect, it, vi } from "vitest";

import { inviteLink, inviteShareText, shareInvite } from "../shareInvite";

afterEach(() => {
  delete (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView;
  window.history.replaceState(null, "", "/");
});

describe("inviteShareText", () => {
  it("확정 형식(인사\\n\\n링크\\n\\n초대코드)을 지킨다", () => {
    expect(inviteShareText("0712")).toBe(
      `그룹 스터디에 초대받았어요!\n\n${window.location.origin}/social/join?code=0712\n\n초대코드: 0712`,
    );
  });

  it("링크는 현재 오리진의 참여 화면을 가리킨다", () => {
    expect(inviteLink("0712")).toBe(`${window.location.origin}/social/join?code=0712`);
  });
});

describe("shareInvite", () => {
  it("navigator.share가 없고 브리지 + 지원 표시(?share=1)가 있으면(신규 앱) share 메시지를 보낸다", async () => {
    const postMessage = vi.fn();
    (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
    window.history.replaceState(null, "", "/social/code?share=1");

    await expect(shareInvite("0712")).resolves.toBe("shared");

    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((postMessage.mock.calls[0] as [string])[0]) as {
      type: string;
      text: string;
    };
    expect(sent.type).toBe("share");
    expect(sent.text).toBe(inviteShareText("0712"));
  });

  it("브리지가 있어도 지원 표시가 없으면(구버전 앱) 메시지를 보내지 않고 텍스트 전체를 복사한다", async () => {
    const postMessage = vi.fn();
    (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await expect(shareInvite("0712")).resolves.toBe("copied");

    expect(postMessage).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(inviteShareText("0712"));
  });
});
