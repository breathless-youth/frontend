import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as Bridge from "@/lib/bridge";
import { isNativeBridgeAvailable } from "@/lib/bridge";
import type * as NativeVideo from "@/lib/nativeVideo";
import { canUseNativeVideo, saveVideoNatively, shareVideoNatively } from "@/lib/nativeVideo";

import {
  saveTimelapse,
  shareResultNotice,
  shareRoutes,
  shareTimelapse,
  shareVideoWidth,
  timelapseFileName,
} from "../timelapseShare";

vi.mock("@/lib/nativeVideo", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeVideo>()),
  canUseNativeVideo: vi.fn(() => false),
  saveVideoNatively: vi.fn(() => Promise.resolve("saved")),
  shareVideoNatively: vi.fn(() => Promise.resolve("shared")),
}));
vi.mock("@/lib/bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof Bridge>()),
  isNativeBridgeAvailable: vi.fn(() => false),
}));

const T0 = new Date(2026, 9, 5, 21, 3).getTime();
const VIDEO = new Blob([new Uint8Array([1])], { type: "video/mp4" });

/** jsdom에는 Web Share가 없어 테스트마다 붙였다 뗀다. */
function stubWebShare(canShare: () => boolean, share = vi.fn(() => Promise.resolve())) {
  Object.defineProperty(navigator, "canShare", { configurable: true, value: vi.fn(canShare) });
  Object.defineProperty(navigator, "share", { configurable: true, value: share });
  return share;
}

beforeEach(() => {
  vi.mocked(canUseNativeVideo).mockReturnValue(false);
  vi.mocked(isNativeBridgeAvailable).mockReturnValue(false);
});

afterEach(() => {
  Reflect.deleteProperty(navigator, "canShare");
  Reflect.deleteProperty(navigator, "share");
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("shareRoutes", () => {
  it("새 앱은 저장과 공유를 모두 앱에 맡긴다", () => {
    vi.mocked(canUseNativeVideo).mockReturnValue(true);

    expect(shareRoutes()).toEqual({ save: "native", share: "native" });
  });

  it("브라우저는 다운로드로 저장하고 파일 공유가 되면 브라우저 공유를 쓴다", () => {
    stubWebShare(() => true);

    expect(shareRoutes()).toEqual({ save: "browser", share: "browser" });
  });

  it("브라우저가 파일을 공유할 수 없으면 공유를 숨긴다", () => {
    expect(shareRoutes()).toEqual({ save: "browser", share: null });
  });

  it("구 버전 앱은 저장을 숨기고 파일 공유가 될 때만 브라우저 공유를 쓴다", () => {
    vi.mocked(isNativeBridgeAvailable).mockReturnValue(true);
    expect(shareRoutes()).toEqual({ save: null, share: null });

    stubWebShare(() => true);
    expect(shareRoutes()).toEqual({ save: null, share: "browser" });
  });

  it("영상이 나오기 전에 빈 mp4 파일로 공유 가능 여부를 묻는다", () => {
    stubWebShare(() => true);

    shareRoutes();

    const [data] = vi.mocked(navigator.canShare).mock.calls[0]!;
    expect(data?.files?.[0]?.type).toBe("video/mp4");
    expect(data?.files?.[0]?.size).toBe(0);
  });

  it("공유 가능 여부를 묻다 오류가 나면 공유를 숨긴다", () => {
    stubWebShare(() => {
      throw new TypeError("files 미지원");
    });

    expect(shareRoutes().share).toBeNull();
  });
});

describe("timelapseFileName", () => {
  it("공부를 시작한 날짜로 이름을 짓는다", () => {
    expect(timelapseFileName(T0)).toBe("focusmakers-timelapse-20261005.mp4");
  });

  it("한 자리 월·일은 0을 채운다", () => {
    expect(timelapseFileName(new Date(2026, 0, 9, 0, 30).getTime())).toBe(
      "focusmakers-timelapse-20260109.mp4",
    );
  });
});

describe("saveTimelapse", () => {
  it("새 앱은 앱 저장 결과를 그대로 돌려준다", async () => {
    vi.mocked(saveVideoNatively).mockResolvedValue("denied");

    await expect(saveTimelapse("native", VIDEO, T0)).resolves.toBe("denied");
    expect(saveVideoNatively).toHaveBeenCalledWith(VIDEO);
  });

  it("브라우저는 시작 날짜 이름으로 내려받고 잠시 뒤 주소를 푼다", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:video"),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    const clicked: Array<{ href: string; download: string; connected: boolean }> = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download, connected: this.isConnected });
    });

    await expect(saveTimelapse("browser", VIDEO, T0)).resolves.toBe("saved");

    expect(clicked).toEqual([
      { href: "blob:video", download: "focusmakers-timelapse-20261005.mp4", connected: false },
    ]);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith("blob:video");
  });

  it("다운로드 클릭이 실패해도 잠시 뒤 주소를 푼다", () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:video"),
    });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("다운로드 차단");
    });

    expect(() => saveTimelapse("browser", VIDEO, T0)).toThrow("다운로드 차단");

    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith("blob:video");
  });
});

describe("shareTimelapse", () => {
  it("새 앱은 앱 공유 결과를 그대로 돌려준다", async () => {
    vi.mocked(shareVideoNatively).mockResolvedValue("dismissed");

    await expect(shareTimelapse("native", VIDEO, T0)).resolves.toBe("dismissed");
    expect(shareVideoNatively).toHaveBeenCalledWith(VIDEO);
  });

  it("브라우저는 mp4 파일과 설치 링크 본문을 공유한다", async () => {
    const share = stubWebShare(() => true);

    await expect(shareTimelapse("browser", VIDEO, T0)).resolves.toBe("shared");

    const [data] = share.mock.calls[0] as unknown as [ShareData];
    expect(data.files?.[0]?.name).toBe("focusmakers-timelapse-20261005.mp4");
    expect(data.files?.[0]?.type).toBe("video/mp4");
    expect(data.text).toContain("/download?utm_source=timelapse");
  });

  it("공유 창을 닫으면 dismissed, 그 밖의 오류는 failed로 바꾼다", async () => {
    stubWebShare(
      () => true,
      vi.fn(() => Promise.reject(new DOMException("닫음", "AbortError"))),
    );
    await expect(shareTimelapse("browser", VIDEO, T0)).resolves.toBe("dismissed");

    stubWebShare(
      () => true,
      vi.fn(() => Promise.reject(new DOMException("겹침", "InvalidStateError"))),
    );
    await expect(shareTimelapse("browser", VIDEO, T0)).resolves.toBe("failed");
  });
});

describe("shareResultNotice", () => {
  it.each([
    ["save", "native", "saved", { text: "사진 앱에 저장했어요" }],
    ["save", "native", "denied", { text: "사진 접근 권한이 꺼져 있어요", openSettings: true }],
    ["save", "native", "failed", { text: "저장하지 못했어요. 다시 시도해 주세요" }],
    ["save", "browser", "saved", null],
    ["save", "browser", "failed", { text: "저장하지 못했어요. 다시 시도해 주세요" }],
    ["share", "native", "failed", { text: "공유하지 못했어요. 다시 시도해 주세요" }],
    ["share", "native", "denied", { text: "공유하지 못했어요. 다시 시도해 주세요" }],
    ["share", "browser", "failed", { text: "공유하지 못했어요. 다시 시도해 주세요" }],
    ["share", "native", "shared", null],
    ["share", "browser", "dismissed", null],
  ] as const)("%s·%s·%s", (action, route, result, expected) => {
    expect(shareResultNotice(action, route, result)).toEqual(expected);
  });
});

describe("shareVideoWidth", () => {
  const chrome = { x: 48, y: 85 };

  it("자리가 넉넉하면 시안 폭을 쓴다", () => {
    expect(shareVideoWidth("9:16", { width: 375, height: 800 }, chrome)).toBe(296);
    expect(shareVideoWidth("16:9", { width: 375, height: 800 }, { x: 32, y: 85 })).toBe(312);
  });

  it("높이가 모자라면 비율을 지키며 줄인다", () => {
    // (400 - 85) × 9/16 = 177.1875
    expect(shareVideoWidth("9:16", { width: 375, height: 400 }, chrome)).toBe(177);
  });

  it("폭이 모자라면 폭에 맞춘다", () => {
    expect(shareVideoWidth("16:9", { width: 320, height: 800 }, { x: 32, y: 85 })).toBe(288);
  });

  it("자리가 없으면 0이다", () => {
    expect(shareVideoWidth("9:16", { width: 375, height: 40 }, chrome)).toBe(0);
  });

  it("아직 재지 않았으면 시안 폭을 쓴다", () => {
    expect(shareVideoWidth("9:16", { width: Infinity, height: Infinity }, chrome)).toBe(296);
  });
});
