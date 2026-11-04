import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Calendar } from "../calendar";

let mockLanguage = "ko";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: mockLanguage } }),
}));

function firstWeekday(language: string): string | null {
  mockLanguage = language;
  render(<Calendar month={new Date(2026, 9, 1)} />);
  return screen.getAllByRole("columnheader", { hidden: true })[0].textContent;
}

describe("Calendar 언어", () => {
  it.each([
    ["ko", "월"],
    ["en", "Mo"],
    ["ja", "月"],
    ["zh-Hant", "一"],
    ["fr", "Mo"],
  ])("%s 화면은 요일 머리를 %s로 쓴다", (language, expected) => {
    expect(firstWeekday(language)).toBe(expected);
  });
});
