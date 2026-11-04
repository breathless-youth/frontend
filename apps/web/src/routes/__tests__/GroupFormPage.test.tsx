import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { setGroupRoomCount, trackGroupRoomCreated, trackGroupRoomJoined } from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import { getProfile } from "@/lib/profileApi";
import type * as UserId from "@/lib/userId";
import {
  mockGroupApi,
  mockProfile,
  renderGroupRoute,
  stubHistoryIndex,
  stubPendingIdentity,
} from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/profileApi");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  setGroupRoomCount: vi.fn(),
  trackGroupRoomCreated: vi.fn(),
  trackGroupRoomJoined: vi.fn(),
}));

// 그룹 만들기·설정과 그룹 홈은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/GroupFormPage");
  await import("@/routes/GroupHomePage");
});

afterEach(() => {
  vi.mocked(setGroupRoomCount).mockClear();
  vi.mocked(trackGroupRoomCreated).mockClear();
  vi.mocked(trackGroupRoomJoined).mockClear();
});

describe("그룹 만들기 계측", () => {
  it("그룹을 만들면 공개 여부와 시험·목표를 계측한다", async () => {
    mockGroupApi("default");
    mockProfile({ category: "CSAT" });
    const { router } = renderGroupRoute("/social/groups/new?groupRooms=1");
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "그룹 이름" }),
      "우리 반 저녁 스터디",
    );
    await user.click(screen.getByRole("radio", { name: /^비공개/ }));
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    await waitFor(() => expect(router.location().pathname).toMatch(/^\/social\/groups\/\d+$/));
    expect(trackGroupRoomCreated).toHaveBeenCalledExactlyOnceWith({
      visibility: "private",
      category: "CSAT",
    });
  });

  it("만들지 못하면 계측하지 않는다", async () => {
    const api = mockGroupApi("default");
    api.createGroup.mockRejectedValueOnce(new ApiError("x", 409, "GROUP_SLOT_LIMIT"));
    mockProfile({ category: null });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "그룹 이름" }), "새 그룹");
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(await screen.findByText("그룹 개수가 가득 찼어요")).toBeInTheDocument();
    expect(trackGroupRoomCreated).not.toHaveBeenCalled();
  });

  it("그룹 탭에서 만든 그룹은 탭이 내 그룹을 다시 받아도 신청 가입으로 세지 않는다", async () => {
    const api = mockGroupApi("default");
    mockProfile({ category: "CSAT" });
    const { router } = renderGroupRoute("/social?groupRooms=1");
    const user = userEvent.setup();
    // 처음 받은 내 그룹 2개를 기억한 뒤에 만든다.
    await waitFor(() => expect(setGroupRoomCount).toHaveBeenCalledWith(2));
    await user.click(screen.getByRole("button", { name: "그룹 만들기와 초대코드로 참여" }));
    await user.click(screen.getByRole("menuitem", { name: /그룹 만들기/ }));
    await user.type(await screen.findByRole("textbox", { name: "그룹 이름" }), "새 그룹");
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    await screen.findByRole("heading", { name: "새 그룹" });

    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));

    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(await screen.findByRole("button", { name: /새 그룹/ })).toBeInTheDocument();
    await waitFor(() => expect(api.getMyGroups).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(setGroupRoomCount).toHaveBeenLastCalledWith(3));
    expect(trackGroupRoomCreated).toHaveBeenCalledOnce();
    expect(trackGroupRoomJoined).not.toHaveBeenCalled();
  });
});

describe("그룹 만들기", () => {
  it("그룹 만들기는 프로필 카테고리로 시작하고 없거나 모르는 값이면 수능이다", async () => {
    mockGroupApi("default");
    mockProfile({ category: "JOB" });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    expect(await screen.findByRole("button", { name: "취업" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    cleanup();
    mockGroupApi("default");
    mockProfile({ category: null });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    expect(await screen.findByRole("button", { name: "수능" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    cleanup();
    mockGroupApi("default");
    mockProfile({ category: "MEDICAL_SCHOOL" });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    expect(await screen.findByRole("button", { name: "수능" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("만들면 서버 값으로 보내고 그 그룹 홈으로 간다", async () => {
    const api = mockGroupApi("default");
    mockProfile({ category: "CSAT" });
    const { router } = renderGroupRoute("/social/groups/new?groupRooms=1");
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "그룹 이름" }),
      "우리 반 저녁 스터디",
    );
    await user.click(screen.getByRole("radio", { name: /^비공개/ }));
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(api.createGroup).toHaveBeenCalledWith({
      name: "우리 반 저녁 스터디",
      visibility: "PRIVATE",
      category: "CSAT",
      description: "",
    });
    await waitFor(() => expect(router.location().pathname).toMatch(/^\/social\/groups\/\d+$/));
    expect(await screen.findByRole("heading", { name: "우리 반 저녁 스터디" })).toBeInTheDocument();
  });

  it("그룹장인 그룹이 이미 2개면 토스트로 알린다", async () => {
    mockGroupApi("limits");
    mockProfile({ category: null });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "그룹 이름" }), "세 번째 그룹");
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(await screen.findByText("그룹은 2개까지 만들 수 있어요")).toBeInTheDocument();
  });

  it("들어간 그룹과 신청이 이미 5개면 그룹과 신청을 합쳐 5개까지라고 알린다", async () => {
    const api = mockGroupApi("default");
    api.createGroup.mockRejectedValueOnce(new ApiError("x", 409, "GROUP_SLOT_LIMIT"));
    mockProfile({ category: null });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "그룹 이름" }), "새 그룹");
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(await screen.findByText("그룹과 신청을 합쳐 5개까지예요")).toBeInTheDocument();
  });

  it("서버가 연락처로 막으면 연락처가 있는 칸 아래에 알린다", async () => {
    const api = mockGroupApi("default");
    api.createGroup.mockRejectedValueOnce(new ApiError("x", 400, "CONTACT_NOT_ALLOWED"));
    mockProfile({ category: null });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "그룹 이름" }), "새 그룹");
    const intro = screen.getByRole("textbox", { name: "그룹 소개" });
    await user.type(intro, "문의는 카톡 abc123");
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    await waitFor(() => expect(api.createGroup).toHaveBeenCalledOnce());
    expect(intro).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("연락처나 링크는 보낼 수 없어요")).toHaveLength(1);
  });

  it("서버가 연락처로 막았는데 화면의 판정에 걸린 칸이 없으면 토스트로 알린다", async () => {
    const api = mockGroupApi("default");
    api.createGroup.mockRejectedValueOnce(new ApiError("x", 400, "CONTACT_NOT_ALLOWED"));
    mockProfile({ category: null });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    const user = userEvent.setup();
    const name = await screen.findByRole("textbox", { name: "그룹 이름" });
    await user.type(name, "새 그룹");
    await user.click(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(await screen.findByText("연락처나 링크는 보낼 수 없어요")).toBeInTheDocument();
    expect(name).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("textbox", { name: "그룹 소개" })).not.toHaveAttribute("aria-invalid");
  });

  it("그룹 만들기를 두 번 눌러도 한 번만 보낸다", async () => {
    const api = mockGroupApi("default");
    api.createGroup.mockImplementation(() => new Promise(() => {}));
    mockProfile({ category: null });
    renderGroupRoute("/social/groups/new?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "그룹 이름" }), "새 그룹");
    await user.dblClick(screen.getByRole("button", { name: "그룹 만들기" }));
    expect(api.createGroup).toHaveBeenCalledOnce();
  });

  it("프로필을 받는 동안에는 뒤로 가기 줄과 자리표시를 둔다", async () => {
    mockGroupApi("default");
    vi.mocked(getProfile).mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/new?groupRooms=1");
    expect(await screen.findByRole("button", { name: "뒤로 가기" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: "그룹 이름" })).toBeNull();
  });

  it("프로필을 받지 못해도 수능으로 시작한다", async () => {
    mockGroupApi("default");
    vi.mocked(getProfile).mockRejectedValue(new ApiError("x", 500));
    renderGroupRoute("/social/groups/new?groupRooms=1");
    expect(await screen.findByRole("button", { name: "수능" }, { timeout: 3000 })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("신원이 정해지기 전에는 프로필도 받지 않고 머문다", async () => {
    mockGroupApi("default");
    mockProfile({ category: null });
    stubPendingIdentity();
    const { router } = renderGroupRoute("/social/groups/new?groupRooms=1");
    await act(() => Promise.resolve());
    expect(router.location().pathname).toBe("/social/groups/new");
    expect(getProfile).not.toHaveBeenCalled();
  });
});

describe("그룹 설정", () => {
  it("그룹 설정은 지금 값으로 채우고 저장하면 그룹 홈으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10/settings?groupRooms=1");
    const name = await screen.findByRole("textbox", { name: "그룹 이름" });
    expect(name).toHaveValue("새벽 5시 기상 공시반");
    const user = userEvent.setup();
    await user.clear(name);
    await user.type(name, "새벽 공시반");
    await user.click(screen.getByRole("button", { name: "저장하기" }));
    expect(api.updateGroup).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ name: "새벽 공시반", category: "CIVIL_SERVICE" }),
    );
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10"));
    expect(await screen.findByRole("heading", { name: "새벽 공시반" })).toBeInTheDocument();
  });

  it("소개를 비우고 저장해도 소개를 빈 글로 함께 보낸다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/social/groups/10/settings?groupRooms=1");
    const intro = await screen.findByRole("textbox", { name: "그룹 소개" });
    expect(intro).toHaveValue(
      "매일 새벽 5시에 일어나서 2시간 이상 공부해요. 9급 행정직 준비생 환영해요.",
    );
    const user = userEvent.setup();
    await user.clear(intro);
    await user.click(screen.getByRole("button", { name: "저장하기" }));
    expect(api.updateGroup).toHaveBeenCalledWith(10, {
      name: "새벽 5시 기상 공시반",
      category: "CIVIL_SERVICE",
      description: "",
    });
  });

  it("그룹 홈에서 왔으면 저장한 뒤 그 그룹 홈으로 돌아간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10?groupRooms=1");
    await screen.findByRole("heading", { name: "새벽 5시 기상 공시반" });
    const homeKey = router.location().key;
    stubHistoryIndex(1);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "그룹 메뉴" }));
    await user.click(screen.getByRole("menuitem", { name: "그룹 설정" }));
    await user.click(await screen.findByRole("button", { name: "저장하기" }));
    await waitFor(() => expect(router.location().key).toBe(homeKey));
  });

  it("서버가 연락처로 막으면 연락처가 있는 칸 아래에 알리고 머문다", async () => {
    const api = mockGroupApi("default");
    api.updateGroup.mockRejectedValueOnce(new ApiError("x", 400, "CONTACT_NOT_ALLOWED"));
    const { router } = renderGroupRoute("/social/groups/10/settings?groupRooms=1");
    const name = await screen.findByRole("textbox", { name: "그룹 이름" });
    const user = userEvent.setup();
    await user.clear(name);
    await user.type(name, "공시반 dm kim123");
    await user.click(screen.getByRole("button", { name: "저장하기" }));
    await waitFor(() => expect(api.updateGroup).toHaveBeenCalledOnce());
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("연락처나 링크는 보낼 수 없어요")).toHaveLength(1);
    expect(router.location().pathname).toBe("/social/groups/10/settings");
  });

  it("그룹장이 아니면 그룹 설정을 열 수 없다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/11/settings?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/11"));
  });

  it("저장하다 그룹장이 바뀐 것을 알면 그룹 홈으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.updateGroup.mockRejectedValueOnce(new ApiError("x", 403, "NOT_GROUP_OWNER"));
    const { router } = renderGroupRoute("/social/groups/10/settings?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "저장하기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10"));
    expect(screen.queryByText("잠시 후 다시 시도해 주세요")).toBeNull();
  });

  it("받는 동안에는 뒤로 가기 줄과 자리표시를 둔다", async () => {
    const api = mockGroupApi("default");
    api.getGroupHome.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/10/settings?groupRooms=1");
    expect(await screen.findByRole("button", { name: "뒤로 가기" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
  });

  it("처음 받지 못하면 다시 시도를 두고 누르면 지금 값으로 채운다", async () => {
    const api = mockGroupApi("default");
    api.getGroupHome.mockRejectedValueOnce(new ApiError("x", 400, "BAD_REQUEST"));
    renderGroupRoute("/social/groups/10/settings?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("textbox", { name: "그룹 이름" })).toHaveValue(
      "새벽 5시 기상 공시반",
    );
  });

  it("멤버가 아니거나 사라진 그룹이면 그룹 탭으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.getGroupHome.mockRejectedValue(new ApiError("x", 404, "GROUP_NOT_FOUND"));
    const { router } = renderGroupRoute("/social/groups/10/settings?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(await screen.findByText("그룹을 찾을 수 없어요")).toBeInTheDocument();
  });

  it("신원이 정해지기 전에는 그룹을 받지 않고 머문다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    const { router } = renderGroupRoute("/social/groups/10/settings?groupRooms=1");
    await act(() => Promise.resolve());
    expect(router.location().pathname).toBe("/social/groups/10/settings");
    expect(api.getGroupHome).not.toHaveBeenCalled();
  });
});
