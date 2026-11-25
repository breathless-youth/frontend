import { afterEach, describe, expect, it, vi } from "vitest";

import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativeBackgroundPhotoForTests,
  canUseNativeBackgroundPhoto,
  pickNativeBackgroundPhoto,
} from "@/lib/nativeBackgroundPhoto";

const postMessage = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  postMessage.mockReset();
  window.history.replaceState(null, "", "/");
  __resetNativeBackgroundPhotoForTests();
});

function enableNativePicker() {
  window.history.replaceState(null, "", "/settings?backgroundPhotoPicker=1");
  __resetNativeBackgroundPhotoForTests();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
}

function lastRequestId(): string {
  const message = JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string) as {
    type: string;
    id: string;
  };
  expect(message.type).toBe("pick-background-photo");
  return message.id;
}

function reply(message: Record<string, unknown>) {
  const entry = (globalThis as unknown as Record<string, (raw: string) => void>)[
    NATIVE_MESSAGE_ENTRY
  ];
  entry(JSON.stringify({ type: "background-photo-result", atMs: 1, ...message }));
}

describe("canUseNativeBackgroundPhoto", () => {
  it("backgroundPhotoPicker 표시와 브리지가 모두 있을 때만 참이다", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage });
    // 프로필 선택기만 아는 앱은 배경 요청을 모른다.
    window.history.replaceState(null, "", "/settings?profilePhotoPicker=1");
    __resetNativeBackgroundPhotoForTests();
    expect(canUseNativeBackgroundPhoto()).toBe(false);

    enableNativePicker();
    expect(canUseNativeBackgroundPhoto()).toBe(true);
  });
});

describe("pickNativeBackgroundPhoto", () => {
  it("picked면 받은 JPEG 바이트와 크기를 돌려준다", async () => {
    enableNativePicker();

    const pending = pickNativeBackgroundPhoto();
    reply({ id: lastRequestId(), status: "picked", data: btoa("jpeg"), width: 1080, height: 1920 });

    const photo = await pending;
    expect(photo).toMatchObject({ width: 1080, height: 1920 });
    expect(new TextDecoder().decode(photo!.bytes)).toBe("jpeg");
  });

  it("cancelled면 null이고 failed나 다른 요청의 응답은 무시하거나 거절한다", async () => {
    enableNativePicker();

    const cancelled = pickNativeBackgroundPhoto();
    const cancelId = lastRequestId();
    reply({ id: "other", status: "failed" });
    reply({ id: cancelId, status: "cancelled" });
    expect(await cancelled).toBeNull();

    const failed = pickNativeBackgroundPhoto();
    reply({ id: lastRequestId(), status: "failed" });
    await expect(failed).rejects.toBeInstanceOf(UnusablePhotoError);
  });

  it("본문이 비었거나 크기가 없으면 쓸 수 없는 사진이다", async () => {
    enableNativePicker();

    const empty = pickNativeBackgroundPhoto();
    reply({ id: lastRequestId(), status: "picked", data: "", width: 1080, height: 1920 });
    await expect(empty).rejects.toBeInstanceOf(UnusablePhotoError);

    const sizeless = pickNativeBackgroundPhoto();
    reply({ id: lastRequestId(), status: "picked", data: btoa("jpeg") });
    await expect(sizeless).rejects.toBeInstanceOf(UnusablePhotoError);
  });
});
