import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { nativeSocialLoginProviders } from "@/lib/nativeSocialLogin";
import type * as NativeSocialLogin from "@/lib/nativeSocialLogin";
import { getStudyDays } from "@/lib/statsApi";
import type * as StatsApi from "@/lib/statsApi";
import type * as UserId from "@/lib/userId";
import { mockGroupApi, mockProfile, renderGroupRoute } from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/profileApi");
vi.mock("@/lib/statsApi", async (importOriginal) => ({
  ...(await importOriginal<typeof StatsApi>()),
  getStudyDays: vi.fn(),
}));
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));
vi.mock("@/lib/nativeSocialLogin", async (importOriginal) => ({
  ...(await importOriginal<typeof NativeSocialLogin>()),
  nativeSocialLoginProviders: vi.fn(() => ["GOOGLE", "KAKAO", "APPLE"]),
}));

// 그룹 홈과 차단 목록은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/GroupHomePage");
  await import("@/routes/BlockListPage");
});

afterEach(() => {
  vi.mocked(nativeSocialLoginProviders).mockReturnValue(["GOOGLE", "KAKAO", "APPLE"]);
});

const LOGIN_BUTTON = "Google로 계속하기";

/** 로그인하지 않은 비회원 */
function asGuest() {
  mockGroupApi("default");
  mockProfile({ loginProvider: null } as never);
  vi.mocked(getStudyDays).mockResolvedValue({ totalDays: 0 });
}

describe("그룹 로그인 게이트 배치", () => {
  it.each([
    "/social?groupRooms=1",
    "/social/groups/11?groupRooms=1",
    "/social/groups/new?groupRooms=1",
    "/social/groups/11/settings?groupRooms=1",
    "/social/groups/11/members?groupRooms=1",
    "/social/groups/11/room?groupRooms=1",
    "/social/groups/11/room/result?groupRooms=1",
    "/social/groups/11/applications?groupRooms=1",
    "/social/groups/11/applications/5/report?groupRooms=1",
    "/social/public/21?groupRooms=1",
    "/social/public/21/apply?groupRooms=1",
    "/social/join?groupRooms=1&code=K7Q2MX",
  ])("비회원이 %s를 열면 로그인 화면이다", async (path) => {
    asGuest();
    renderGroupRoute(path);
    expect(await screen.findByRole("button", { name: LOGIN_BUTTON })).toBeInTheDocument();
  });

  it("회원은 그룹 하위 화면을 그대로 연다", async () => {
    mockGroupApi("default");
    mockProfile({ loginProvider: "KAKAO" } as never);
    renderGroupRoute("/social/groups/11?groupRooms=1");
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: LOGIN_BUTTON })).not.toBeInTheDocument();
  });

  it("앱이 로그인 공급자를 알리지 않으면 비회원도 그룹 탭을 쓴다", async () => {
    vi.mocked(nativeSocialLoginProviders).mockReturnValue([]);
    asGuest();
    renderGroupRoute("/social?groupRooms=1");
    expect(await screen.findByRole("heading", { name: "그룹" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: LOGIN_BUTTON })).not.toBeInTheDocument();
  });

  it("그룹 표시가 없는 예전 소셜 홈은 막지 않는다", async () => {
    asGuest();
    renderGroupRoute("/social");
    expect(await screen.findByText("친구와 함께 공부해요")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: LOGIN_BUTTON })).not.toBeInTheDocument();
  });

  it("숫자 4자리 초대 링크는 막지 않고 코드를 뺀 그룹 탭으로 보낸다", async () => {
    asGuest();
    const { router } = renderGroupRoute("/social/join?groupRooms=1&code=1234");
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(router.location().search).toBe("?groupRooms=1");
  });

  it("차단 목록은 막지 않는다", async () => {
    asGuest();
    renderGroupRoute("/blocks?groupRooms=1");
    expect(await screen.findAllByRole("button", { name: "차단 해제" })).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: LOGIN_BUTTON })).not.toBeInTheDocument();
  });
});
