import { act, screen, waitFor } from "@testing-library/react";
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

// 차단 목록은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/BlockListPage");
});

describe("차단 목록", () => {
  it("차단한 사람을 차단한 순서대로 보이고 누구를 푸는지 닉네임을 붙인다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/blocks?groupRooms=1");
    const buttons = await screen.findAllByRole("button", { name: "차단 해제" });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleDescription("새벽러");
    expect(buttons[1]).toHaveAccessibleDescription("커피두잔");
  });

  it("차단 해제는 확인 없이 하고 그 줄이 사라진다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/blocks?groupRooms=1");
    const before = await screen.findAllByRole("button", { name: /차단 해제/ });
    await userEvent.setup().click(before[0]!);
    expect(api.unblockUser).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: /차단 해제/ })).toHaveLength(
        before.length - 1,
      ),
    );
    expect(screen.queryByText("새벽러")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("푸는 동안에는 그 줄의 버튼만 막고 다른 줄의 해제도 받지 않는다", async () => {
    const api = mockGroupApi("default");
    api.unblockUser.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/blocks?groupRooms=1");
    const user = userEvent.setup();
    const buttons = await screen.findAllByRole("button", { name: "차단 해제" });
    await user.click(buttons[0]!);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[1]).toBeEnabled();
    await user.click(buttons[1]!);
    expect(api.unblockUser).toHaveBeenCalledOnce();
  });

  it("풀지 못하면 토스트로 알리고 줄을 남긴다", async () => {
    const api = mockGroupApi("default");
    api.unblockUser.mockRejectedValueOnce(new ApiError("x", 500));
    renderGroupRoute("/blocks?groupRooms=1");
    await userEvent
      .setup()
      .click((await screen.findAllByRole("button", { name: "차단 해제" }))[0]!);
    expect(await screen.findByText("잠시 후 다시 시도해 주세요")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "차단 해제" })).toHaveLength(2);
  });

  it("차단한 사람이 없으면 없다고 보인다", async () => {
    mockGroupApi("empty");
    renderGroupRoute("/blocks?groupRooms=1");
    expect(await screen.findByText("차단한 사람이 없어요")).toBeInTheDocument();
  });

  it("받는 동안에는 없다는 문장 대신 자리표시를 둔다", async () => {
    const api = mockGroupApi("default");
    api.getBlocks.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/blocks?groupRooms=1");
    expect(await screen.findByRole("heading", { name: "차단 목록" })).toBeInTheDocument();
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("차단한 사람이 없어요")).toBeNull();
  });

  it("처음 받지 못하면 다시 시도를 두고 누르면 다시 받는다", async () => {
    const api = mockGroupApi("default");
    api.getBlocks.mockRejectedValueOnce(new ApiError("x", 400, "BAD_REQUEST"));
    renderGroupRoute("/blocks?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "다시 시도" }));
    expect(await screen.findAllByRole("button", { name: "차단 해제" })).toHaveLength(2);
  });

  it("앞 화면이 없으면 뒤로 가기는 쿼리를 이어받아 설정으로 간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/blocks?groupRooms=1");
    await userEvent.setup().click(await screen.findByRole("button", { name: "뒤로 가기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/settings"));
    expect(router.location().search).toBe("?groupRooms=1");
  });

  it("신원이 정해지기 전에는 그리지 않고 차단 목록도 받지 않는다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    renderGroupRoute("/blocks?groupRooms=1");
    await act(() => Promise.resolve());
    expect(screen.queryByRole("heading", { name: "차단 목록" })).toBeNull();
    expect(api.getBlocks).not.toHaveBeenCalled();
  });
});
