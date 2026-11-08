import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";
import { OnboardingFlow } from "../OnboardingFlow";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await i18n.changeLanguage("ko");
});

function mount() {
  render(
    <OnboardingFlow onStepView={() => {}} onAskNotification={async () => {}} onFinish={() => {}} />,
  );
}

it("할 일 확대는 플래너에서 나타나고 다음 장면 전환이 끝나면 사라지며 재진입할 수 있다", () => {
  mount();
  expect(screen.queryByText("오늘 할 일")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("오늘 할 일")).toBeInTheDocument();
  expect(screen.getByText("일간")).toBeInTheDocument();
  expect(screen.getByText("주간")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("플래너에 자동으로 기록돼요");
  expect(screen.getAllByRole("button")).toHaveLength(2);

  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByText("오늘 할 일")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(660));
  expect(screen.queryByText("오늘 할 일")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  expect(screen.getByText("오늘 할 일")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "이전" }));
  act(() => vi.advanceTimersByTime(660));
  expect(screen.queryByText("오늘 할 일")).not.toBeInTheDocument();
});

it.each([
  ["ko", "다음", "오늘 할 일"],
  ["en", "Next", "Today's tasks"],
  ["ja", "次へ", "今日のタスク"],
  ["zh-Hant", "下一步", "今日待辦"],
])(
  "%s에서도 새 플래너 소개를 읽고 같은 다음 단계로 이동할 수 있다",
  async (locale, next, tasks) => {
    await i18n.changeLanguage(locale);
    mount();
    fireEvent.click(screen.getByRole("button", { name: next }));
    expect(screen.getByText(tasks)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: next }));
    act(() => vi.advanceTimersByTime(660));
    expect(screen.queryByText(tasks)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: next })).toBeInTheDocument();
  },
);

it("3단계 폰 목업은 그룹 공부방 화면으로 소개된다", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
  expect(screen.getByLabelText("참여자 6명이 함께 공부하는 그룹 공부방 화면")).toBeInTheDocument();
});
