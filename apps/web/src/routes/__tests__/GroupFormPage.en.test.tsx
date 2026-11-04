import { screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import i18n from "@/lib/i18n";
import type * as UserId from "@/lib/userId";
import { mockGroupApi, renderGroupRoute } from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/profileApi");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));

const HANGUL = /[가-힣]/;

/** 화면 글자와 aria-label을 함께 모은다. 스크린리더가 읽는 이름도 영어여야 한다. */
function visibleText(): string {
  const labels = [...document.body.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  return [document.body.textContent, ...labels].join("\n");
}

// 그룹 설정은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/GroupFormPage");
});

afterEach(async () => {
  await i18n.changeLanguage("ko");
});

describe("그룹 설정 영어 화면", () => {
  it("처음 받지 못한 그룹 설정을 영어로 보면 한글이 남지 않는다", async () => {
    await i18n.changeLanguage("en");
    const api = mockGroupApi("default");
    api.getGroupHome.mockRejectedValueOnce(new ApiError("x", 400, "BAD_REQUEST"));
    renderGroupRoute("/social/groups/10/settings?groupRooms=1");

    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Group settings" })).toBeInTheDocument();
    expect(screen.getByText("Please try again in a moment")).toBeInTheDocument();
    expect(visibleText()).not.toMatch(HANGUL);
  });
});
