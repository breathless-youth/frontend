import { AppState, Platform } from "react-native";

import {
  __resetLiveActivityForTests,
  applyLiveActivitySnapshot,
  endLeftoverLiveActivities,
  endLiveActivity,
  isLiveActivitySupported,
} from "../liveActivity";

const mockStart = jest.fn();
const mockUpdate = jest.fn(() => Promise.resolve());
const mockEnd = jest.fn(() => Promise.resolve());
const mockGetInstances = jest.fn(() => [] as { end: typeof mockEnd }[]);

jest.mock("../../widgets/StudySessionActivity", () => ({
  __esModule: true,
  default: {
    start: (...args: unknown[]) => {
      mockStart(...args);
      return { update: mockUpdate, end: mockEnd };
    },
    getInstances: () => mockGetInstances(),
  },
}));
const mockWidgets: { widgetsDirectory: string | null } = { widgetsDirectory: null };
jest.mock("expo-widgets", () => ({
  get widgetsDirectory() {
    return mockWidgets.widgetsDirectory;
  },
}));
const mockLoadAsync = jest.fn(() =>
  Promise.resolve([{ localUri: "file:///bundle/icon.png", uri: "http://metro/icon.png" }]),
);
jest.mock("expo-asset", () => ({
  Asset: { loadAsync: (...args: unknown[]) => mockLoadAsync(...(args as [])) },
}));
const mockCopy = jest.fn((_target: { uri: string }) => Promise.resolve());
const mockExistingFiles = new Set<string>();
jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join("/");
    }
    get exists() {
      return mockExistingFiles.has(this.uri);
    }
    copy(target: { uri: string }) {
      return mockCopy(target);
    }
  },
}));

const GROUP_DIR = "file:///group/ExpoWidgets";
const ICON_URI = `${GROUP_DIR}/live-activity-icon.png`;
const MINUTE = 60 * 1000;
// 비동기 거부와 복사 완료를 모두 처리할 만큼 한 바퀴 넘긴다.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

const snap = {
  mode: "camera" as const,
  subject: "수학",
  state: "running" as const,
  elapsedSec: 10,
};
let appStateListener: ((state: string) => void) | null = null;

beforeAll(() => {
  process.on("unhandledRejection", onUnhandled);
});

afterAll(() => {
  process.off("unhandledRejection", onUnhandled);
});

beforeEach(() => {
  unhandled.length = 0;
  mockWidgets.widgetsDirectory = null;
  mockExistingFiles.clear();
  jest.replaceProperty(Platform, "OS", "ios");
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    appStateListener = listener as (state: string) => void;
    return {
      remove: () => {
        appStateListener = null;
      },
    } as ReturnType<typeof AppState.addEventListener>;
  });
  jest.spyOn(console, "warn").mockImplementation(() => undefined);
  __resetLiveActivityForTests();
  jest.clearAllMocks();
});

afterEach(async () => {
  __resetLiveActivityForTests();
  await flush();
  expect(unhandled).toEqual([]);
  jest.restoreAllMocks();
});

it("첫 스냅샷이면 시작하고 다음 스냅샷은 갱신한다", () => {
  applyLiveActivitySnapshot(snap, 1000);
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockStart).toHaveBeenCalledWith(
    expect.objectContaining({ subject: "수학", paused: false, startedAtMs: -9000 }),
    undefined,
    undefined,
  );
  applyLiveActivitySnapshot({ ...snap, state: "paused" }, 2000);
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(mockUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ paused: true }), undefined);
});

it("null이 오면 끝내고 앱 상태 구독도 푼다", () => {
  applyLiveActivitySnapshot(snap, 1000);
  applyLiveActivitySnapshot(null, 2000);
  expect(mockEnd).toHaveBeenCalledWith("immediate");
  expect(appStateListener).toBeNull();
});

it("앱 밖으로 나가면 끝날 시각을 넣어 갱신하고 돌아오면 끝날 시각 없이 갱신한다", () => {
  applyLiveActivitySnapshot(snap, 1000);
  appStateListener?.("background");
  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ paused: true }),
    expect.any(Date),
  );
  appStateListener?.("active");
  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ paused: false }),
    undefined,
  );
});

it("이미 나가 있는 동안 온 스냅샷은 나간 시각을 그대로 쓴다", () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(5000);
  applyLiveActivitySnapshot(snap, 1000);
  appStateListener?.("background");
  now.mockReturnValue(9000);
  appStateListener?.("background");
  applyLiveActivitySnapshot({ ...snap, mode: "timer" }, 6000);
  const staleDate = (mockUpdate.mock.lastCall as unknown as [unknown, Date])[1];
  expect(staleDate.getTime()).toBe(5000 + 2 * 60 * 60 * 1000);
});

it("inactive는 무시한다", () => {
  applyLiveActivitySnapshot(snap, 1000);
  appStateListener?.("inactive");
  expect(mockUpdate).not.toHaveBeenCalled();
});

it("시작이 실패해도 throw하지 않고 다음 스냅샷에 다시 시작한다", () => {
  mockStart.mockImplementationOnce(() => {
    throw new Error("denied");
  });
  expect(() => applyLiveActivitySnapshot(snap, 1000)).not.toThrow();
  expect(console.warn).toHaveBeenCalled();
  applyLiveActivitySnapshot({ ...snap, state: "paused" }, 2000);
  expect(mockStart).toHaveBeenCalledTimes(2);
  expect(mockUpdate).not.toHaveBeenCalled();
});

it("iOS가 아니면 아무것도 하지 않는다", () => {
  jest.replaceProperty(Platform, "OS", "android");
  applyLiveActivitySnapshot(snap, 1000);
  expect(mockStart).not.toHaveBeenCalled();
});

it("위젯 모듈을 불러올 수 있는 iOS에서만 그릴 수 있다고 답한다", () => {
  expect(isLiveActivitySupported()).toBe(true);
  jest.replaceProperty(Platform, "OS", "android");
  expect(isLiveActivitySupported()).toBe(false);
});

it("실행 시 남은 활동을 모두 끝낸다", () => {
  mockGetInstances.mockReturnValueOnce([{ end: mockEnd }, { end: mockEnd }]);
  endLeftoverLiveActivities();
  expect(mockEnd).toHaveBeenCalledTimes(2);
  expect(mockEnd).toHaveBeenCalledWith("immediate");
});

it("관리 모드가 나간 직후 일시정지 스냅샷이 와도 끝날 시각을 유지한다", () => {
  jest.spyOn(Date, "now").mockReturnValue(5000);
  applyLiveActivitySnapshot(snap, 1000);
  appStateListener?.("background");
  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ paused: true, pausedAtMs: 5000 }),
    new Date(5000 + 20 * MINUTE),
  );

  applyLiveActivitySnapshot({ ...snap, state: "paused", elapsedSec: 14 }, 5100);

  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ paused: true, pausedAtMs: 5100 }),
    new Date(5100 + 20 * MINUTE),
  );
});

it("끝난 모양이 된 뒤 돌아오면 끝날 시각 없이 다시 그린다", () => {
  const now = jest.spyOn(Date, "now").mockReturnValue(5000);
  applyLiveActivitySnapshot(snap, 1000);
  appStateListener?.("background");
  now.mockReturnValue(5000 + 21 * MINUTE);

  appStateListener?.("active");

  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ paused: false, pausedAtMs: null }),
    undefined,
  );
});

it("갱신이 실패해도 경고만 남긴다", async () => {
  applyLiveActivitySnapshot(snap, 1000);
  const error = new Error("update");
  mockUpdate.mockImplementationOnce(() => Promise.reject(error));

  applyLiveActivitySnapshot({ ...snap, state: "paused" }, 2000);
  await flush();

  expect(console.warn).toHaveBeenCalledWith("[live-activity] 갱신 실패", error);
});

it("현재 표시를 끝내다 실패해도 경고만 남긴다", async () => {
  applyLiveActivitySnapshot(snap, 1000);
  const error = new Error("end");
  mockEnd.mockImplementationOnce(() => Promise.reject(error));

  endLiveActivity();
  await flush();

  expect(console.warn).toHaveBeenCalledWith("[live-activity] 종료 실패", error);
});

it("남은 표시를 끝내다 실패해도 경고만 남기고 나머지는 끝낸다", async () => {
  const error = new Error("leftover");
  mockGetInstances.mockReturnValueOnce([
    { end: jest.fn(() => Promise.reject(error)) },
    { end: mockEnd },
  ]);

  endLeftoverLiveActivities();
  await flush();

  expect(mockEnd).toHaveBeenCalledWith("immediate");
  expect(console.warn).toHaveBeenCalledWith("[live-activity] 남은 표시 종료 실패", error);
});

it("아이콘 복사가 끝난 뒤에 아이콘 주소를 넣어 다시 그린다", async () => {
  mockWidgets.widgetsDirectory = GROUP_DIR;
  let finishCopy = () => undefined as void;
  mockCopy.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishCopy = resolve;
      }),
  );

  applyLiveActivitySnapshot(snap, 1000);
  expect(mockStart).toHaveBeenCalledWith(
    expect.objectContaining({ iconUri: null }),
    undefined,
    undefined,
  );
  await flush();
  expect(mockCopy).toHaveBeenCalledWith(expect.objectContaining({ uri: ICON_URI }));
  expect(mockUpdate).not.toHaveBeenCalled();

  finishCopy();
  await flush();

  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ iconUri: ICON_URI }),
    undefined,
  );
});

it("공유 폴더에 아이콘이 이미 있으면 다시 복사하지 않는다", async () => {
  mockWidgets.widgetsDirectory = GROUP_DIR;
  mockExistingFiles.add(ICON_URI);

  applyLiveActivitySnapshot(snap, 1000);
  await flush();

  expect(mockCopy).not.toHaveBeenCalled();
  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ iconUri: ICON_URI }),
    undefined,
  );
});

it("아이콘 복사가 실패하면 아이콘 없이 그리고 경고만 남긴다", async () => {
  mockWidgets.widgetsDirectory = GROUP_DIR;
  const error = new Error("copy");
  mockCopy.mockImplementationOnce(() => Promise.reject(error));

  applyLiveActivitySnapshot(snap, 1000);
  await flush();

  expect(console.warn).toHaveBeenCalledWith("[live-activity] 아이콘 복사 실패", error);
  expect(mockUpdate).not.toHaveBeenCalled();
  applyLiveActivitySnapshot({ ...snap, state: "paused" }, 2000);
  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ iconUri: null }),
    undefined,
  );
});

it("일시정지 중 과목만 바뀌어도 끝날 시각은 처음 멈춘 시각부터 센다", () => {
  const T = 1_000_000;
  const now = jest.spyOn(Date, "now").mockReturnValue(T);
  const paused = { ...snap, state: "paused" as const };
  applyLiveActivitySnapshot(paused, T);
  applyLiveActivitySnapshot({ ...paused, subject: "영어" }, T + 10 * MINUTE);
  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ subject: "영어", pausedAtMs: T }),
    undefined,
  );

  now.mockReturnValue(T + 11 * MINUTE);
  appStateListener?.("background");

  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ subject: "영어", paused: true }),
    new Date(T + 20 * MINUTE),
  );
});

it("흐르는 중에 과목이 바뀌면 새 스냅샷 시각을 쓴다", () => {
  applyLiveActivitySnapshot(snap, 1000);
  applyLiveActivitySnapshot({ ...snap, subject: "영어", elapsedSec: 15 }, 6000);

  expect(mockUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({ subject: "영어", startedAtMs: 6000 - 15_000 }),
    undefined,
  );
});
