import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import type * as UserId from "@/lib/userId";
import { mockGroupApi, renderGroupRoute, stubPendingIdentity } from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));

// 신청 확인, 신청 신고, 그룹 홈은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/GroupApplicationsPage");
  await import("@/routes/ReportApplicationPage");
  await import("@/routes/GroupHomePage");
});

describe("신청 확인", () => {
  it("수락하면 신청 목록과 그룹 홈을 다시 받는다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    expect(await screen.findByText("새벽 5시 기상 공시반 · 남은 자리 2")).toBeInTheDocument();
    await userEvent.setup().click(screen.getAllByRole("button", { name: "수락" })[0]!);
    expect(api.acceptApplication).toHaveBeenCalledOnce();
    await waitFor(() => expect(api.getGroupApplications).toHaveBeenCalledTimes(2));
    expect(api.getGroupHome.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText("새벽 5시 기상 공시반 · 남은 자리 1")).toBeInTheDocument();
  });

  it("자리가 다 찼다는 응답이면 토스트를 띄운다", async () => {
    const api = mockGroupApi("default");
    api.acceptApplication.mockRejectedValueOnce(new ApiError("x", 409, "GROUP_FULL"));
    renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    await userEvent.setup().click((await screen.findAllByRole("button", { name: "수락" }))[0]!);
    expect(await screen.findByText("자리가 다 찼어요")).toBeInTheDocument();
  });

  it("이미 처리된 신청이면 알림 없이 목록을 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.declineApplication.mockRejectedValueOnce(new ApiError("x", 409, "APPLICATION_NOT_PENDING"));
    renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    await userEvent.setup().click((await screen.findAllByRole("button", { name: "거절" }))[0]!);
    await waitFor(() => expect(api.getGroupApplications).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("잠시 후 다시 시도해 주세요")).toBeNull();
  });

  it("답을 보내는 동안에는 다른 신청의 수락과 거절도 받지 않는다", async () => {
    const api = mockGroupApi("default");
    api.acceptApplication.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: "수락" }))[0]!);
    await user.click(screen.getAllByRole("button", { name: "거절" })[1]!);
    await user.click(screen.getAllByRole("button", { name: "수락" })[1]!);
    expect(api.acceptApplication).toHaveBeenCalledOnce();
    expect(api.declineApplication).not.toHaveBeenCalled();
    expect(screen.getAllByRole("button", { name: "거절" })[0]).toBeDisabled();
  });

  it("신청을 받는 동안에는 신청이 없다는 문장 대신 자리표시를 둔다", async () => {
    const api = mockGroupApi("default");
    api.getGroupApplications.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    expect(await screen.findByText("새벽 5시 기상 공시반 · 남은 자리 2")).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("답을 기다리는 신청이 없어요")).toBeNull();
  });

  it("신청을 처음 받지 못하면 다시 시도를 두고 누르면 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.getGroupApplications.mockRejectedValueOnce(new ApiError("x", 400, "BAD_REQUEST"));
    renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findAllByRole("button", { name: "수락" })).toHaveLength(2);
  });

  it("신고는 사유와 함께 보내고 신청 확인으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: "신고" }))[0]!);
    await user.type(await screen.findByRole("textbox", { name: "신고 사유" }), "광고 글이에요");
    await user.click(screen.getByRole("button", { name: "신고하기" }));
    expect(api.reportApplication).toHaveBeenCalledWith(expect.any(Number), "광고 글이에요");
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10/applications"));
    expect(await screen.findAllByRole("button", { name: "수락" })).toHaveLength(1);
  });

  it("그룹장이 아니면 그룹 홈으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.getGroupApplications.mockRejectedValue(new ApiError("x", 403, "NOT_GROUP_OWNER"));
    const { router } = renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10"));
  });

  it("답하다 그룹장이 바뀐 것을 알면 그룹 홈으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.acceptApplication.mockRejectedValueOnce(new ApiError("x", 403, "NOT_GROUP_OWNER"));
    const { router } = renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    await userEvent.setup().click((await screen.findAllByRole("button", { name: "수락" }))[0]!);
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10"));
  });

  it("멤버가 아니거나 사라진 그룹이면 그룹 탭으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.getGroupApplications.mockRejectedValue(new ApiError("x", 404, "GROUP_NOT_FOUND"));
    const { router } = renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(await screen.findByText("그룹을 찾을 수 없어요")).toBeInTheDocument();
  });

  it("신원이 정해지기 전에는 신청을 받지 않는다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    renderGroupRoute("/social/groups/10/applications?groupRooms=1");
    await act(() => Promise.resolve());
    expect(api.getGroupApplications).not.toHaveBeenCalled();
    expect(api.getGroupHome).not.toHaveBeenCalled();
  });
});

describe("신청 신고", () => {
  it("바로 열어도 신청 목록에서 닉네임을 찾아 보인다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/social/groups/10/applications/41/report?groupRooms=1");
    expect(await screen.findByText("밤샘토끼님의 신청을 신고할게요")).toBeInTheDocument();
  });

  it("목록에 없는 신청이면 신청 확인으로 돌아간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/groups/10/applications/999/report?groupRooms=1");
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10/applications"));
  });

  it("서버가 연락처로 막으면 입력칸 아래에 같은 문구를 보이고 머문다", async () => {
    const api = mockGroupApi("default");
    api.reportApplication.mockRejectedValueOnce(new ApiError("x", 400, "CONTACT_NOT_ALLOWED"));
    const { router } = renderGroupRoute("/social/groups/10/applications/41/report?groupRooms=1");
    const user = userEvent.setup();
    const field = await screen.findByRole("textbox", { name: "신고 사유" });
    await user.type(field, "카톡 이야기");
    await user.click(screen.getByRole("button", { name: "신고하기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("연락처나 링크는 보낼 수 없어요");
    expect(router.location().pathname).toBe("/social/groups/10/applications/41/report");
    await user.type(field, "요");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("이미 처리된 신청을 신고하면 알림 없이 신청 확인으로 돌아간다", async () => {
    const api = mockGroupApi("default");
    api.reportApplication.mockRejectedValueOnce(new ApiError("x", 409, "APPLICATION_NOT_PENDING"));
    const { router } = renderGroupRoute("/social/groups/10/applications/41/report?groupRooms=1");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "신고하기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/10/applications"));
    expect(screen.queryByText("잠시 후 다시 시도해 주세요")).toBeNull();
  });

  it("보내지 못하면 토스트를 띄우고 쓴 사유를 남긴 채 머문다", async () => {
    const api = mockGroupApi("default");
    api.reportApplication.mockRejectedValueOnce(new ApiError("x", 500));
    const { router } = renderGroupRoute("/social/groups/10/applications/41/report?groupRooms=1");
    const user = userEvent.setup();
    await user.type(await screen.findByRole("textbox", { name: "신고 사유" }), "광고 글이에요");
    await user.click(screen.getByRole("button", { name: "신고하기" }));
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(router.location().pathname).toBe("/social/groups/10/applications/41/report");
    expect(within(screen.getByTestId("write-screen")).getByRole("textbox")).toHaveValue(
      "광고 글이에요",
    );
  });
});
