import type { InlineControl } from "@focusmakers/types";
import { readFileSync } from "node:fs";
import path from "node:path";

import type * as WebGlassModule from "..";

/**
 * 웹뷰 본문 glass 컨트롤 모듈 래퍼
 *
 * 네이티브 모듈은 불러올 때 한 번 찾으므로 케이스마다 모듈을 새로 불러온다.
 */

type Native = {
  sync: jest.Mock;
  clear: jest.Mock;
  setInlineClipTop: jest.Mock;
  setInlineColorScheme: jest.Mock;
  observeBackGesture: jest.Mock;
  addListener: jest.Mock;
};

const palette = {
  tintLight: "#3366FF",
  tintDark: "#6699FF",
  foregroundLight: "#191F28",
  foregroundDark: "#F9FAFB",
  disabledLight: "#D1D6DB",
  disabledDark: "#4E5968",
  prominentLight: "#1B64DA",
  prominentDark: "#4593FC",
  onProminentLight: "#FFFFFF",
  onProminentDark: "#FFFFFF",
  dangerLight: "#D22030",
  dangerDark: "#F0555F",
  activeLight: "#1B64DA",
  activeDark: "#4593FC",
};

const controls: InlineControl[] = [
  {
    id: "records:period",
    kind: "segment",
    frame: { x: 20, y: 120, width: 200, height: 32 },
    labels: ["일간", "주간"],
    selected: 0,
    disabled: [false, false],
    accessibilityLabel: null,
  },
];

// 첫 jest.resetModules가 전역의 지연 fetch를 깨우며 expo-modules-core를 먼저 불러와서, 그 뒤에 건 jest.doMock은 무시된다.
// 그래서 파일 맨 위에서 mock하고, fetch가 쓰는 나머지 함수는 실제 모듈 것을 둔다.
let mockNative: Native | null = null;
jest.mock("expo-modules-core", () => ({
  ...jest.requireActual<object>("expo-modules-core"),
  requireOptionalNativeModule: () => mockNative,
}));

function load(native: Native | null): typeof WebGlassModule {
  jest.resetModules();
  mockNative = native;
  return jest.requireActual<typeof WebGlassModule>("..");
}

function fakeNative(): Native {
  return {
    sync: jest.fn().mockResolvedValue(1),
    clear: jest.fn().mockResolvedValue(undefined),
    setInlineClipTop: jest.fn().mockResolvedValue(undefined),
    setInlineColorScheme: jest.fn().mockResolvedValue(undefined),
    observeBackGesture: jest.fn().mockResolvedValue(undefined),
    addListener: jest.fn(),
  };
}

// 거부를 받아 주지 않으면 다음 틱에 unhandledRejection이 난다.
async function collectUnhandledRejections(run: () => void): Promise<unknown[]> {
  const reasons: unknown[] = [];
  const onRejection = (reason: unknown) => reasons.push(reason);
  process.on("unhandledRejection", onRejection);
  try {
    run();
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.off("unhandledRejection", onRejection);
  }
  return reasons;
}

it("모듈이 있으면 같은 인자로 네이티브 sync를 부른다", () => {
  const native = fakeNative();
  const { syncInlineControls } = load(native);

  syncInlineControls(7, controls, true, palette);

  expect(native.sync).toHaveBeenCalledWith(7, controls, true, palette);
});

it("sync는 붙인 개수를 돌려주고 거부와 모듈 없음은 null로 돌려준다", async () => {
  const native = fakeNative();
  native.sync.mockResolvedValueOnce(1).mockRejectedValueOnce(new Error("no web view"));
  const { syncInlineControls } = load(native);

  await expect(syncInlineControls(7, controls, false, palette)).resolves.toBe(1);
  await expect(syncInlineControls(7, controls, false, palette)).resolves.toBeNull();
  await expect(load(null).syncInlineControls(7, controls, false, palette)).resolves.toBeNull();
});

it("모듈이 없으면 sync와 clear가 아무 일도 하지 않고 오류를 내지 않는다", () => {
  const { syncInlineControls, clearInlineControls, addInlineControlPressListener } = load(null);

  expect(() => syncInlineControls(7, controls, false, palette)).not.toThrow();
  expect(() => clearInlineControls(7)).not.toThrow();
  expect(() => addInlineControlPressListener(jest.fn())()).not.toThrow();
});

it("네이티브 sync와 clear가 거부해도 처리되지 않은 거부가 남지 않는다", async () => {
  const native = fakeNative();
  native.sync.mockRejectedValue(new Error("no web view"));
  native.clear.mockRejectedValue(new Error("no web view"));
  const { syncInlineControls, clearInlineControls } = load(native);

  const reasons = await collectUnhandledRejections(() => {
    syncInlineControls(7, controls, false, palette);
    clearInlineControls(7);
  });

  expect(reasons).toEqual([]);
  expect(native.clear).toHaveBeenCalledWith(7);
});

it("자르는 선은 같은 태그와 값으로 네이티브를 부르고 거부를 삼킨다", async () => {
  const native = fakeNative();
  native.setInlineClipTop.mockRejectedValue(new Error("no web view"));
  const { setInlineClipTop } = load(native);

  const reasons = await collectUnhandledRejections(() => {
    setInlineClipTop(7, 52);
  });

  expect(native.setInlineClipTop).toHaveBeenCalledWith(7, 52);
  expect(reasons).toEqual([]);
});

it("함수가 생기기 전에 만든 앱의 모듈이거나 모듈이 없으면 자르는 선이 아무 일도 하지 않는다", () => {
  const { setInlineClipTop: _missing, ...olderNative } = fakeNative();

  expect(() => load(olderNative as Native).setInlineClipTop(7, 52)).not.toThrow();
  expect(() => load(null).setInlineClipTop(7, 52)).not.toThrow();
});

it("누름 구독 해제 함수는 네이티브 구독의 remove를 부른다", () => {
  const native = fakeNative();
  const remove = jest.fn();
  native.addListener.mockReturnValue({ remove });
  const { addInlineControlPressListener } = load(native);
  const listener = jest.fn();

  const unsubscribe = addInlineControlPressListener(listener);

  expect(native.addListener).toHaveBeenCalledWith("onPress", listener);
  expect(remove).not.toHaveBeenCalled();
  unsubscribe();
  expect(remove).toHaveBeenCalledTimes(1);
});

it("뒤로 가기 스와이프 관찰은 같은 태그로 네이티브를 부르고 거부를 삼킨다", async () => {
  const native = fakeNative();
  native.observeBackGesture.mockRejectedValue(new Error("no web view"));
  const { observeBackGesture } = load(native);

  const reasons = await collectUnhandledRejections(() => {
    observeBackGesture(7);
  });

  expect(native.observeBackGesture).toHaveBeenCalledWith(7);
  expect(reasons).toEqual([]);
});

it("뒤로 가기 스와이프 구독 해제 함수는 네이티브 구독의 remove를 부른다", () => {
  const native = fakeNative();
  const remove = jest.fn();
  native.addListener.mockReturnValue({ remove });
  const { addBackGestureListener } = load(native);
  const listener = jest.fn();

  const unsubscribe = addBackGestureListener(listener);

  expect(native.addListener).toHaveBeenCalledWith("onBackGesture", listener);
  unsubscribe();
  expect(remove).toHaveBeenCalledTimes(1);
});

it("모듈이 없으면 뒤로 가기 스와이프 관찰과 구독이 아무 일도 하지 않는다", () => {
  const { observeBackGesture, addBackGestureListener } = load(null);

  expect(() => observeBackGesture(7)).not.toThrow();
  expect(() => addBackGestureListener(jest.fn())()).not.toThrow();
});

it("함수가 생기기 전에 만든 앱의 모듈이면 뒤로 가기 스와이프 관찰이 아무 일도 하지 않는다", () => {
  const { observeBackGesture: _missing, ...olderNative } = fakeNative();
  const { observeBackGesture } = load(olderNative as Native);

  expect(() => observeBackGesture(7)).not.toThrow();
});

it("층 테마는 같은 태그와 값으로 네이티브를 부르고 거부를 삼킨다", async () => {
  const native = fakeNative();
  native.setInlineColorScheme.mockRejectedValue(new Error("no web view"));
  const { setInlineColorScheme } = load(native);

  const reasons = await collectUnhandledRejections(() => {
    setInlineColorScheme(7, "dark");
    setInlineColorScheme(7, null);
  });

  expect(native.setInlineColorScheme).toHaveBeenNthCalledWith(1, 7, "dark");
  expect(native.setInlineColorScheme).toHaveBeenNthCalledWith(2, 7, null);
  expect(reasons).toEqual([]);
});

it("함수가 생기기 전에 만든 앱의 모듈이면 층 테마가 아무 일도 하지 않는다", () => {
  const { setInlineColorScheme: _missing, ...olderNative } = fakeNative();
  const { setInlineColorScheme } = load(olderNative as Native);

  expect(() => setInlineColorScheme(7, "dark")).not.toThrow();
});

it("앱이 알리는 본문 부품 종류는 Swift가 그리는 종류와 같다", () => {
  const swift = readFileSync(path.join(__dirname, "../ios/WebGlassModule.swift"), "utf-8");
  const drawn = [...swift.matchAll(/case "([a-z]+)":/g)].map(([, kind]) => kind);

  expect(load(null).SUPPORTED_INLINE_KINDS).toEqual(["segment", "switch", "button"]);
  expect(drawn).toEqual([...load(null).SUPPORTED_INLINE_KINDS]);
});
