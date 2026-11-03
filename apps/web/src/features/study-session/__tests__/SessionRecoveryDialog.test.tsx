import type { SessionRecoveryResponse } from "@focusmakers/types";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "@/lib/i18n";

import { SessionRecoveryDialog } from "../components/SessionRecoveryDialog";

/** 2026-08-27(목) 21:03~22:48 KST */
const recovered = {
  statDate: "2026-08-27",
  startedAt: "2026-08-27T12:03:00Z",
  endedAt: "2026-08-27T13:48:00Z",
  studySec: 6120,
  focusSec: 5040,
} as SessionRecoveryResponse;

/** en 시각의 PM 앞 공백은 U+202F라 일반 공백으로 바꿔 비교한다. */
const dialogText = () => (screen.getByRole("dialog").textContent ?? "").replace(/\u202f/g, " ");

afterEach(async () => {
  await i18n.changeLanguage("ko");
});

describe("SessionRecoveryDialog 날짜·시각", () => {
  it("한국어는 `8월 27일 (목)`과 `~` 구분자다", () => {
    render(<SessionRecoveryDialog recovered={recovered} onConfirm={() => {}} />);
    expect(dialogText()).toContain("8월 27일 (목)");
    expect(dialogText()).toContain("21:03 ~ 22:48");
  });

  it("영어는 `Thu, Aug 27`과 en dash 구분자다", async () => {
    await i18n.changeLanguage("en");
    render(<SessionRecoveryDialog recovered={recovered} onConfirm={() => {}} />);
    expect(dialogText()).toContain("Thu, Aug 27");
    expect(dialogText()).toContain("9:03 PM – 10:48 PM");
  });
});
