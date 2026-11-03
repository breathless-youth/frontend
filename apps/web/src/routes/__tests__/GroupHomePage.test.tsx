import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { markSocialRoomNotice } from "@/features/social-room/socialRoomNotice";
import { shareInvite } from "@/features/social-room/shareInvite";
import type * as ShareInvite from "@/features/social-room/shareInvite";
import { closeStaleSession } from "@/features/study-session/closeStaleSession";
import { ApiError } from "@/lib/api";
import { groupKeys } from "@/lib/groupRoomQueries";
import { queryClient } from "@/lib/queryClient";
import type * as UserId from "@/lib/userId";
import { mockGroupApi, renderGroupRoute, stubPendingIdentity } from "@/test/groupRouteHarness";

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
vi.mock("@/features/study-session/closeStaleSession");
// 이 파일은 공부방으로 넘어가는 이동까지만 본다. 진짜 공부방은 카메라와 STOMP를 열어서 자리표시로 바꾼다.
vi.mock("@/routes/GroupRoomPage", () => ({
  GroupRoomPage: () => <div data-testid="group-room-stub" />,
}));

// 그룹 홈은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/GroupHomePage");
});

afterEach(() => {
  vi.useRealTimers();
});

/** 책상이 읽어 주는 이름에 붙은 오늘 순공을 초로 바꾼다. */
function clockSeconds(desk: HTMLElement): number {
  const match = /(\d+):(\d{2}):(\d{2})/.exec(desk.getAttribute("aria-label") ?? "");
  if (match === null) {
    throw new Error("책상에 순공 시각이 없다");
  }
  const [, hours, minutes, seconds] = match.map(Number);
  return hours! * 3600 + minutes! * 60 + seconds!;
}

async function openMenuItem(name: RegExp | string) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "그룹 메뉴" }));
  await user.click(screen.getByRole("menuitem", { name }));
  return user;
}

describe("그룹 홈", () => {
  it("그룹 홈을 서버 값으로 그리고 보이는 동안 30초마다 다시 받는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = mockGroupApi("default");
    renderGroupRoute("/social/groups/10?groupRooms=1");
    expect(
      await screen.findByRole("heading", { name: "새벽 5시 기상 공시반" }),
    ).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(api.getGroupHome).toHaveBeenCalledTimes(2);
  });

  it("받는 동안에는 뒤로 가기 줄과 자리표시를 둔다", async () => {
    const api = mockGroupApi("default");
    api.getGroupHome.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/10?groupRooms=1");
    expect(await screen.findByRole("button", { name: "뒤로 가기" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
  });

  it("처음 받지 못하면 다시 시도를 두고 누르면 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.getGroupHome.mockRejectedValueOnce(new ApiError("x", 400, "BAD_REQUEST"));
    renderGroupRoute("/social/groups/10?groupRooms=1");
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "다시 시도" }));
    expect(
      await screen.findByRole("heading", { name: "새벽 5시 기상 공시반" }),
    ).toBeInTheDocument();
  });

  it("종을 누르면 바로 켜짐으로 보이고 실패하면 되돌린다", async () => {
    const api = mockGroupApi("default");
    let fail!: (error: unknown) => void;
    api.setGroupNotification.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    renderGroupRoute("/social/groups/10?groupRooms=1");
    const bell = await screen.findByRole("button", { name: "멤버 공부 알림" });
    await userEvent.setup().click(bell);
    expect(bell).toHaveAttribute("aria-pressed", "true");
    expect(api.setGroupNotification).toHaveBeenCalledWith(10, true);
    await act(async () => fail(new ApiError("x", 500)));
    await waitFor(() => expect(bell).toHaveAttribute("aria-pressed", "false"));
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
  });

  it("종을 눌러도 공부 중인 멤버의 흐르는 시간이 뒤로 가지 않는다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const api = mockGroupApi("default");
    api.setGroupNotification.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/10?groupRooms=1");
    const desk = await screen.findByRole("listitem", { name: /^새벽공부러,/ });
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    const before = clockSeconds(desk);
    expect(before).toBeGreaterThan(6_330 + 10);
    const bell = screen.getByRole("button", { name: "멤버 공부 알림" });
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(bell);
    await waitFor(() => expect(bell).toHaveAttribute("aria-pressed", "true"));
    expect(clockSeconds(desk)).toBeGreaterThanOrEqual(before);
  });

  it("종이 켜지면 서버 값으로도 켜짐이 남는다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/social/groups/10?groupRooms=1");
    const bell = await screen.findByRole("button", { name: "멤버 공부 알림" });
    await userEvent.setup().click(bell);
    await waitFor(() => expect(api.getGroupHome).toHaveBeenCalledTimes(2));
    expect(bell).toHaveAttribute("aria-pressed", "true");
  });

  it("멤버의 그룹 나가기는 확인 창을 거쳐 그룹 탭으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/11?groupRooms=1");
    const user = await openMenuItem(/그룹 나가기/);
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "그룹에 다시 들어오려면 다시 초대받아야 해요",
    );
    await user.click(screen.getByRole("button", { name: "나가기" }));
    expect(api.leaveGroup).toHaveBeenCalledWith(11);
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
  });

  it("스스로 나간 뒤에는 그 그룹을 다시 받지 않아 멤버가 아니라는 안내가 뜨지 않는다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/11?groupRooms=1");
    const user = await openMenuItem(/그룹 나가기/);
    await user.click(screen.getByRole("button", { name: "나가기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(await screen.findByRole("tab", { name: /내 그룹 2\/5/ })).toBeInTheDocument();
    expect(api.getGroupHome).toHaveBeenCalledOnce();
    expect(screen.queryByText("이 그룹의 멤버가 아니에요")).toBeNull();
    expect(queryClient.getQueryData(groupKeys.home(1, 11))).toBeUndefined();
  });

  it("확인 창의 나가기를 두 번 눌러도 한 번만 보낸다", async () => {
    const api = mockGroupApi("default");
    api.leaveGroup.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/11?groupRooms=1");
    const user = await openMenuItem(/그룹 나가기/);
    await user.dblClick(screen.getByRole("button", { name: "나가기" }));
    expect(api.leaveGroup).toHaveBeenCalledOnce();
  });

  it("다른 멤버가 있는 그룹장이 나가려 하면 멤버 관리로 보내는 창이다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    const user = await openMenuItem(/그룹 나가기/);
    await user.click(screen.getByRole("button", { name: "멤버 관리" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10/members"));
  });

  it("혼자인 줄 알고 나가려는데 서버가 그룹장은 나갈 수 없다고 하면 멤버 관리로 보내는 창으로 바꾼다", async () => {
    const api = mockGroupApi("default");
    const home = await api.server.getGroupHome(10);
    api.getGroupHome.mockResolvedValue({
      ...home,
      memberCount: 1,
      members: home.members.slice(0, 1),
    });
    api.leaveGroup.mockRejectedValueOnce(new ApiError("x", 409, "OWNER_CANNOT_LEAVE"));
    renderGroupRoute("/social/groups/10?groupRooms=1");
    const user = await openMenuItem(/그룹 나가기/);
    expect(screen.getByRole("alertdialog")).toHaveAccessibleDescription(
      "그룹에서 나가게 된다면 이 그룹이 사라져요",
    );
    await user.click(screen.getByRole("button", { name: "나가기" }));
    expect(
      await screen.findByRole("alertdialog", { name: "그룹장을 넘겨야 나갈 수 있어요" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "멤버 관리" })).toBeInTheDocument();
  });

  it("초대하기는 그룹의 초대코드로 공유한다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/social/groups/11?groupRooms=1");
    await openMenuItem("초대하기");
    await waitFor(() => expect(shareInvite).toHaveBeenCalledWith("K7Q2MX"));
  });

  it("공유 대신 복사했으면 복사했다고 알린다", async () => {
    mockGroupApi("default");
    vi.mocked(shareInvite).mockResolvedValueOnce("copied");
    renderGroupRoute("/social/groups/11?groupRooms=1");
    await openMenuItem("초대하기");
    expect(await screen.findByText("초대코드를 복사했어요")).toBeInTheDocument();
  });

  it("신청 확인은 그 그룹의 신청 확인 화면으로 간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await openMenuItem(/신청 확인/);
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10/applications"));
  });

  it("공부방 들어가기는 그 그룹의 공부방 주소로 간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "공부방 들어가기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10/room"));
    expect(router.location().search).toBe("?groupRooms=1");
  });

  it("공부방 들어가기는 남은 세션을 정리하고 자리를 잡은 뒤 공부방으로 간다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "공부방 들어가기" }));
    expect(closeStaleSession).toHaveBeenCalledWith(1);
    expect(api.joinGroupRoom).toHaveBeenCalledWith(10);
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10/room"));
    const seat = await vi.mocked(api.joinGroupRoom).mock.results[0]?.value;
    expect(router.location().state).toEqual({
      roomId: seat.roomId,
      graceRejoin: false,
      iceServers: [],
    });
  });

  it("자리를 잡는 동안에는 공부방 들어가기를 다시 누를 수 없다", async () => {
    const api = mockGroupApi("default");
    api.joinGroupRoom.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/10?groupRooms=1");
    const enter = await screen.findByRole("button", { name: "공부방 들어가기" });
    await userEvent.setup().click(enter);
    await waitFor(() => expect(enter).toBeDisabled());
    expect(api.joinGroupRoom).toHaveBeenCalledOnce();
  });

  it("자리를 잡지 못하면 그룹 홈에 남아 다시 시도하라고 알린다", async () => {
    const api = mockGroupApi("default");
    api.joinGroupRoom.mockRejectedValueOnce(new ApiError("x", 500));
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "공부방 들어가기" }));
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(router.location().pathname).toBe("/social/groups/10");
  });

  it("자리를 잡을 때 멤버가 아니라고 하면 그룹 탭으로 돌아가 안내한다", async () => {
    const api = mockGroupApi("default");
    api.joinGroupRoom.mockRejectedValueOnce(new ApiError("x", 403, "NOT_GROUP_MEMBER"));
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "공부방 들어가기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(await screen.findByText("이 그룹의 멤버가 아니에요")).toBeInTheDocument();
  });

  it("공부방에서 자리를 오래 비워 끝났다는 안내를 그룹 홈에서 띄운다", async () => {
    mockGroupApi("default");
    markSocialRoomNotice({
      kind: "grace-end",
      message: "자리를 오래 비워서 공부를 종료했어요.\n공부 기록은 저장되었으니 안심하세요.",
    });
    renderGroupRoute("/social/groups/10?groupRooms=1");
    const dialog = await screen.findByRole("dialog", {
      name: "자리를 오래 비워서 공부를 종료했어요.",
    });
    expect(dialog).toHaveTextContent("공부 기록은 저장되었으니 안심하세요.");
  });

  it("앞 화면이 없으면 뒤로 가기는 그룹 탭으로 간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await screen.findByRole("heading", { name: "새벽 5시 기상 공시반" });
    await userEvent.setup().click(screen.getByRole("button", { name: "뒤로 가기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
  });

  it.each([
    [403, "NOT_GROUP_MEMBER", "이 그룹의 멤버가 아니에요"],
    [404, "GROUP_NOT_FOUND", "그룹을 찾을 수 없어요"],
  ] as const)("%s %s면 그룹 탭으로 돌아가 안내한다", async (status, code, copy) => {
    const api = mockGroupApi("default");
    api.getGroupHome.mockRejectedValue(new ApiError("x", status, code));
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(await screen.findByText(copy)).toBeInTheDocument();
  });

  it("신원이 오기 전에는 그룹 탭으로 돌려보내지 않고 그룹도 받지 않는다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await act(() => Promise.resolve());
    expect(router.location().pathname).toBe("/social/groups/10");
    expect(api.getGroupHome).not.toHaveBeenCalled();
  });
});
