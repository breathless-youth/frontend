import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { shareInvite } from "@/features/social-room/shareInvite";
import type * as ShareInvite from "@/features/social-room/shareInvite";
import { ApiError } from "@/lib/api";
import type * as UserId from "@/lib/userId";
import {
  makeMeOwnerOf,
  mockGroupApi,
  renderGroupRoute,
  stubHistoryIndex,
  stubPendingIdentity,
} from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));
vi.mock("@/features/social-room/shareInvite", async (importOriginal) => ({
  ...(await importOriginal<typeof ShareInvite>()),
  shareInvite: vi.fn(async () => "shared" as const),
}));

// 멤버 화면과 그룹 홈은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/GroupMembersPage");
  await import("@/routes/GroupHomePage");
});

const firstRowMenu = async () => (await screen.findAllByRole("button", { name: / 메뉴$/ }))[0]!;

describe("멤버 관리와 멤버 보기", () => {
  it("그룹장은 멤버 관리, 멤버는 멤버 보기다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/social/groups/10/members?groupRooms=1");
    expect(await screen.findByRole("heading", { name: "멤버 관리" })).toBeInTheDocument();
    cleanup();
    mockGroupApi("default");
    renderGroupRoute("/social/groups/11/members?groupRooms=1");
    expect(await screen.findByRole("heading", { name: "멤버 보기" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "초대하기" })).toBeNull();
  });

  it("그룹을 받기 전에는 뒤로 가기 줄과 자리표시를 둔다", async () => {
    const api = mockGroupApi("default");
    api.getGroupHome.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/10/members?groupRooms=1");
    expect(await screen.findByRole("button", { name: "뒤로 가기" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
  });

  it("비공개 그룹에서 내보내면 확인 창을 거쳐 새 코드를 받고 토스트를 띄운다", async () => {
    const api = mockGroupApi("default");
    makeMeOwnerOf(api, 11);
    renderGroupRoute("/social/groups/11/members?groupRooms=1");
    expect(await screen.findByText(/K7Q2MX/)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "민준 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: /내보내기/ }));
    expect(screen.getByRole("alertdialog", { name: "민준님을 내보낼까요?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "내보내기" }));
    expect(api.kickGroupMember).toHaveBeenCalledWith(11, expect.any(Number));
    expect(await screen.findByText("초대코드가 새로 바뀌었어요")).toBeInTheDocument();
    const { inviteCode } = await api.server.getGroupInvite(11);
    expect(inviteCode).not.toBe("K7Q2MX");
    expect(await screen.findByText(inviteCode)).toBeInTheDocument();
    expect(screen.queryByText(/K7Q2MX/)).toBeNull();
    expect(api.getGroupInvite).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "민준 메뉴" })).toBeNull();
  });

  it("초대코드를 받지 못하면 카드 자리에 다시 시도를 두고 누르면 코드를 보인다", async () => {
    const api = mockGroupApi("default");
    makeMeOwnerOf(api, 11);
    api.getGroupInvite.mockRejectedValueOnce(new ApiError("x", 400, "BAD_REQUEST"));
    renderGroupRoute("/social/groups/11/members?groupRooms=1");
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "초대하기" })).toBeNull();
    expect(await screen.findByRole("button", { name: "민준 메뉴" })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText(/K7Q2MX/)).toBeInTheDocument();
  });

  it("공개 그룹에서 내보내면 토스트가 없다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/social/groups/10/members?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await firstRowMenu());
    await user.click(screen.getByRole("menuitem", { name: /내보내기/ }));
    await user.click(screen.getByRole("button", { name: "내보내기" }));
    await waitFor(() => expect(api.getGroupMembers).toHaveBeenCalledTimes(2));
    await act(() => Promise.resolve());
    expect(screen.queryByText("초대코드가 새로 바뀌었어요")).toBeNull();
  });

  it("확인 창의 내보내기를 두 번 눌러도 한 번만 보낸다", async () => {
    const api = mockGroupApi("default");
    api.kickGroupMember.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/10/members?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await firstRowMenu());
    await user.click(screen.getByRole("menuitem", { name: /내보내기/ }));
    await user.dblClick(screen.getByRole("button", { name: "내보내기" }));
    expect(api.kickGroupMember).toHaveBeenCalledOnce();
  });

  it("내보내기와 그룹장 넘기기 확인 창은 닉네임이 든 문구를 클릭 분석에서 가린다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/social/groups/10/members?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await firstRowMenu());
    await user.click(screen.getByRole("menuitem", { name: /내보내기/ }));
    const kickDialog = screen.getByRole("alertdialog", { name: /님을 내보낼까요\?$/ });
    expect(kickDialog).toHaveAttribute("data-amp-mask");
    expect(kickDialog).toHaveAttribute("data-amp-mask-attributes", "aria-label");
    await user.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await user.click(await firstRowMenu());
    await user.click(screen.getByRole("menuitem", { name: "그룹장 넘기기" }));
    const transferDialog = screen.getByRole("alertdialog", { name: /그룹장을 넘길까요\?$/ });
    expect(transferDialog).toHaveAttribute("data-amp-mask");
    expect(transferDialog).toHaveAttribute("data-amp-mask-attributes", "aria-label");
  });

  it("그룹장을 넘기면 멤버 보기로 바뀐다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/social/groups/10/members?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await firstRowMenu());
    await user.click(screen.getByRole("menuitem", { name: "그룹장 넘기기" }));
    expect(
      screen.getByRole("alertdialog", { name: "새벽공부러님에게 그룹장을 넘길까요?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "넘기기" }));
    expect(await screen.findByRole("heading", { name: "멤버 보기" })).toBeInTheDocument();
  });

  it("내보내려던 멤버가 이미 나갔으면 알림 없이 멤버를 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.kickGroupMember.mockRejectedValueOnce(new ApiError("x", 404, "GROUP_MEMBER_NOT_FOUND"));
    renderGroupRoute("/social/groups/10/members?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await firstRowMenu());
    await user.click(screen.getByRole("menuitem", { name: /내보내기/ }));
    await user.click(screen.getByRole("button", { name: "내보내기" }));
    await waitFor(() => expect(api.getGroupMembers).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.queryByText("잠시 후 다시 시도해 주세요")).toBeNull();
  });

  it("그사이 그룹장이 바뀌어 막히면 그룹 홈으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.transferGroupOwner.mockRejectedValueOnce(new ApiError("x", 403, "NOT_GROUP_OWNER"));
    const { router } = renderGroupRoute("/social/groups/10/members?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await firstRowMenu());
    await user.click(screen.getByRole("menuitem", { name: "그룹장 넘기기" }));
    await user.click(screen.getByRole("button", { name: "넘기기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10"));
  });

  it("그룹 홈에서 왔으면 그룹장이 바뀌어 막힐 때 그 그룹 홈으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await screen.findByRole("heading", { name: "새벽 5시 기상 공시반" });
    const homeKey = router.location().key;
    stubHistoryIndex(1);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "그룹 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "멤버 관리" }));
    api.transferGroupOwner.mockRejectedValueOnce(new ApiError("x", 403, "NOT_GROUP_OWNER"));
    await user.click(await firstRowMenu());
    await user.click(screen.getByRole("menuitem", { name: "그룹장 넘기기" }));
    await user.click(screen.getByRole("button", { name: "넘기기" }));
    await waitFor(() => expect(router.location().key).toBe(homeKey));
  });

  it("코드 새로 만들기는 확인 없이 새 코드를 보인다", async () => {
    const api = mockGroupApi("default");
    makeMeOwnerOf(api, 11);
    renderGroupRoute("/social/groups/11/members?groupRooms=1");
    expect(await screen.findByText(/K7Q2MX/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "코드 새로 만들기" }));
    expect(api.regenerateGroupInvite).toHaveBeenCalledWith(11);
    const { inviteCode } = await api.server.getGroupInvite(11);
    expect(await screen.findByText(inviteCode)).toBeInTheDocument();
    expect(screen.queryByText(/K7Q2MX/)).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("코드 새로 만들기를 연달아 눌러도 한 번만 보낸다", async () => {
    const api = mockGroupApi("default");
    makeMeOwnerOf(api, 11);
    api.regenerateGroupInvite.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/11/members?groupRooms=1");
    await screen.findByText(/K7Q2MX/);
    await userEvent.setup().dblClick(screen.getByRole("button", { name: "코드 새로 만들기" }));
    expect(api.regenerateGroupInvite).toHaveBeenCalledOnce();
  });

  it("링크 보내기는 그룹의 초대코드로 공유한다", async () => {
    const api = mockGroupApi("default");
    makeMeOwnerOf(api, 11);
    renderGroupRoute("/social/groups/11/members?groupRooms=1");
    await screen.findByText(/K7Q2MX/);
    await userEvent.setup().click(screen.getByRole("button", { name: "링크 보내기" }));
    await waitFor(() => expect(shareInvite).toHaveBeenCalledWith("K7Q2MX"));
  });

  it("멤버가 아니거나 사라진 그룹이면 그룹 탭으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.getGroupMembers.mockRejectedValue(new ApiError("x", 403, "NOT_GROUP_MEMBER"));
    const { router } = renderGroupRoute("/social/groups/10/members?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(await screen.findByText("이 그룹의 멤버가 아니에요")).toBeInTheDocument();
  });

  it("신원이 정해지기 전에는 그룹을 받지 않는다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    const { router } = renderGroupRoute("/social/groups/10/members?groupRooms=1");
    await act(() => Promise.resolve());
    expect(router.location().pathname).toBe("/social/groups/10/members");
    expect(api.getGroupHome).not.toHaveBeenCalled();
    expect(api.getGroupMembers).not.toHaveBeenCalled();
  });
});
