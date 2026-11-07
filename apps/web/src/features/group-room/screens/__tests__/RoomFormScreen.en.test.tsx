import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import i18n from "@/lib/i18n";

import { renderScreen } from "../../__tests__/renderScreen";
import { GROUP_ROOM_LIMITS } from "../../model/limits";
import type { CategoryOption, RoomFormValues } from "../../types";
import { RoomFormScreen } from "../RoomFormScreen";

const HANGUL = /[가-힣]/;

// 시험·목표 칩 이름은 호출부가 넘기는 값이라 영어 화면에서는 영어 이름을 넘긴다.
const CATEGORIES: CategoryOption[] = [
  { value: "college", label: "College entrance" },
  { value: "civil", label: "Civil service" },
];

/** 화면 글자와 aria-label을 함께 모은다. 스크린리더가 읽는 이름도 영어여야 한다. */
function visibleText(container: HTMLElement): string {
  const labels = [...container.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  return [container.textContent, ...labels].join("\n");
}

function renderForm(mode: "create" | "edit", initial: RoomFormValues, newRequestCount = 0) {
  return renderScreen(
    <RoomFormScreen
      mode={mode}
      categories={CATEGORIES}
      initial={initial}
      newRequestCount={newRequestCount}
      pending={false}
      onBack={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );
}

afterEach(async () => {
  await i18n.changeLanguage("ko");
});

it.each([
  [1, "Changing the entry method will remove 1 pending request"],
  [3, "Changing the entry method will remove 3 pending requests"],
])("shows the English pending request warning for %i requests", async (count, message) => {
  await i18n.changeLanguage("en");
  const { container } = renderForm(
    "edit",
    {
      name: "Night owls",
      joinPolicy: "approval",
      visibility: "public",
      category: "civil",
      intro: "",
    },
    count,
  );

  await userEvent.setup().click(screen.getByRole("radio", { name: "Join instantly" }));
  expect(screen.getByRole("status")).toHaveTextContent(message);
  expect(visibleText(container)).not.toMatch(HANGUL);
});

describe("그룹 만들기 영어 화면", () => {
  it("영어로 바꾸면 그룹 만들기와 글자 수 오류에 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    const { container } = renderForm("create", {
      name: "a".repeat(GROUP_ROOM_LIMITS.roomNameMax + 1),
      joinPolicy: "approval",
      visibility: "public",
      category: "college",
      intro: "",
    });

    expect(screen.getByRole("heading", { level: 1, name: "Create group" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      `Use up to ${GROUP_ROOM_LIMITS.roomNameMax} characters`,
    );
    expect(visibleText(container)).not.toMatch(HANGUL);
  });

  it("영어로 바꾸면 그룹 설정의 바꿀 수 없는 공개 여부 안내에도 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    const { container } = renderForm("edit", {
      name: "Night owls",
      joinPolicy: "approval",
      visibility: "private",
      category: "civil",
      intro: "",
    });

    expect(screen.getByRole("heading", { level: 1, name: "Group settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(visibleText(container)).not.toMatch(HANGUL);
  });
});
