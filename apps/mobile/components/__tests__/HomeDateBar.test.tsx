import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { HomeDateBar } from "../HomeDateBar";
import {
  __resetHomeDateBarForTests,
  setHomeDateBar,
  subscribeHomeDateBarEvents,
} from "../../lib/homeDateBar";

jest.mock("../HomeDateMenuButton", () => ({
  HomeDateMenuButton: () => null,
}));
jest.mock("../../lib/haptics", () => ({ triggerHaptic: jest.fn() }));

const date = (key: string, label: string) => ({ key, label, accessibilityLabel: `${label} 전체` });

beforeEach(() => __resetHomeDateBarForTests());

it("날짜 줄이 없으면 아무것도 그리지 않는다", () => {
  render(<HomeDateBar chipHeight={36} />);
  expect(screen.queryByLabelText("날짜")).toBeNull();
});

it("받은 날짜를 칩으로 그리고 고른 날을 selected로 표시한다", () => {
  setHomeDateBar({
    type: "set-home-date-bar",
    dates: [date("2026-10-28", "28일 (수)"), date("2026-10-29", "29일 (목)")],
    selectedKey: "2026-10-29",
    todayKey: "2026-10-29",
    atMs: 1,
  });
  render(<HomeDateBar chipHeight={36} />);
  act(() => {
    fireEvent(screen.getByLabelText("날짜"), "layout", { nativeEvent: { layout: { width: 300 } } });
  });
  expect(screen.getByLabelText("29일 (목) 전체").props.accessibilityState).toMatchObject({
    selected: true,
  });
  expect(screen.getByLabelText("28일 (수) 전체").props.accessibilityState).toMatchObject({
    selected: false,
  });
});

it("다른 날을 누르면 웹에 알린다", () => {
  const events: unknown[] = [];
  subscribeHomeDateBarEvents((event) => events.push(event));
  setHomeDateBar({
    type: "set-home-date-bar",
    dates: [date("2026-10-28", "28일 (수)"), date("2026-10-29", "29일 (목)")],
    selectedKey: "2026-10-29",
    todayKey: "2026-10-29",
    atMs: 1,
  });
  render(<HomeDateBar chipHeight={36} />);
  act(() => {
    fireEvent(screen.getByLabelText("날짜"), "layout", { nativeEvent: { layout: { width: 300 } } });
  });
  fireEvent.press(screen.getByLabelText("28일 (수) 전체"));
  expect(events).toEqual([
    expect.objectContaining({ type: "home-date-selected", dateKey: "2026-10-28" }),
  ]);
});

it.each([
  [300, 100],
  [600, 104],
])("스크롤 폭 %i이면 칩 폭은 3분의 1이되 104를 넘지 않아 %i다", (width, chipWidth) => {
  setHomeDateBar({
    type: "set-home-date-bar",
    dates: [date("2026-10-29", "29일 (목)")],
    selectedKey: "2026-10-29",
    todayKey: "2026-10-29",
    atMs: 1,
  });
  render(<HomeDateBar chipHeight={36} />);
  act(() => {
    fireEvent(screen.getByLabelText("날짜"), "layout", { nativeEvent: { layout: { width } } });
  });
  expect(screen.getByLabelText("29일 (목) 전체")).toHaveStyle({ width: chipWidth });
});

it.each([
  [30, 7],
  [44, 0],
])("칩 높이가 %i이면 위아래 터치 여유를 %i씩 줘 44를 채운다", (chipHeight, slop) => {
  setHomeDateBar({
    type: "set-home-date-bar",
    dates: [date("2026-10-29", "29일 (목)")],
    selectedKey: "2026-10-29",
    todayKey: "2026-10-29",
    atMs: 1,
  });
  render(<HomeDateBar chipHeight={chipHeight} />);
  act(() => {
    fireEvent(screen.getByLabelText("날짜"), "layout", { nativeEvent: { layout: { width: 300 } } });
  });
  expect(screen.getByLabelText("29일 (목) 전체").props.hitSlop).toEqual({
    top: slop,
    bottom: slop,
  });
});
