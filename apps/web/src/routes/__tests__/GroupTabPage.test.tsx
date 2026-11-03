import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { ApiError } from "@/lib/api";
import type * as UserId from "@/lib/userId";
import {
  mockGroupApi,
  renderGroupRoute,
  stubIntersectionObserver,
  stubPendingIdentity,
} from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));

// 신청 중 시트와 그룹 홈은 나눠 받는 모듈이라 전체 스위트 부하에서 첫 받기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/features/group-room/components/PendingApplicationsSheet");
  await import("@/routes/GroupHomePage");
});

const searchParam = (search: string, name: string) => new URLSearchParams(search).get(name);

describe("그룹 탭", () => {
  it("표시가 없으면 지금 소셜 홈을 그린다", async () => {
    renderGroupRoute("/social");
    expect(await screen.findByRole("heading", { name: "소셜" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "방 만들기" })).toBeInTheDocument();
  });

  it("내 그룹 카드와 탭 숫자, 신청 중 띠를 서버 값으로 그린다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/social?groupRooms=1");
    expect(await screen.findByRole("tab", { name: /내 그룹 3\/5/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("button", { name: /새벽 5시 기상 공시반/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /신청 중인 공개 그룹 1/ })).toBeInTheDocument();
  });

  it("신원이 정해지기 전에는 아무것도 그리지 않고 그룹을 받지 않는다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    renderGroupRoute("/social?groupRooms=1");
    await act(() => Promise.resolve());
    expect(screen.queryByRole("heading", { name: "그룹" })).toBeNull();
    expect(api.getMyGroups).not.toHaveBeenCalled();
    expect(api.getPublicGroups).not.toHaveBeenCalled();
  });

  it("내 그룹을 처음 받지 못하면 다시 시도를 두고 누르면 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.getMyGroups.mockRejectedValueOnce(new ApiError("x", 400, "BAD_REQUEST"));
    renderGroupRoute("/social?groupRooms=1");
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("button", { name: /새벽 5시 기상 공시반/ })).toBeInTheDocument();
    expect(api.getMyGroups).toHaveBeenCalledTimes(2);
  });

  it("공개 그룹 탭은 URL의 tab과 category를 따른다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/social?groupRooms=1&tab=public&category=CSAT");
    expect(await screen.findByRole("button", { name: "수능" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(api.getPublicGroups).toHaveBeenCalledWith(
      expect.objectContaining({ category: "CSAT", page: 0, size: 20 }),
      expect.anything(),
    );
  });

  it("탭과 칩을 바꾸면 주소를 바꿔 뒤로 와도 보던 조건이 남는다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("tab", { name: "공개 그룹" }));
    await user.click(await screen.findByRole("button", { name: "어학" }));
    await waitFor(() => expect(searchParam(router.location().search, "category")).toBe("LANGUAGE"));
    expect(searchParam(router.location().search, "tab")).toBe("public");
    expect(searchParam(router.location().search, "groupRooms")).toBe("1");
    expect(await screen.findByRole("button", { name: /토익 900 주말반/ })).toBeInTheDocument();
  });

  it("검색어는 입력을 멈춘 뒤 한 번만 조건으로 보내고 주소에 남긴다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social?groupRooms=1&tab=public");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("searchbox", { name: "그룹 이름으로 찾기" }), "토익");
    expect(screen.getByRole("searchbox")).toHaveValue("토익");
    await waitFor(() =>
      expect(api.getPublicGroups).toHaveBeenCalledWith(
        expect.objectContaining({ query: "토익", page: 0 }),
        expect.anything(),
      ),
    );
    expect(api.getPublicGroups).not.toHaveBeenCalledWith(
      expect.objectContaining({ query: "토" }),
      expect.anything(),
    );
    expect(searchParam(router.location().search, "q")).toBe("토익");
    expect(await screen.findByRole("button", { name: /토익 900 주말반/ })).toBeInTheDocument();
  });

  it("공개 그룹을 누르면 멤버인 그룹은 그룹 홈, 아니면 공개 그룹 보기로 간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social?groupRooms=1&tab=public");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /새벽 5시 기상 공시반/ }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10"));
  });

  it("멤버가 아닌 공개 그룹은 탭 조건을 뺀 주소로 공개 그룹 보기를 연다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social?groupRooms=1&tab=public&category=LANGUAGE");
    await userEvent.setup().click(await screen.findByRole("button", { name: /토익 900 주말반/ }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/public/13"));
    expect(router.location().search).toBe("?groupRooms=1");
  });

  it("신청을 취소하면 토스트를 띄우고 내 그룹을 다시 받는다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/social?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /신청 중인 공개 그룹 1/ }));
    await user.click(await screen.findByRole("button", { name: "신청 취소" }));
    expect(api.cancelApplication).toHaveBeenCalledOnce();
    expect(await screen.findByText("신청을 취소했어요")).toBeInTheDocument();
    await waitFor(() => expect(api.getMyGroups).toHaveBeenCalledTimes(2));
  });

  it("신청 중 시트는 신청 목록이 올 때까지 줄 자리표시를 두고 닫히지 않는다", async () => {
    const api = mockGroupApi("default");
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    api.getMyApplications.mockImplementationOnce(async (signal) => {
      await gate;
      return api.server.getMyApplications(signal);
    });
    renderGroupRoute("/social?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /신청 중인 공개 그룹 1/ }));
    const sheet = await screen.findByRole("dialog", { name: "신청 중인 공개 그룹" });
    expect(within(sheet).getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    act(() => release());
    expect(await within(sheet).findByRole("button", { name: "신청 취소" })).toBeInTheDocument();
  });

  it("그룹장인 그룹이 2개면 그룹 만들기가 흐려진다", async () => {
    mockGroupApi("limits");
    renderGroupRoute("/social?groupRooms=1");
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "그룹 만들기와 초대코드로 참여" }));
    expect(screen.getByRole("menuitem", { name: /그룹 만들기/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("초대코드로 참여는 탭 조건을 뺀 주소로 참여 화면을 연다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social?groupRooms=1&tab=public&category=CSAT");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "그룹 만들기와 초대코드로 참여" }));
    await user.click(screen.getByRole("menuitem", { name: "초대코드로 참여" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/join"));
    expect(router.location().search).toBe("?groupRooms=1");
  });

  it("다음 쪽이 있으면 목록 끝에 닿을 때 다음 쪽을 받는다", async () => {
    const api = mockGroupApi("default");
    const observer = stubIntersectionObserver();
    renderGroupRoute("/social?groupRooms=1&tab=public");
    await screen.findByTestId("public-rooms-more");
    act(() => observer.reach());
    await waitFor(() =>
      expect(api.getPublicGroups).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1 }),
        expect.anything(),
      ),
    );
    expect(await screen.findByRole("button", { name: /한국사 1급 같이 따요/ })).toBeInTheDocument();
    expect(screen.queryByTestId("public-rooms-more")).toBeNull();
  });

  it("다음 쪽을 받지 못하면 토스트로 알리고 다시 닿으면 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.getPublicGroups.mockImplementation(async (params, signal) => {
      if (params.page === 1 && api.getPublicGroups.mock.calls.length <= 2) {
        throw new ApiError("x", 400, "REQUEST_FAILED");
      }
      return api.server.getPublicGroups(params, signal);
    });
    const observer = stubIntersectionObserver();
    renderGroupRoute("/social?groupRooms=1&tab=public");
    await screen.findByTestId("public-rooms-more");
    act(() => observer.reach());
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    act(() => observer.reach());
    expect(await screen.findByRole("button", { name: /한국사 1급 같이 따요/ })).toBeInTheDocument();
  });

  it("공부방에서 넘어온 실패 안내를 토스트로 띄운다", async () => {
    mockGroupApi("default");
    markSocialRoomNotice({ kind: "failure", message: "새벽 5시 기상 공시반에서 내보내졌어요" });
    renderGroupRoute("/social?groupRooms=1");
    expect(await screen.findByText("새벽 5시 기상 공시반에서 내보내졌어요")).toBeInTheDocument();
  });

  it("자리를 오래 비워 끝난 안내는 확인 창으로 띄운다", async () => {
    mockGroupApi("default");
    markSocialRoomNotice({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되었으니 안심하세요.",
    });
    renderGroupRoute("/social?groupRooms=1");
    const dialog = await screen.findByRole("dialog", {
      name: "자리를 오래 비워서 공부를 종료했어요.",
    });
    await userEvent.setup().click(within(dialog).getByRole("button", { name: "확인" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
