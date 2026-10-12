import type * as ReactNative from "react-native";

import type * as DirectShareModule from "..";

/**
 * 바로 공유 모듈 래퍼
 *
 * 네이티브 모듈은 불러올 때 한 번 찾으므로 케이스마다 모듈을 새로 불러온다.
 */

type Native = {
  shareToInstagramReels: jest.Mock;
  shareToKakaoTalk: jest.Mock;
};

function load(os: "ios" | "android", native: Native | null): typeof DirectShareModule {
  jest.resetModules();
  jest.doMock("expo-modules-core", () => ({ requireOptionalNativeModule: () => native }));
  const { Platform } = jest.requireActual<typeof ReactNative>("react-native");
  jest.replaceProperty(Platform, "OS", os);
  return jest.requireActual<typeof DirectShareModule>("..");
}

function fakeNative(): Native {
  return {
    shareToInstagramReels: jest.fn().mockResolvedValue(true),
    shareToKakaoTalk: jest.fn().mockResolvedValue(true),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

it("네이티브 모듈이 없으면 릴스 공유는 false다", async () => {
  const { shareToInstagramReels } = load("ios", null);

  await expect(shareToInstagramReels("file:///clip.mp4", "1234")).resolves.toBe(false);
});

it("Android에서 네이티브 모듈이 없으면 카카오톡 공유도 false다", async () => {
  const { shareToKakaoTalk } = load("android", null);

  await expect(shareToKakaoTalk("content://clip.mp4", "본문")).resolves.toBe(false);
});

it("네이티브 모듈이 있으면 같은 인자로 릴스 공유를 부르고 그 결과를 돌려준다", async () => {
  const native = fakeNative();
  native.shareToInstagramReels.mockResolvedValue(false);
  const { shareToInstagramReels } = load("ios", native);

  await expect(shareToInstagramReels("file:///clip.mp4", "1234")).resolves.toBe(false);
  expect(native.shareToInstagramReels).toHaveBeenCalledWith("file:///clip.mp4", "1234");
});

it("iOS에서는 네이티브 모듈이 있어도 카카오톡 공유를 부르지 않고 false다", async () => {
  const native = fakeNative();
  const { shareToKakaoTalk } = load("ios", native);

  await expect(shareToKakaoTalk("file:///clip.mp4", "본문")).resolves.toBe(false);
  expect(native.shareToKakaoTalk).not.toHaveBeenCalled();
});

it("Android에서는 같은 인자로 카카오톡 공유를 부른다", async () => {
  const native = fakeNative();
  const { shareToKakaoTalk } = load("android", native);

  await expect(shareToKakaoTalk("content://clip.mp4", "본문")).resolves.toBe(true);
  expect(native.shareToKakaoTalk).toHaveBeenCalledWith("content://clip.mp4", "본문");
});
