import { Platform } from "react-native";

import {
  __resetHomeDateBarForTests,
  pressHomeMenu,
  pressHomePlay,
  rendersNativeHomeChrome,
  selectHomeDate,
  setHomeDateBar,
  subscribeHomeDateBarEvents,
  useHomeDateBar,
} from "../homeDateBar";
import { renderHook, act } from "@testing-library/react-native";

const date = (key: string) => ({ key, label: key.slice(8), accessibilityLabel: key });
const bar = (selectedKey = "2026-10-29") => ({
  type: "set-home-date-bar" as const,
  dates: [date("2026-10-28"), date("2026-10-29")],
  selectedKey,
  todayKey: "2026-10-29",
  atMs: 1,
});

beforeEach(() => {
  jest.restoreAllMocks();
  __resetHomeDateBarForTests();
});

describe("rendersNativeHomeChrome", () => {
  it("Android는 늘 앱이 그린다", () => {
    jest.replaceProperty(Platform, "OS", "android");
    expect(rendersNativeHomeChrome()).toBe(true);
  });

  it("iOS 26 이상만 앱이 그린다", () => {
    jest.replaceProperty(Platform, "OS", "ios");
    // Version은 getter라 replaceProperty가 거부한다.
    const version = jest.spyOn(Platform, "Version", "get");
    version.mockReturnValue("26.0");
    expect(rendersNativeHomeChrome()).toBe(true);
    version.mockReturnValue("18.5");
    expect(rendersNativeHomeChrome()).toBe(false);
  });
});

describe("날짜 줄 상태", () => {
  it("받은 날짜를 훅이 돌려주고 빈 목록이면 거둔다", () => {
    const { result } = renderHook(() => useHomeDateBar());
    expect(result.current).toBeNull();
    act(() => setHomeDateBar(bar()));
    expect(result.current?.selectedKey).toBe("2026-10-29");
    act(() => setHomeDateBar({ ...bar(), dates: [], selectedKey: "", todayKey: "" }));
    expect(result.current).toBeNull();
  });

  it("칩을 누르면 선택을 먼저 바꾸고 웹에 알린다", () => {
    const events: unknown[] = [];
    subscribeHomeDateBarEvents((event) => events.push(event));
    setHomeDateBar(bar());
    const { result } = renderHook(() => useHomeDateBar());
    act(() => selectHomeDate("2026-10-28"));
    expect(result.current?.selectedKey).toBe("2026-10-28");
    expect(events).toEqual([
      expect.objectContaining({ type: "home-date-selected", dateKey: "2026-10-28" }),
    ]);
  });

  it("이미 고른 날이나 날짜 줄이 없을 때의 누름은 아무 일도 하지 않는다", () => {
    const events: unknown[] = [];
    subscribeHomeDateBarEvents((event) => events.push(event));
    selectHomeDate("2026-10-29");
    setHomeDateBar(bar());
    selectHomeDate("2026-10-29");
    expect(events).toEqual([]);
  });

  it("메뉴와 재생 누름을 웹에 알린다", () => {
    const events: unknown[] = [];
    subscribeHomeDateBarEvents((event) => events.push(event));
    pressHomeMenu("edit-subjects");
    pressHomePlay();
    expect(events).toEqual([
      expect.objectContaining({ type: "home-menu-action", action: "edit-subjects" }),
      expect.objectContaining({ type: "home-play-pressed" }),
    ]);
  });
});
