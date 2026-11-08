import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import "@/lib/i18n";
import { RoomScreen } from "../MockScreens";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("아래 바는 카메라·마이크·타이머·배경음·나가기 순서다", () => {
  const { container } = render(<RoomScreen />);
  const order = [...container.querySelectorAll("[data-control]")].map((el) =>
    el.getAttribute("data-control"),
  );
  expect(order).toEqual(["camera", "mic", "timer", "ambient", "exit"]);
});

it("위쪽에 과목과 순공 뱃지, 총 시간을 보이고 1초마다 늘린다", () => {
  render(<RoomScreen />);
  expect(screen.getByText("수학")).toBeInTheDocument();
  expect(screen.getByText("00:48:12")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("00:48:13")).toBeInTheDocument();
  expect(screen.getByText(/총\s*01:02:31/)).toBeInTheDocument();
});

it("타일 닉네임 옆 마이크는 나와 수아만 켜져 있다", () => {
  const { container } = render(<RoomScreen />);
  const mics = [...container.querySelectorAll("[data-mic]")].map((el) =>
    el.getAttribute("data-mic"),
  );
  expect(mics).toEqual(["on", "off", "off", "on", "off", "off"]);
});

it("목업 안에는 누를 수 있는 버튼이 없다", () => {
  render(<RoomScreen />);
  expect(screen.queryAllByRole("button")).toHaveLength(0);
});
