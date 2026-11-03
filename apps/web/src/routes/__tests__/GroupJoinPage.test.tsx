import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";

import { openInApp } from "@/features/social-room/appHandoff";
import type * as AppHandoff from "@/features/social-room/appHandoff";
import { ApiError } from "@/lib/api";
import { haptic } from "@/lib/haptics";
import type * as UserId from "@/lib/userId";
import { mockGroupApi, renderGroupRoute, stubPendingIdentity } from "@/test/groupRouteHarness";

vi.mock("@/lib/groupRoomApi");
vi.mock("@/lib/haptics", () => ({ haptic: vi.fn() }));
vi.mock("@/lib/userId", async (importOriginal) => ({
  ...(await importOriginal<typeof UserId>()),
  useUserId: vi.fn(() => 1),
  useIdentityPending: vi.fn(() => false),
}));
vi.mock("@/features/social-room/appHandoff", async (importOriginal) => ({
  ...(await importOriginal<typeof AppHandoff>()),
  openInApp: vi.fn(),
}));

/** 참여 화면의 보내는 버튼이고 6자리 입력 화면 테스트의 이름과 같다. */
const JOIN_LABEL = "참여하기";

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_KAKAO_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) KAKAOTALK 10.5.0";

/** 앱 밖 브라우저처럼 브리지 없이 사용자 에이전트만 바꾸고 테스트가 끝나면 되돌린다. */
function stubUserAgent(userAgent: string): void {
  Object.defineProperty(navigator, "userAgent", { value: userAgent, configurable: true });
  onTestFinished(() => {
    Reflect.deleteProperty(navigator, "userAgent");
  });
}

const stubIosSafari = () => stubUserAgent(IPHONE_SAFARI_UA);

// 참여한 뒤 여는 그룹 홈은 나눠 받는 화면이라 전체 스위트 부하에서 첫 그리기가 findBy 기본 1초를 넘지 않게 미리 받아 둔다.
beforeAll(async () => {
  await import("@/routes/GroupHomePage");
});

describe("6자리 초대코드 참여", () => {
  it("표시가 있고 코드가 없으면 6자리 입력이다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/social/join?groupRooms=1");
    await userEvent.setup().type(await screen.findByRole("textbox"), "k7q2mx");
    expect(screen.getByRole("textbox")).toHaveValue("K7Q2MX");
  });

  it("표시가 있어도 숫자 4자리 링크는 예전 방 참여다", async () => {
    mockGroupApi("default");
    renderGroupRoute("/social/join?groupRooms=1&code=3712");
    expect(await screen.findByTestId("invite-code-join-page")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("3712");
  });

  it("링크로 연 6자리 코드는 LINK로 보내고 초대코드를 뺀 주소로 그룹 홈에 간다", async () => {
    const api = mockGroupApi("default");
    const { router } = renderGroupRoute("/social/join?groupRooms=1&code=K7Q2MX");
    await userEvent.setup().click(await screen.findByRole("button", { name: JOIN_LABEL }));
    expect(api.joinGroupByCode).toHaveBeenCalledWith("K7Q2MX", "LINK");
    await waitFor(() => expect(router.location().pathname).toBe("/social/groups/11"));
    expect(router.location().search).toBe("?groupRooms=1");
  });

  it("직접 고친 코드는 CODE로 보낸다", async () => {
    const api = mockGroupApi("default");
    renderGroupRoute("/social/join?groupRooms=1&code=K7Q2MA");
    const user = userEvent.setup();
    const input = await screen.findByRole("textbox");
    await user.clear(input);
    await user.type(input, "K7Q2MX");
    await user.click(screen.getByRole("button", { name: JOIN_LABEL }));
    expect(api.joinGroupByCode).toHaveBeenCalledWith("K7Q2MX", "CODE");
  });

  it.each([
    ["INVITE_CODE_NOT_FOUND", 404, "초대코드를 다시 확인해 주세요"],
    ["GROUP_FULL", 409, "자리가 다 찼어요"],
    ["RECENTLY_KICKED", 409, "내보내진 그룹에는 3일 동안 다시 들어갈 수 없어요"],
    ["GROUP_SLOT_LIMIT", 409, "이미 5개의 그룹을 가지고 있어요"],
  ] as const)("%s면 진동과 함께 입력칸 아래에 한 문장을 보인다", async (code, status, copy) => {
    const api = mockGroupApi("default");
    api.joinGroupByCode.mockRejectedValueOnce(new ApiError("x", status, code));
    vi.mocked(haptic).mockClear();
    renderGroupRoute("/social/join?groupRooms=1&code=K7Q2MX");
    await userEvent.setup().click(await screen.findByRole("button", { name: JOIN_LABEL }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
    expect(haptic).toHaveBeenCalledWith("medium");
  });

  it("코드를 고치면 입력칸 아래 오류가 사라지고 머문다", async () => {
    const api = mockGroupApi("default");
    api.joinGroupByCode.mockRejectedValueOnce(new ApiError("x", 404, "INVITE_CODE_NOT_FOUND"));
    const { router } = renderGroupRoute("/social/join?groupRooms=1&code=K7Q2MA");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: JOIN_LABEL }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(router.location().pathname).toBe("/social/join");
    await user.type(screen.getByRole("textbox"), "{Backspace}");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("참여를 두 번 눌러도 한 번만 보낸다", async () => {
    const api = mockGroupApi("default");
    api.joinGroupByCode.mockImplementation(() => new Promise(() => {}));
    renderGroupRoute("/social/join?groupRooms=1&code=K7Q2MX");
    await userEvent.setup().dblClick(await screen.findByRole("button", { name: JOIN_LABEL }));
    expect(api.joinGroupByCode).toHaveBeenCalledOnce();
  });

  it("앞 화면이 없으면 뒤로 가기는 그룹 탭으로 간다", async () => {
    mockGroupApi("default");
    const { router } = renderGroupRoute("/social/join?groupRooms=1&code=K7Q2MX");
    await userEvent.setup().click(await screen.findByRole("button", { name: "뒤로 가기" }));
    await waitFor(() => expect(router.location().pathname).toBe("/social"));
    expect(router.location().search).toBe("?groupRooms=1");
  });

  it("신원이 정해지기 전에는 그리지 않고 참여도 보내지 않는다", async () => {
    const api = mockGroupApi("default");
    stubPendingIdentity();
    renderGroupRoute("/social/join?groupRooms=1&code=K7Q2MX");
    await act(() => Promise.resolve());
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(api.joinGroupByCode).not.toHaveBeenCalled();
  });

  it("브라우저에서 연 6자리 초대 링크는 앱에서 참여하기에 코드를 보인다", async () => {
    stubIosSafari();
    renderGroupRoute("/social/join?code=K7Q2MX");
    const code = await screen.findByRole("group", { name: "초대코드 K7Q2MX" });
    expect(within(code).getAllByText(/^[A-Z0-9]$/)).toHaveLength(6);
    await userEvent.setup().click(screen.getByRole("button", { name: "앱에서 참여하기" }));
    expect(openInApp).toHaveBeenCalledWith("ios", "K7Q2MX");
  });

  it("인앱 브라우저로 연 6자리 초대 링크는 처음 열 때 그 코드로 앱을 연다", async () => {
    stubUserAgent(IPHONE_KAKAO_UA);
    vi.mocked(openInApp).mockClear();
    renderGroupRoute("/social/join?code=K7Q2MX");
    await screen.findByRole("group", { name: "초대코드 K7Q2MX" });
    expect(openInApp).toHaveBeenCalledOnce();
    expect(openInApp).toHaveBeenCalledWith("ios", "K7Q2MX");
  });
});
