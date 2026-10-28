import { afterEach, describe, expect, it, vi } from "vitest";

import { UnusablePhotoError } from "@/features/profile/prepareProfilePhoto";
import { NATIVE_MESSAGE_ENTRY } from "@/lib/bridge";
import {
  __resetNativeProfilePhotoForTests,
  canUseNativeProfilePhoto,
  pickNativeProfilePhoto,
} from "@/lib/nativeProfilePhoto";

const postMessage = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  postMessage.mockReset();
  window.history.replaceState(null, "", "/");
  __resetNativeProfilePhotoForTests();
});

function nativeEntry(): (raw: string) => void {
  return (globalThis as unknown as Record<string, (raw: string) => void>)[NATIVE_MESSAGE_ENTRY];
}

/** 표시와 브리지를 함께 둔다. */
function enableNativePicker() {
  window.history.replaceState(null, "", "/profile?profilePhotoPicker=1");
  __resetNativeProfilePhotoForTests();
  vi.stubGlobal("ReactNativeWebView", { postMessage });
}

/** 마지막으로 보낸 요청이 선택기 열기인지 확인하고 그 id를 돌려준다. */
function lastRequestId(): string {
  const message = JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string) as {
    type: string;
    id: string;
  };
  expect(message.type).toBe("pick-profile-photo");
  return message.id;
}

function reply(message: Record<string, unknown>) {
  nativeEntry()(JSON.stringify({ type: "profile-photo-result", atMs: 1, ...message }));
}

describe("canUseNativeProfilePhoto", () => {
  it("profilePhotoPicker 표시와 브리지가 모두 있을 때만 참이다", () => {
    window.history.replaceState(null, "", "/profile?profilePhotoPicker=1");
    __resetNativeProfilePhotoForTests();
    expect(canUseNativeProfilePhoto()).toBe(false);

    vi.stubGlobal("ReactNativeWebView", { postMessage });
    expect(canUseNativeProfilePhoto()).toBe(true);
  });

  it("브리지가 있어도 표시가 없으면 거짓이다 (iOS, 이 메시지를 모르는 구버전 Android 앱)", () => {
    vi.stubGlobal("ReactNativeWebView", { postMessage });

    expect(canUseNativeProfilePhoto()).toBe(false);
  });

  it("처음 읽은 표시를 유지한다 (앱 안 이동이 쿼리를 없애도 바뀌지 않는다)", () => {
    enableNativePicker();
    expect(canUseNativeProfilePhoto()).toBe(true);

    window.history.replaceState(null, "", "/settings");
    expect(canUseNativeProfilePhoto()).toBe(true);
  });
});

describe("pickNativeProfilePhoto", () => {
  it("picked면 받은 base64를 JPEG Blob으로 돌려준다", async () => {
    enableNativePicker();

    const pending = pickNativeProfilePhoto();
    reply({ id: lastRequestId(), status: "picked", data: btoa("jpeg") });

    const blob = await pending;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("image/jpeg");
    expect(blob?.size).toBe(4);
  });

  it("cancelled면 null이다", async () => {
    enableNativePicker();

    const pending = pickNativeProfilePhoto();
    reply({ id: lastRequestId(), status: "cancelled" });

    await expect(pending).resolves.toBeNull();
  });

  it("failed면 UnusablePhotoError다", async () => {
    enableNativePicker();

    const pending = pickNativeProfilePhoto();
    reply({ id: lastRequestId(), status: "failed" });

    await expect(pending).rejects.toBeInstanceOf(UnusablePhotoError);
  });

  it("base64가 깨졌으면 UnusablePhotoError다", async () => {
    enableNativePicker();

    const pending = pickNativeProfilePhoto();
    reply({ id: lastRequestId(), status: "picked", data: "%%%" });

    await expect(pending).rejects.toBeInstanceOf(UnusablePhotoError);
  });

  it("picked인데 풀어 보니 0바이트면 UnusablePhotoError다", async () => {
    enableNativePicker();

    const pending = pickNativeProfilePhoto();
    reply({ id: lastRequestId(), status: "picked", data: "" });

    await expect(pending).rejects.toBeInstanceOf(UnusablePhotoError);
  });

  it("다른 id의 응답은 무시하고 자기 응답을 기다린다", async () => {
    enableNativePicker();

    const pending = pickNativeProfilePhoto();
    const id = lastRequestId();
    reply({ id: "someone-else", status: "cancelled" });
    reply({ id, status: "picked", data: btoa("jpeg") });

    await expect(pending).resolves.toBeInstanceOf(Blob);
  });

  it("요청을 브리지에 넘기지 못하면 기다리지 않고 UnusablePhotoError다", async () => {
    window.history.replaceState(null, "", "/profile?profilePhotoPicker=1");
    __resetNativeProfilePhotoForTests();
    vi.stubGlobal("ReactNativeWebView", {
      postMessage: () => {
        throw new TypeError("gone");
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(pickNativeProfilePhoto()).rejects.toBeInstanceOf(UnusablePhotoError);
  });
});
