import { afterEach, describe, expect, it, vi } from "vitest";

import { inviteLink, inviteShareText, shareInvite } from "../shareInvite";

afterEach(() => {
  delete (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView;
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
  it("navigator.share가 없고 브리지가 있으면(Android 웹뷰) share 메시지를 보낸다", async () => {
    const postMessage = vi.fn();
    (globalThis as { ReactNativeWebView?: unknown }).ReactNativeWebView = { postMessage };

    await expect(shareInvite("0712")).resolves.toBe("shared");

    expect(postMessage).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((postMessage.mock.calls[0] as [string])[0]) as {
      type: string;
      text: string;
    };
    expect(sent.type).toBe("share");
    expect(sent.text).toBe(inviteShareText("0712"));
  });
});
