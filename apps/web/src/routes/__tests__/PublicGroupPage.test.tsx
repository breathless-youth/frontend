import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Amplitude from "@/lib/amplitude";
import { trackGroupRoomApplicationSent } from "@/lib/amplitude";
import { ApiError } from "@/lib/api";
import type * as UserId from "@/lib/userId";
import {
  mockGroupApi,
  renderGroupRoute,
  seedDetail,
  stubHistoryIndex,
  stubPendingIdentity,
} from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));
vi.mock("@/lib/amplitude", async (importOriginal) => ({
  ...(await importOriginal<typeof Amplitude>()),
  trackGroupRoomApplicationSent: vi.fn(),
}));

// 공개 그룹 보기, 신청하기, 그룹 홈은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/PublicGroupPage");
  await import("@/routes/ApplyPage");
  await import("@/routes/GroupHomePage");
});

afterEach(() => {
  vi.mocked(trackGroupRoomApplicationSent).mockClear();
});

describe("신청 계측", () => {
  it("신청을 보내면 그 그룹의 시험·목표만 계측하고 소개 글은 싣지 않는다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/public/13/apply?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "소개 글" }), "같이 공부해요");
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/public/13"));
    expect(trackGroupRoomApplicationSent).toHaveBeenCalledExactlyOnceWith({ category: "LANGUAGE" });
  });

  it("신청을 보내지 못하면 계측하지 않는다", async () => {
    const api = mockGroupApi("default");
    api.applyToGroup.mockRejectedValueOnce(new ApiError("x", 500));
    renderGroupRoute("/social/public/13/apply?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "소개 글" }), "같이 공부해요");
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(trackGroupRoomApplicationSent).not.toHaveBeenCalled();
  });
});

describe("공개 그룹 보기", () => {
  it("멤버인 그룹이면 그룹 홈으로 바꿔 간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/public/10?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10"));
  });

  it("신청할 수 없는 이유를 흐린 버튼 글자로 보인다", async () => {
    const api = mockGroupApi("default");
    api.getPublicGroup.mockResolvedValue({
      ...seedDetail(13),
      applyState: "UNAVAILABLE",
      unavailableReason: "APPLICATION_LIMIT",
    });
    renderGroupRoute("/social/public/13?groupRooms=1");
    expect(
      await screen.findByRole("button", { name: "신청은 3곳까지 보낼 수 있어요" }),
    ).toBeDisabled();
  });

  it("신청 취소는 확인 없이 하고 토스트를 띄운 뒤 다시 신청할 수 있다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/social/public/12?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "신청 취소" }));
    expect(api.cancelApplication).toHaveBeenCalledOnce();
    expect(await screen.findByText("신청을 취소했어요")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "신청하기" })).toBeEnabled();
  });

  it("그사이 없어진 신청을 취소하면 알리지 않고 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.cancelApplication.mockRejectedValueOnce(new ApiError("x", 404, "NOT_FOUND"));
    renderGroupRoute("/social/public/12?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "신청 취소" }));
    await waitFor(() => expect(api.getPublicGroup).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("잠시 후 다시 시도해 주세요")).toBeNull();
    expect(screen.queryByText("신청을 취소했어요")).toBeNull();
  });

  it("신청하기는 탭 조건을 뺀 주소로 그 그룹의 신청하기 화면을 연다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/public/13?groupRooms=1&tab=public");
    await userEvent.setup().click(await screen.findByRole("button", { name: "신청하기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/public/13/apply"));
    expect(router.location().search).toBe("?groupRooms=1");
  });

  it("받는 동안에는 뒤로 가기 줄과 자리표시를 둔다", async () => {
    const api = mockGroupApi("default");
    api.getPublicGroup.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/public/13?groupRooms=1");
    expect(await screen.findByRole("button", { name: "뒤로 가기" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
  });

  it("처음 받지 못하면 다시 시도를 두고 누르면 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.getPublicGroup.mockRejectedValueOnce(new ApiError("x", 400, "BAD_REQUEST"));
    renderGroupRoute("/social/public/13?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { name: "토익 900 주말반" })).toBeInTheDocument();
  });

  it("사라졌거나 비공개인 그룹이면 그룹 탭으로 돌아가 안내한다", async () => {
    const api = mockGroupApi("default");
    api.getPublicGroup.mockRejectedValue(new ApiError("x", 404, "GROUP_NOT_FOUND"));
    const { router } = renderGroupRoute("/social/public/13?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(await screen.findByText("그룹을 찾을 수 없어요")).toBeInTheDocument();
  });

  it("신원이 정해지기 전에는 그룹 탭으로 돌려보내지 않고 공개 그룹도 받지 않는다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    const { router } = renderGroupRoute("/social/public/13?groupRooms=1");
    await act(() => Promise.resolve());
    expect(router.location().pathname).toBe("/social/public/13");
    expect(api.getPublicGroup).not.toHaveBeenCalled();
  });
});

describe("신청하기", () => {
  it("신청을 보내면 공개 그룹 보기로 돌아가 신청 취소가 보인다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/public/13/apply?groupRooms=1");
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "소개 글" }),
      "새벽 5시에 일어나는 공시생이에요",
    );
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    expect(api.applyToGroup).toHaveBeenCalledWith(13, "새벽 5시에 일어나는 공시생이에요");
    await waitFor(() => expect(router.location().pathname).toBe("/social/public/13"));
    expect(await screen.findByRole("button", { name: "신청 취소" })).toBeInTheDocument();
  });

  it("공개 그룹 보기에서 왔으면 보낸 뒤 그 화면으로 돌아간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/public/13?groupRooms=1");
    const applyButton = await screen.findByRole("button", { name: "신청하기" });
    const detailKey = router.location().key;
    stubHistoryIndex(1);
    const user = userEvent.setup();
    await user.click(applyButton);
    await user.type(await screen.findByRole("textbox", { name: "소개 글" }), "같이 공부해요");
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    await waitFor(() => expect(router.location().key).toBe(detailKey));
    expect(await screen.findByRole("button", { name: "신청 취소" })).toBeInTheDocument();
  });

  it("서버가 연락처로 막으면 입력칸 아래에 같은 문구를 보이고 머물며 글을 고치면 사라진다", async () => {
    const api = mockGroupApi("default");
    api.applyToGroup.mockRejectedValueOnce(new ApiError("x", 400, "CONTACT_NOT_ALLOWED"));
    const { router } = renderGroupRoute("/social/public/13/apply?groupRooms=1");
    const user = userEvent.setup();
    const field = await screen.findByRole("textbox", { name: "소개 글" });
    await user.type(field, "같이 공부해요");
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("연락처나 링크는 보낼 수 없어요");
    expect(router.location().pathname).toBe("/social/public/13/apply");
    await user.type(field, "!");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("신청 한도에 걸리면 토스트 없이 공개 그룹 보기로 돌아가 이유를 버튼 글자로 보인다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/public/13/apply?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "소개 글" }), "같이 공부해요");
    api.applyToGroup.mockRejectedValueOnce(new ApiError("x", 409, "GROUP_SLOT_LIMIT"));
    api.getPublicGroup.mockResolvedValue({
      ...seedDetail(13),
      applyState: "UNAVAILABLE",
      unavailableReason: "GROUP_SLOT_LIMIT",
    });
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/public/13"));
    expect(
      await screen.findByRole("button", { name: "그룹과 신청을 합쳐 5개까지예요" }),
    ).toBeDisabled();
    expect(screen.getAllByText("그룹과 신청을 합쳐 5개까지예요")).toHaveLength(1);
  });

  it("이미 신청한 그룹이면 알리지 않고 공개 그룹 보기로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.applyToGroup.mockRejectedValueOnce(new ApiError("x", 409, "ALREADY_APPLIED"));
    const { router } = renderGroupRoute("/social/public/13/apply?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "소개 글" }), "같이 공부해요");
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/public/13"));
    expect(screen.queryByText("잠시 후 다시 시도해 주세요")).toBeNull();
  });

  it("그 밖의 이유로 보내지 못하면 토스트를 띄우고 쓴 소개를 남긴 채 머문다", async () => {
    const api = mockGroupApi("default");
    api.applyToGroup.mockRejectedValueOnce(new ApiError("x", 500));
    const { router } = renderGroupRoute("/social/public/13/apply?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "소개 글" }), "같이 공부해요");
    await user.click(screen.getByRole("button", { name: "신청 보내기" }));
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(router.location().pathname).toBe("/social/public/13/apply");
    expect(screen.getByRole("textbox", { name: "소개 글" })).toHaveValue("같이 공부해요");
  });

  it("신청 보내기를 두 번 눌러도 한 번만 보낸다", async () => {
    const api = mockGroupApi("default");
    api.applyToGroup.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/public/13/apply?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "소개 글" }), "같이 공부해요");
    await user.dblClick(screen.getByRole("button", { name: "신청 보내기" }));
    expect(api.applyToGroup).toHaveBeenCalledOnce();
  });

  it("신원이 정해지기 전에는 공개 그룹을 받지 않고 머문다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    const { router } = renderGroupRoute("/social/public/13/apply?groupRooms=1");
    await act(() => Promise.resolve());
    expect(router.location().pathname).toBe("/social/public/13/apply");
    expect(api.getPublicGroup).not.toHaveBeenCalled();
  });
});
